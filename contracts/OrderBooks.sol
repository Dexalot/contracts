// SPDX-License-Identifier: BSD-3-Clause

pragma solidity ^0.8.3;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./library/RBTLibrary.sol";
import "./library/Bytes32LinkedListLibrary.sol";

import "./interfaces/ITradePairs.sol";

/**
*   @author "DEXALOT TEAM"
*   @title "OrderBooks: a contract implementing Central Limit Order Books interacting with the underlying Red-Black-Tree"
*   @dev "For each trade pair two order books are added to orderBookMap: buyBook and sellBook."
*   @dev "The naming convention for the order books is as follows: TRADEPAIRNAME-BUYBOOK and TRADEPAIRNAME-SELLBOOK."
*   @dev "For trade pair AVAX/USDT the order books are AVAX/USDT-BUYBOOK amd AVAX/USDT-SELLBOOK.
*/

contract OrderBooks is Initializable, OwnableUpgradeable {
    using RBTLibrary for RBTLibrary.Tree;
    using Bytes32LinkedListLibrary for Bytes32LinkedListLibrary.LinkedList;

    // version
    bytes32 constant public VERSION = bytes32('1.2.1');

    // orderbook structure defining one sell or buy book
    struct OrderBook {
        mapping (uint => Bytes32LinkedListLibrary.LinkedList) orderList;
        RBTLibrary.Tree orderBook;
    }

    // mapping from bytes32("AVAX/USDT-BUYBOOK") or bytes32("AVAX/USDT-SELLBOOK") to orderBook
    mapping (bytes32 => OrderBook) private orderBookMap;

    function initialize() public initializer {
        __Ownable_init();
    }

    function root(bytes32 _orderBookID) public view returns (uint _price) {
        _price = orderBookMap[_orderBookID].orderBook.root;
    }

    function first(bytes32 _orderBookID) public view returns (uint _price) {
        _price = orderBookMap[_orderBookID].orderBook.first();
    }

    function last(bytes32 _orderBookID) public view returns (uint _price) {
        _price = orderBookMap[_orderBookID].orderBook.last();
    }

    function next(bytes32 _orderBookID, uint price) public view returns (uint _price) {
        _price = orderBookMap[_orderBookID].orderBook.next(price);
    }

    function prev(bytes32 _orderBookID, uint price) public view returns (uint _price) {
        _price = orderBookMap[_orderBookID].orderBook.prev(price);
    }

    function exists(bytes32 _orderBookID, uint price) public view returns (bool _exists) {
        _exists = orderBookMap[_orderBookID].orderBook.exists(price);
    }

    // used for getting red-black-tree details in debugging
    function getNode(bytes32 _orderBookID, uint _price) public view returns (uint price, uint parent, uint left, uint right, bool red, bytes32 head, uint size) {
        OrderBook storage orderBookStruct = orderBookMap[_orderBookID];
        if (orderBookStruct.orderBook.exists(_price)) {
            (price, parent, left, right, red) = orderBookStruct.orderBook.getNode(_price);
            ( , head, ) = orderBookStruct.orderList[_price].getNode('');
            size = orderBookStruct.orderList[_price].sizeOf();
            return (price, parent, left, right, red, head, size);
        }
    }

    // used for getting the quantities in linked list of orders at a price
    function getQuantitiesAtPrice(bytes32 _orderBookID, uint _price) public view returns (uint[] memory) {
        (, , , , , bytes32 head, uint size) = getNode(_orderBookID, _price);
        uint[] memory quantities = new uint[](size);
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        for (uint i=0; i<size; i++) {
            ITradePairs.Order memory _order= ITradePairs(owner()).getOrder(head);
            quantities[i] = getRemainingQuantity(_order);
            ( , head) = orderBook.orderList[_price].getAdjacent(head, false);
        }
        return quantities;
    }

    function getRemainingQuantity(ITradePairs.Order memory _order) private pure returns(uint) {
        return _order.quantity - _order.quantityFilled;
    }

    function matchTrade(bytes32 _orderBookID, uint price, uint takerOrderRemainingQuantity, uint makerOrderRemainingQuantity)  public onlyOwner returns (uint) {
        uint quantity;
        quantity = min(takerOrderRemainingQuantity, makerOrderRemainingQuantity);
        if ((makerOrderRemainingQuantity - quantity) == 0) {
            // this order has been fulfilled
            removeFirstOrder(_orderBookID, price);
        }
        return quantity;
    }

    // get next price from a tree of prices
    function nextPrice(bytes32 _orderBookID, ITradePairs.Side _side, uint _price) public view returns (uint price) {
        if (_price == 0) {
            price = _side == ITradePairs.Side.BUY ? last(_orderBookID) : first(_orderBookID);
        } else {
            price = _side == ITradePairs.Side.BUY ? prev(_orderBookID, _price) : next(_orderBookID, _price);
        }
    }

    // used for getting head of the linked list of orders at a price
    function getHead(bytes32 _orderBookID, uint price) public view returns (bytes32 head) {
        ( , head, ) = orderBookMap[_orderBookID].orderList[price].getNode('');
        // Same result as this
        // ( , bytes32 head) = orderBookMap[_orderBookID].orderList[price].getAdjacent('', false);
    }

    // get next order at a price from linked list of orders
    function nextOrder(bytes32 _orderBookID, uint _price, bytes32 _orderId) public view returns (bytes32 nextId) {
        ( , nextId) = orderBookMap[_orderBookID].orderList[_price].getAdjacent(_orderId, false);
    }

    // used for getting number of price levels on an order book
    function getBookSize(bytes32 _orderBookID) public view returns (uint) {
        uint price = first(_orderBookID);
        uint i;
        while (price>0) {
            i++;
            price = next(_orderBookID, price);
        }
        return i;
    }

    // FRONTEND FUNCTION TO GET ALL ORDERS AT N PRICE LEVELS
    function getNOrders(bytes32 _orderBookID, uint nPrice, uint nOrder ,uint lastPrice, bytes32 lastOrder, uint _type)
              public view returns (uint[] memory prices , uint[] memory quantities , uint , bytes32 ) {
        if ( (nPrice == 0) || (root(_orderBookID) == 0) ||
                (lastPrice > 0 && !exists(_orderBookID, lastPrice))
                            ) { return (new uint[](1), new uint[](1), lastPrice, lastOrder); }

        if (lastPrice == 0 ) {
            lastPrice = (_type == 0) ? first(_orderBookID) : last(_orderBookID);
        }
        prices = new uint[](nPrice);
        quantities = new uint[](nPrice);
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        uint i;

        ITradePairs _tradePair = ITradePairs(owner());
        while (lastPrice > 0 &&  i < nPrice && nOrder > 0) {
            prices[i] = lastPrice;
            ( , lastOrder) = orderBook.orderList[lastPrice].getAdjacent(lastOrder, false);
            while (lastOrder != '' && nOrder > 0) {

                ITradePairs.Order memory _order= _tradePair.getOrder(lastOrder);
                quantities[i] += getRemainingQuantity(_order);
                ( , lastOrder) = orderBook.orderList[lastPrice].getAdjacent(lastOrder, false);
                nOrder--;
            }
            if (nOrder <= 0 && lastOrder != '') {
                //Last Order not processed, need to revert to last processed order
                ( , lastOrder) = orderBook.orderList[lastPrice].getAdjacent(lastOrder, true);
                break;
            }
            lastPrice = (_type == 0) ? next(_orderBookID, lastPrice) : prev(_orderBookID, lastPrice);
            i++;
        }
        return (prices, quantities, lastPrice, lastOrder);
    }

    function getNOrdersOld(bytes32 _orderBookID, uint n, uint _type) public view returns (uint[] memory, uint[] memory) {
        // get lowest (_type=0) or highest (_type=1) n orders as tuples of price, quantity
        if ( (n == 0) || (root(_orderBookID) == 0) ) { return (new uint[](1), new uint[](1)); }
        uint[] memory prices = new uint[](n);
        uint[] memory quantities = new uint[](n);
        OrderBook storage orderBook = orderBookMap[_orderBookID];
        uint price = (_type == 0) ? first(_orderBookID) : last(_orderBookID);
        uint i;
        while (price >0 && i<n) {
            prices[i] = price;
            (bool ex, bytes32 a) = orderBook.orderList[price].getAdjacent('', true);
            while (a != '') {
                ITradePairs _tradePair = ITradePairs(owner());
                ITradePairs.Order memory _order= _tradePair.getOrder(a);
                quantities[i] += getRemainingQuantity(_order);
                (ex, a) = orderBook.orderList[price].getAdjacent(a, true);
            }
            i++;
            price = (_type == 0) ? next(_orderBookID, price) : prev(_orderBookID, price);
        }
        return (prices, quantities);
    }

    // creates orderbook by adding orders at the same price
    // ***** Make SURE the Quantity Check is done before calling this function ***********
    function addOrder(bytes32 _orderBookID, bytes32 _orderUid, uint _price) public onlyOwner {
        if (!exists(_orderBookID, _price)) {
            orderBookMap[_orderBookID].orderBook.insert(_price);
        }
        orderBookMap[_orderBookID].orderList[_price].push(_orderUid, true);
    }

    function cancelOrder(bytes32 _orderBookID, bytes32 _orderUid, uint _price) public onlyOwner {
        orderBookMap[_orderBookID].orderList[_price].remove(_orderUid);
        if (!orderBookMap[_orderBookID].orderList[_price].listExists()) {
            orderBookMap[_orderBookID].orderBook.remove(_price);
        }
    }

    function orderListExists(bytes32 _orderBookID, uint _price) public view onlyOwner returns(bool) {
        return orderBookMap[_orderBookID].orderList[_price].listExists();
    }

    function removeFirstOrder(bytes32 _orderBookID, uint _price) public onlyOwner {
        if (orderBookMap[_orderBookID].orderList[_price].listExists()) {
            orderBookMap[_orderBookID].orderList[_price].pop(false);
        }
        if (!orderBookMap[_orderBookID].orderList[_price].listExists()) {
            orderBookMap[_orderBookID].orderBook.remove(_price);
        }
    }

    function min(uint a, uint b) internal pure returns(uint) {
        return (a <= b ? a : b);
    }

}
