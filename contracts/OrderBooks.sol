// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "./library/RBTLibrary.sol";
import "./library/Bytes32LinkedListLibrary.sol";
import "./library/UtilsLibrary.sol";

import "./interfaces/ITradePairs.sol";

/**
 * @title Central Limit Order Books
 * @notice This contract implements Central Limit Order Books with price and time priority
 * interacting with the underlying Red-Black-Tree.
 * @dev For each trade pair two order books are added to orderBookMap: buyBook and sellBook.
 * The naming convention for the order books is as follows: TRADEPAIRNAME-BUYBOOK and TRADEPAIRNAME-SELLBOOK.
 * For trade pair AVAX/USDT the order books are AVAX/USDT-BUYBOOK and AVAX/USDT-SELLBOOK.
 * TradePairs should have EXECUTOR_ROLE in OrderBooks.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract OrderBooks is Initializable, AccessControlEnumerableUpgradeable {
    using RBTLibrary for RBTLibrary.Tree;
    using Bytes32LinkedListLibrary for Bytes32LinkedListLibrary.LinkedList;
    // version
    bytes32 public constant VERSION = bytes32("2.2.0");

    // orderbook structure defining one sell or buy book
    struct OrderBook {
        mapping(uint256 => Bytes32LinkedListLibrary.LinkedList) orderList;
        RBTLibrary.Tree orderBook;
        ITradePairs.Side side; // BuyBook or SellBook
    }
    // mapping from bytes32("AVAX/USDT-BUYBOOK") or bytes32("AVAX/USDT-SELLBOOK") to orderBook
    mapping(bytes32 => OrderBook) private orderBookMap;

    ITradePairs private tradePairs;
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    event TradePairsSet(address _oldTradePairs, address _newTradePairs);

    /**
     * @notice  Initializer for upgradeable contract.
     */
    function initialize() public initializer {
        __AccessControlEnumerable_init();
        // initialize deployment account to have DEFAULT_ADMIN_ROLE
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice  Sets trade pairs contract
     * @param   _tradePairs  address of the trade pairs contract
     */
    function setTradePairs(address _tradePairs) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (hasRole(EXECUTOR_ROLE, address(tradePairs))) revokeRole(EXECUTOR_ROLE, address(tradePairs));
        grantRole(EXECUTOR_ROLE, _tradePairs);
        emit TradePairsSet(address(tradePairs), _tradePairs);
        tradePairs = ITradePairs(_tradePairs);
    }

    /**
     * @return  ITradePairs  trade pairs contract
     */
    function getTradePairs() external view returns (ITradePairs) {
        return tradePairs;
    }

    /**
     * @notice  Adds OrderBook with its side
     * @param   _orderBookID  Order Book ID assigned by the tradePairs based on the tradepair symbol
     * @param   _side  BuyBook or SellBook
     */
    function addToOrderbooks(bytes32 _orderBookID, ITradePairs.Side _side) external onlyRole(EXECUTOR_ROLE) {
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        orderBook.side = _side;
    }

    /**
     * @param   _orderBookID  Order book ID
     * @return  price  Root price
     */
    function root(bytes32 _orderBookID) private view returns (uint256 price) {
        price = orderBookMap[_orderBookID].orderBook.root;
    }

    /**
     * @dev     if it is SellBook it will return the best Ask
     * @param   _orderBookID  Order book ID
     * @return  price  Lowest price in the orderbook
     */
    function first(bytes32 _orderBookID) private view returns (uint256 price) {
        price = orderBookMap[_orderBookID].orderBook.first();
    }

    /**
     * @dev     if it is BuyBook it will return the best Bid
     * @param   _orderBookID  Order book ID
     * @return  price  Highest price in the orderbook
     */
    function last(bytes32 _orderBookID) private view returns (uint256 price) {
        price = orderBookMap[_orderBookID].orderBook.last();
    }

    /**
     * @notice  Returns the Best Bid or Best ASK depending on the OrderBook side
     * @param   _orderBookID   Order book ID
     * @return  price  Best Bid or Best ASK
     */
    function bestPrice(bytes32 _orderBookID) external view returns (uint256 price) {
        return orderBookMap[_orderBookID].side == ITradePairs.Side.BUY ? last(_orderBookID) : first(_orderBookID);
    }

    /**
     * @notice  Returns the OrderId of the Best Bid or Best ASK depending on the OrderBook side
     * @param   _orderBookID   Order book ID
     * @return  price  Best Bid or Best ASK
     * @return  orderId  Order Id of the Best Bid or Best ASK
     */
    function getTopOfTheBook(bytes32 _orderBookID) external view returns (uint256 price, bytes32 orderId) {
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        price = orderBook.side == ITradePairs.Side.BUY ? orderBook.orderBook.last() : orderBook.orderBook.first();
        (, orderId, ) = orderBook.orderList[price].getNode("");
    }

    /**
     * @notice  Returns the OrderId of the Worst Bid or Worst ASK depending on the OrderBook side
     * @dev     Called by TradePairs UnsolicitedCancel
     * @param   _orderBookID   Order book ID
     * @return  price  Worst Bid or Worst ASK
     * @return  orderId  Order Id of the Worst Bid or Worst ASK
     */
    function getBottomOfTheBook(bytes32 _orderBookID) external view returns (uint256 price, bytes32 orderId) {
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        price = orderBook.side == ITradePairs.Side.BUY ? orderBook.orderBook.first() : orderBook.orderBook.last();
        (, orderId, ) = orderBook.orderList[price].getNode("");
    }

    /**
     * @notice  Shows if any orders in the orderbook is crossed. Only relevant for auction orders
     * @dev     Returns True if one of the orderbooks is empty
     * @param   _sellBookId  Sell Order book ID
     * @param   _buyBookId  Buy Order book ID
     * @return  bool True if orderbook is not crossed and clear
     */
    function isNotCrossedBook(bytes32 _sellBookId, bytes32 _buyBookId) external view returns (bool) {
        return
            this.bestPrice(_sellBookId) == 0 ||
            this.bestPrice(_buyBookId) == 0 ||
            this.bestPrice(_sellBookId) > this.bestPrice(_buyBookId);
    }

    /**
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @return  price  Price next to the price
     */
    function next(bytes32 _orderBookID, uint256 _price) private view returns (uint256 price) {
        price = orderBookMap[_orderBookID].orderBook.next(_price);
    }

    /**
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @return  price  Price previous to the price
     */
    function prev(bytes32 _orderBookID, uint256 _price) private view returns (uint256 price) {
        price = orderBookMap[_orderBookID].orderBook.prev(_price);
    }

    /**
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @return  doesExist  True if price exists
     */
    function exists(bytes32 _orderBookID, uint256 _price) external view returns (bool doesExist) {
        doesExist = orderBookMap[_orderBookID].orderBook.exists(_price);
    }

    /**
     * @dev     used for getting red-black-tree details in debugging
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @return  price  Price
     * @return  parent  Parent price
     * @return  left  Left price
     * @return  right  Right price
     * @return  red  True if red
     * @return  head  Head price
     * @return  size  Size of the tree
     */
    function getNode(
        bytes32 _orderBookID,
        uint256 _price
    )
        external
        view
        returns (uint256 price, uint256 parent, uint256 left, uint256 right, bool red, bytes32 head, uint256 size)
    {
        OrderBook storage orderBookStruct = orderBookMap[_orderBookID];
        if (orderBookStruct.orderBook.exists(_price)) {
            (price, parent, left, right, red) = orderBookStruct.orderBook.getNode(_price);
            (, head, ) = orderBookStruct.orderList[_price].getNode("");
            size = orderBookStruct.orderList[_price].sizeOf();
            return (price, parent, left, right, red, head, size);
        }
    }

    /**
     * @dev     Used for getting the quantities in linked list of orders at a price
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @return  uint256[]  Quantities
     */
    function getQuantitiesAtPrice(bytes32 _orderBookID, uint256 _price) external view returns (uint256[] memory) {
        (, , , , , bytes32 head, uint256 size) = this.getNode(_orderBookID, _price);
        uint256[] memory quantities = new uint256[](size);
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        for (uint256 i = 0; i < size; i++) {
            quantities[i] = tradePairs.getOrderRemainingQuantity(head);
            (, head) = orderBook.orderList[_price].getAdjacent(head, false);
        }
        return quantities;
    }

    /**
     * @notice  Next price from a tree of prices
     * @param   _orderBookID  Order book ID
     * @param   _side  Side
     * @param   _price  Price
     * @return  price  Next price
     */
    function nextPrice(
        bytes32 _orderBookID,
        ITradePairs.Side _side,
        uint256 _price
    ) external view returns (uint256 price) {
        if (_price == 0) {
            price = _side == ITradePairs.Side.BUY ? last(_orderBookID) : first(_orderBookID);
        } else {
            price = _side == ITradePairs.Side.BUY ? prev(_orderBookID, _price) : next(_orderBookID, _price);
        }
    }

    /**
     * @notice  Used for getting head of the linked list of orders at a price
     * @dev `( , bytes32 head) = orderBookMap[_orderBookID].orderList[price].getAdjacent('', false)`
     * will give the Same result as this function
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @return  head  The id of the earliest order entered at the price level.
     */
    function getHead(bytes32 _orderBookID, uint256 _price) external view returns (bytes32 head) {
        (, head, ) = orderBookMap[_orderBookID].orderList[_price].getNode("");
    }

    /**
     * @notice  Get next order at a price from linked list of orders
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @param   _orderId  Order ID
     * @return  nextId  Next order ID
     */
    function nextOrder(bytes32 _orderBookID, uint256 _price, bytes32 _orderId) external view returns (bytes32 nextId) {
        (, nextId) = orderBookMap[_orderBookID].orderList[_price].getAdjacent(_orderId, false);
    }

    /**
     * @notice  Used for getting number of price levels on an order book
     * @param   _orderBookID  Order book ID
     * @return  uint256  Number of price levels
     */
    function getBookSize(bytes32 _orderBookID) external view returns (uint256) {
        uint256 price = first(_orderBookID);
        uint256 i;
        while (price > 0) {
            i++;
            price = next(_orderBookID, price);
        }
        return i;
    }

    /**
     * @notice  Get all orders at N price levels
     * @param   _orderBookID  Order book ID
     * @param   _nPrice  Number of price levels
     * @param   _nOrder  Number of orders
     * @param   _lastPrice  Last price
     * @param   _lastOrder  Last order
     * @return  prices  Prices
     * @return  quantities  Quantities
     * @return  uint256  Last price
     * @return  bytes32  Last order
     */
    function getNOrders(
        bytes32 _orderBookID,
        uint256 _nPrice,
        uint256 _nOrder,
        uint256 _lastPrice,
        bytes32 _lastOrder
    ) external view returns (uint256[] memory prices, uint256[] memory quantities, uint256, bytes32) {
        if ((_nPrice == 0) || (root(_orderBookID) == 0) || (_lastPrice > 0 && !this.exists(_orderBookID, _lastPrice))) {
            return (new uint256[](1), new uint256[](1), _lastPrice, _lastOrder);
        }
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        ITradePairs.Side side = orderBook.side;

        if (_lastPrice == 0) {
            _lastPrice = (side == ITradePairs.Side.SELL) ? first(_orderBookID) : last(_orderBookID);
        }
        prices = new uint256[](_nPrice);
        quantities = new uint256[](_nPrice);

        uint256 i;

        while (_lastPrice > 0 && i < _nPrice && _nOrder > 0) {
            prices[i] = _lastPrice;
            (, _lastOrder) = orderBook.orderList[_lastPrice].getAdjacent(_lastOrder, false);
            while (_lastOrder != "" && _nOrder > 0) {
                quantities[i] += tradePairs.getOrderRemainingQuantity(_lastOrder);
                (, _lastOrder) = orderBook.orderList[_lastPrice].getAdjacent(_lastOrder, false);
                _nOrder--;
            }
            if (_nOrder <= 0 && _lastOrder != "") {
                //Last Order not processed, need to revert to last processed order
                (, _lastOrder) = orderBook.orderList[_lastPrice].getAdjacent(_lastOrder, true);
                break;
            }
            _lastPrice = (side == ITradePairs.Side.SELL)
                ? next(_orderBookID, _lastPrice)
                : prev(_orderBookID, _lastPrice);
            i++;
        }
        return (prices, quantities, _lastPrice, _lastOrder);
    }

    /**
     * @dev     **Deprecated**. Use getNOrders instead. This is implemented with an unbound loop.
     * This function will run out of gas when retreiving big orderbook data.
     * @param   _orderBookID  Order book ID
     * @param   _n  Number of order to return
     * @param   _type  Type
     * @return  uint256[]  Prices
     * @return  uint256[]  Quantities
     */
    function getNOrdersOld(
        bytes32 _orderBookID,
        uint256 _n,
        uint256 _type
    ) external view returns (uint256[] memory, uint256[] memory) {
        // get lowest (_type=0) or highest (_type=1) _n orders as tuples of price, quantity
        if ((_n == 0) || (root(_orderBookID) == 0)) {
            return (new uint256[](1), new uint256[](1));
        }
        uint256[] memory prices = new uint256[](_n);
        uint256[] memory quantities = new uint256[](_n);
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        uint256 price = (_type == 0) ? first(_orderBookID) : last(_orderBookID);
        uint256 i;
        while (price > 0 && i < _n) {
            prices[i] = price;
            (bool ex, bytes32 a) = orderBook.orderList[price].getAdjacent("", true);
            while (a != "") {
                quantities[i] += tradePairs.getOrderRemainingQuantity(a);
                (ex, a) = orderBook.orderList[price].getAdjacent(a, true);
            }
            i++;
            price = (_type == 0) ? next(_orderBookID, price) : prev(_orderBookID, price);
        }
        return (prices, quantities);
    }

    /**
     * @notice  Match orders
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @param   _takerOrderRemainingQuantity  Remaining quantity of the taker order
     * @param   _makerOrderRemainingQuantity  Remaining quantity of the maker order
     * @return  uint256  Matched quantity
     */
    function matchTrade(
        bytes32 _orderBookID,
        uint256 _price,
        uint256 _takerOrderRemainingQuantity,
        uint256 _makerOrderRemainingQuantity
    ) external onlyRole(EXECUTOR_ROLE) returns (uint256) {
        uint256 quantity;
        quantity = UtilsLibrary.min(_takerOrderRemainingQuantity, _makerOrderRemainingQuantity);
        if ((_makerOrderRemainingQuantity - quantity) == 0) {
            // this order has been filled. it can be removed from the orderbook
            removeFirstOrderPrivate(_orderBookID, _price);
        }
        return quantity;
    }

    /**
     * @notice  Add order to order book
     * @dev     Make SURE the Quantity Check ( order remaining quantity > 0) is done before calling this function
     * @param   _orderBookID  Order book ID
     * @param   _orderUid  Order UID
     * @param   _price  Price
     */
    function addOrder(bytes32 _orderBookID, bytes32 _orderUid, uint256 _price) external onlyRole(EXECUTOR_ROLE) {
        if (!this.exists(_orderBookID, _price)) {
            orderBookMap[_orderBookID].orderBook.insert(_price);
        }
        orderBookMap[_orderBookID].orderList[_price].push(_orderUid, true);
    }

    /**
     * @notice Removes order from order book
     * @param   _orderBookID  Order book ID
     * @param   _orderUid  Order UID
     * @param   _price  Price
     */
    function removeOrder(bytes32 _orderBookID, bytes32 _orderUid, uint256 _price) external onlyRole(EXECUTOR_ROLE) {
        orderBookMap[_orderBookID].orderList[_price].remove(_orderUid);
        if (!orderBookMap[_orderBookID].orderList[_price].listExists()) {
            orderBookMap[_orderBookID].orderBook.remove(_price);
        }
    }

    /**
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     * @return  bool  True if exists
     */
    function orderListExists(
        bytes32 _orderBookID,
        uint256 _price
    ) external view onlyRole(EXECUTOR_ROLE) returns (bool) {
        return orderBookMap[_orderBookID].orderList[_price].listExists();
    }

    /**
     * @notice  Removes the first order from the order book called by Auction Process
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     */
    function removeFirstOrder(bytes32 _orderBookID, uint256 _price) external onlyRole(EXECUTOR_ROLE) {
        removeFirstOrderPrivate(_orderBookID, _price);
    }

    /**
     * @notice  Removes the first order from the order book
     * @param   _orderBookID  Order book ID
     * @param   _price  Price
     */
    function removeFirstOrderPrivate(bytes32 _orderBookID, uint256 _price) private {
        if (orderBookMap[_orderBookID].orderList[_price].listExists()) {
            orderBookMap[_orderBookID].orderList[_price].pop(false);
        }
        if (!orderBookMap[_orderBookID].orderList[_price].listExists()) {
            orderBookMap[_orderBookID].orderBook.remove(_price);
        }
    }
}
