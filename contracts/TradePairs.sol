// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./library/UtilsLibrary.sol";

import "./interfaces/IPortfolioSub.sol";
import "./interfaces/ITradePairs.sol";
import "./OrderBooks.sol";

/**
 * @title Implements the data structures and functions for trade pairs
 * @dev For each trade pair an entry is added tradePairMap.
 * The naming convention for the trade pairs is as follows: BASEASSET/QUOTEASSET.
 * For base asset AVAX and quote asset USDT the trade pair name is AVAX/USDT.
 * ExchangeSub needs to have DEFAULT_ADMIN_ROLE on TradePairs.
 * TradePairs should have EXECUTOR_ROLE on OrderBooks.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract TradePairs is
    Initializable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    ITradePairs
{
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    // version
    bytes32 public constant VERSION = bytes32("3.0.0");

    // denominator for rate calculations obsolete as of Feb 9 2024 CD
    uint256 public constant TENK = 10000;

    // id counter to build a unique handle for each new order/execution
    uint256 private idCounter;

    // a dynamic array of trade pairs added to TradePairs contract
    bytes32[] private tradePairsArray;

    // mapping data structure for all trade pairs
    mapping(bytes32 => TradePair) private tradePairMap;

    // mapping  for allowed order types for a TradePair
    mapping(bytes32 => EnumerableSetUpgradeable.UintSet) private allowedOrderTypes;

    // mapping structure for all orders
    mapping(bytes32 => Order) private orderMap;

    // mapping for clientOrderID unique per trader
    // e.g. for Trader1, Order1 having ClientOrderID1 ClientOrderIDMap(Trader1, TraderMap(ClientOrderID1, Order1))
    mapping(address => mapping(bytes32 => bytes32)) private clientOrderIDMap;
    // reference to OrderBooks contract that contains one sell and one buy book for every single tradepair
    OrderBooks private orderBooks;
    // reference Portfolio contract
    IPortfolioSub private portfolio;

    //Event versions to better communicate changes to listening components
    uint8 private constant NEW_TRADE_PAIR_VERSION = 1;
    uint8 private constant ORDER_STATUS_CHANGED_VERSION = 3;
    uint8 private constant EXECUTED_VERSION = 1;
    uint8 private constant PARAMETER_UPDATED_VERSION = 1;
    uint256 public maxNbrOfFills;
    bytes32 public constant EXCHANGE_ROLE = keccak256("EXCHANGE_ROLE");

    /**
     * @notice  initializer function for Upgradeable TradePairs
     * @dev     idCounter needs to be unique for each order and execution id.
     * Both the orderbooks and the portolio should be deployed before tradepairs.
     * @param   _orderbooks  orderbooks instance
     * @param   _portfolio  portfolio instance
     */
    function initialize(address _orderbooks, address _portfolio) external initializer {
        __AccessControlEnumerable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        // initialize deployment account to have DEFAULT_ADMIN_ROLE
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        idCounter = block.timestamp;
        maxNbrOfFills = 100;
        orderBooks = OrderBooks(_orderbooks);
        portfolio = IPortfolioSub(_portfolio);
    }

    /**
     * @notice  Adds a new TradePair
     * @dev     Should only be called by ExchangeSub which has this DEFAULT_ADMIN role.
     * @param   _tradePairId  id of the trading pair
     * @param   _baseTokenDetails  base asset details from PortfolioSub
     * @param   _baseDisplayDecimals  display decimals of the base Asset. Quantity increment
     * @param   _quoteTokenDetails  quote asset details from PortfolioSub
     * @param   _quoteDisplayDecimals  display decimals of the quote Asset. Price increment
     * @param   _minTradeAmount  minimum trade amount
     * @param   _maxTradeAmount  maximum trade amount
     * @param   _mode  Auction Mode of the auction token. Auction token is always the BASE asset.
     */
    function addTradePair(
        bytes32 _tradePairId,
        IPortfolio.TokenDetails calldata _baseTokenDetails,
        uint8 _baseDisplayDecimals,
        IPortfolio.TokenDetails calldata _quoteTokenDetails,
        uint8 _quoteDisplayDecimals,
        uint256 _minTradeAmount,
        uint256 _maxTradeAmount,
        AuctionMode _mode
    ) external override onlyRole(EXCHANGE_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];

        if (tradePair.baseSymbol == "") {
            EnumerableSetUpgradeable.UintSet storage enumSet = allowedOrderTypes[_tradePairId];
            enumSet.add(uint256(Type1.LIMIT)); // LIMIT orders always allowed
            //enumSet.add(uint(Type1.MARKET));  // trade pairs are added without MARKET orders

            bytes32 buyBookId = UtilsLibrary.stringToBytes32(
                string(abi.encodePacked(UtilsLibrary.bytes32ToString(_tradePairId), "-BUYBOOK"))
            );
            bytes32 sellBookId = UtilsLibrary.stringToBytes32(
                string(abi.encodePacked(UtilsLibrary.bytes32ToString(_tradePairId), "-SELLBOOK"))
            );
            orderBooks.addToOrderbooks(buyBookId, Side.BUY);
            orderBooks.addToOrderbooks(sellBookId, Side.SELL);
            tradePair.baseSymbol = _baseTokenDetails.symbol;
            tradePair.baseDecimals = _baseTokenDetails.decimals;
            tradePair.baseDisplayDecimals = _baseDisplayDecimals;
            tradePair.quoteSymbol = _quoteTokenDetails.symbol;
            tradePair.quoteDecimals = _quoteTokenDetails.decimals;
            tradePair.quoteDisplayDecimals = _quoteDisplayDecimals;
            tradePair.minTradeAmount = _minTradeAmount;
            tradePair.maxTradeAmount = _maxTradeAmount;
            tradePair.buyBookId = buyBookId;
            tradePair.sellBookId = sellBookId;
            tradePair.makerRate = 20; // (0.20% = 20/10000)
            tradePair.takerRate = 30; // (0.30% = 30/10000)
            // with default allowedSlippagePercent of 20, the market orders cannot be filled
            // worst than 80% of the bestBid and 120% of bestAsk
            tradePair.allowedSlippagePercent = 20; // (20% = 20/100)
            // tradePair.addOrderPaused = false;   // addOrder is not paused by default (EVM initializes to false)
            // tradePair.pairPaused = false;       // pair is not paused by default (EVM initializes to false)
            // tradePair.postOnly = false;         // evm initialized

            setAuctionModePrivate(_tradePairId, _mode);
            tradePairsArray.push(_tradePairId);

            emit NewTradePair(
                NEW_TRADE_PAIR_VERSION,
                _tradePairId,
                _baseDisplayDecimals,
                _quoteDisplayDecimals,
                _minTradeAmount,
                _maxTradeAmount
            );
        }
    }

    /**
     * @notice  Removes the trade pair
     * @dev     Orderbook needs to be empty to be able to remove the tradepair.
     * Will be used mostly if a tradepair is added by mistake and needs to be removed.
     * @param   _tradePairId  id of the trading pair
     */
    function removeTradePair(bytes32 _tradePairId) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(
            orderBooks.bestPrice(_tradePair.sellBookId) == 0 && orderBooks.bestPrice(_tradePair.buyBookId) == 0,
            "T-RMTP-01"
        );

        for (uint i = 0; i < tradePairsArray.length; ++i) {
            if (tradePairsArray[i] == _tradePairId) {
                tradePairsArray[i] = tradePairsArray[tradePairsArray.length - 1];
                tradePairsArray.pop();
                delete (tradePairMap[_tradePairId]);
                emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-REMOVETRADEPAIR", 0, 0);
                break;
            }
        }
    }

    /**
     * @notice  Gets a list of the trade pairs
     * @dev     All pairs are returned. Even the delisted ones
     * @return  bytes32[]  Array of trade pairs
     */
    function getTradePairs() external view override returns (bytes32[] memory) {
        return tradePairsArray;
    }

    /**
     * @notice  Returns the corresponding TradePair struct for the trade pair id.
     * @param   _tradePairId  id of the trading pair
     * @return  TradePair  Trade pair data structure
     */
    function getTradePair(bytes32 _tradePairId) external view returns (TradePair memory) {
        return tradePairMap[_tradePairId];
    }

    /**
     * @notice  Returns the bookid given the tradePairId and side
     * @return  bytes32  BookId
     */
    function getBookId(bytes32 _tradePairId, Side _side) external view override returns (bytes32) {
        return _side == Side.BUY ? tradePairMap[_tradePairId].buyBookId : tradePairMap[_tradePairId].sellBookId;
    }

    /**
     * @notice  Pauses the contract
     * @dev     Can only be called by DEFAULT_ADMIN.
     */
    function pause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice  Unpauses the contract
     * @dev     Can only be called by DEFAULT_ADMIN.
     */
    function unpause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice  Pauses a specific Trade Pair
     * @dev     Can only be called by DEFAULT_ADMIN.
     * Public instead of external because it saves 0.184(KiB) in contract size
     * @param   _tradePairId  id of the trading pair
     * @param   _tradePairPause  true to pause, false to unpause
     */
    function pauseTradePair(bytes32 _tradePairId, bool _tradePairPause) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        tradePairMap[_tradePairId].pairPaused = _tradePairPause;
    }

    /**
     * @notice  Pauses adding new orders to a specific Trade Pair
     * @dev     Can only be called by DEFAULT_ADMIN.
     * @param   _tradePairId  id of the trading pair
     * @param   _addOrderPause  true to pause, false to unpause
     */
    function pauseAddOrder(bytes32 _tradePairId, bool _addOrderPause) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        tradePairMap[_tradePairId].addOrderPaused = _addOrderPause;
    }

    /**
     * @notice  Sets the TradePair in test mode. Only Limit Post Only orders accepted. No matching.
     * @dev     Can only be called by DEFAULT_ADMIN.
     * @param   _tradePairId  id of the trading pair
     * @param   _postOnly  true to allow PostOnly orders, false to allow all types
     */
    function postOnly(bytes32 _tradePairId, bool _postOnly) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        tradePairMap[_tradePairId].postOnly = _postOnly;
    }

    /**
     * @notice  Sets the auction mode of a specific Trade Pair
     * @dev     Can only be called by DEFAULT_ADMIN.
     * @param   _tradePairId  id of the trading pair
     * @param   _mode  Auction Mode
     */
    function setAuctionMode(bytes32 _tradePairId, AuctionMode _mode) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        setAuctionModePrivate(_tradePairId, _mode);
    }

    /**
     * @notice  Maximum Number of Executions an order can have before it gets a cancel for the remainder
     * @dev     This is to protect the matchOrder loop from running out of gas during the normal
     * trading operations
     * @param   _maxNbrOfFills  Max number of executions an order can have in a single block
     */
    function setMaxNbrOfFills(uint256 _maxNbrOfFills) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_maxNbrOfFills >= 10, "T-MNOE-01");
        maxNbrOfFills = _maxNbrOfFills;
    }

    /**
     * @notice  Sets the auction mode of a specific Trade Pair
     * @dev     Need to be able to call it internally from the constructor
     * @param   _tradePairId  id of the trading pair
     * @param   _mode  Auction Mode
     */
    function setAuctionModePrivate(bytes32 _tradePairId, AuctionMode _mode) private {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = uint256(tradePair.auctionMode);
        tradePair.auctionMode = _mode;
        portfolio.setAuctionMode(tradePair.baseSymbol, _mode);
        if (UtilsLibrary.matchingAllowed(_mode)) {
            // Makes sure that the matching is completed after the auction has ended and order book
            // doesn't have any crossed orders left before unpausing the trade pair
            require(orderBooks.isNotCrossedBook(tradePair.sellBookId, tradePair.buyBookId), "T-AUCT-05");
            pauseTradePair(_tradePairId, false);
        } else if (_mode == AuctionMode.OPEN || UtilsLibrary.isAuctionRestricted(_mode)) {
            pauseTradePair(_tradePairId, false);
        } else if (_mode == AuctionMode.MATCHING || _mode == AuctionMode.PAUSED) {
            pauseTradePair(_tradePairId, true);
        }
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-AUCTIONMODE", oldValue, uint256(_mode));
    }

    /**
     * @notice  Sets the auction price
     * @dev     Price is calculated by the backend (off chain) after the auction has closed.
     * Auction price can be changed anytime. It is imperative that is not changed after the
     * first order is matched until the last order to be matched.
     * @param   _tradePairId  id of the trading pair
     * @param   _price  price of the auction
     */
    function setAuctionPrice(bytes32 _tradePairId, uint256 _price) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        require(UtilsLibrary.decimalsOk(_price, tradePair.quoteDecimals, tradePair.quoteDisplayDecimals), "T-AUCT-02");
        uint256 oldValue = tradePair.auctionPrice;
        tradePair.auctionPrice = _price;
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-AUCTIONPRICE", oldValue, _price);
    }

    /**
     * @notice  Checks if TradePair already exists
     * @param   _tradePairId  id of the trading pair
     * @return  bool  true if it exists
     */
    function tradePairExists(bytes32 _tradePairId) external view returns (bool) {
        return tradePairMap[_tradePairId].baseSymbol != "";
    }

    /**
     * @notice  Sets the minimum trade amount allowed for a specific Trade Pair
     * @dev     Can only be called by DEFAULT_ADMIN. The min trade amount needs to satisfy
     * `getQuoteAmount(_price, _quantity, _tradePairId) >= _minTradeAmount`
     * @param   _tradePairId  id of the trading pair
     * @param   _minTradeAmount  minimum trade amount in terms of quote asset
     */
    function setMinTradeAmount(
        bytes32 _tradePairId,
        uint256 _minTradeAmount
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = tradePair.minTradeAmount;
        tradePair.minTradeAmount = _minTradeAmount;
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-MINTRAMT", oldValue, _minTradeAmount);
    }

    /**
     * @notice  Sets the maximum trade amount allowed for a specific Trade Pair
     * @dev     Can only be called by DEFAULT_ADMIN. The max trade amount needs to satisfy
     * `getQuoteAmount(_price, _quantity, _tradePairId) <= _maxTradeAmount`
     * @param   _tradePairId  id of the trading pair
     * @param   _maxTradeAmount  maximum trade amount in terms of quote asset
     */
    function setMaxTradeAmount(
        bytes32 _tradePairId,
        uint256 _maxTradeAmount
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = tradePair.maxTradeAmount;
        tradePair.maxTradeAmount = _maxTradeAmount;
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-MAXTRAMT", oldValue, _maxTradeAmount);
    }

    /**
     * @notice  Adds a new order type to a tradePair
     * @dev     Can only be called by DEFAULT_ADMIN. LIMIT order is added by default.
     * @param   _tradePairId  id of the trading pair
     * @param   _type  Order Type
     */
    function addOrderType(bytes32 _tradePairId, Type1 _type) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedOrderTypes[_tradePairId].add(uint256(_type));
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-OTYPADD", 0, uint256(_type));
    }

    /**
     * @notice  Removes an order type that is previously allowed
     * @dev     Can only be called by DEFAULT_ADMIN. LIMIT order type can't be removed.
     * @param   _tradePairId  id of the trading pair
     * @param   _type  Order Type
     */
    function removeOrderType(bytes32 _tradePairId, Type1 _type) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_type != Type1.LIMIT, "T-LONR-01");
        allowedOrderTypes[_tradePairId].remove(uint256(_type));
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-OTYPREM", 0, uint256(_type));
    }

    /**
     * @notice  Returns the allowed order types.
     * @dev     LIMIT is always available by default. Market order type may be allowed once there is
     * enough liquidity on a pair.
     * @param   _tradePairId  id of the trading pair
     * @return  uint256[]  Array of allowed order types
     */
    function getAllowedOrderTypes(bytes32 _tradePairId) external view returns (uint256[] memory) {
        uint256 size = allowedOrderTypes[_tradePairId].length();
        uint256[] memory allowed = new uint256[](size);
        for (uint256 i = 0; i < size; ++i) {
            allowed[i] = allowedOrderTypes[_tradePairId].at(i);
        }
        return allowed;
    }

    /**
     * @notice  Sets the display decimals of the base or the quote asset in a tradePair
     * @dev     Can only be called by DEFAULT_ADMIN. Display decimals can also be referred as
     * `Quantity Increment if _isBase==true` or `PriceIncrement if _isBase==false`
     * @param   _tradePairId  id of the trading pair
     * @param   _displayDecimals  display decimal
     * @param   _isBase  true/false
     */
    function setDisplayDecimals(
        bytes32 _tradePairId,
        uint8 _displayDecimals,
        bool _isBase
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = tradePair.baseDisplayDecimals;
        if (_isBase) {
            tradePair.baseDisplayDecimals = _displayDecimals;
        } else {
            oldValue = tradePair.quoteDisplayDecimals;
            tradePair.quoteDisplayDecimals = _displayDecimals;
        }
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-DISPDEC", oldValue, _displayDecimals);
    }

    /**
     * @notice  Sets the Maker or the Taker Rate
     * @dev     Can only be called by DEFAULT_ADMIN
     * @param   _tradePairId  id of the trading pair
     * @param   _rate  Percent Rate `(_rate/100)% = _rate/10000: _rate=10 => 0.10%`
     * @param   _rateType  Rate Type, 0 maker or 1 taker
     */
    function updateRate(
        bytes32 _tradePairId,
        uint8 _rate,
        ITradePairs.RateType _rateType
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint8 oldValue = tradePair.makerRate;
        if (_rateType == ITradePairs.RateType.MAKER) {
            tradePair.makerRate = _rate; // (_rate/100)% = _rate/10000: _rate=10 => 0.10%
            emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-MAKERRATE", oldValue, _rate);
        } else {
            oldValue = tradePair.takerRate;
            tradePair.takerRate = _rate; // (_rate/100)% = _rate/10000: _rate=20 => 0.20%
            emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-TAKERRATE", oldValue, _rate);
        }
    }

    /**
     * @notice  sets the slippage percent for market orders, before it gets unsolicited cancel
     * @dev     Can only be called by DEFAULT_ADMIN. Market Orders will be filled up to allowedSlippagePercent
     * from the marketPrice(bestbid or bestask) to protect the trader. The remaining quantity gets
     * unsolicited cancel
     * @param   _tradePairId  id of the trading pair
     * @param   _allowedSlippagePercent  allowed slippage percent=20 (Default = 20 : 20% = 20/100)
     */
    function setAllowedSlippagePercent(
        bytes32 _tradePairId,
        uint8 _allowedSlippagePercent
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = tradePair.allowedSlippagePercent;
        tradePair.allowedSlippagePercent = _allowedSlippagePercent;
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-SLIPPAGE", oldValue, _allowedSlippagePercent);
    }

    /**
     * @notice  Returns Buy or Sell orderbook for the given tradepair and side
     * @dev     Although this is a view function, it may run out of gas in case you try to get the entire order book
     * with a lot of orders. That's why it has nPrice and nOrder parameters.
     * Example: `getNBook(tradePair, 0, 2, 50, 0, bytes32(''))` : This will get the best 2 buy
     * price points (top of the buy book and the next best price and it will aggregate the quantities
     * of up to 50 orders at a time when generating the orderbook).
     * @dev     If the order book is large and has many orders at a price point one needs to paginate through the order
     * book using `getNBook`.  Use 0 for `_lastPrice` and an empty string in bytes32 for `_lastOrder`.  If looping use
     * the last `_lastPrice` and `_lastOrder` returned from this function call.
     * @param   _tradePairId  id of the trading pair
     * @param   _side  0- BUY for BuyBook, 1- SELL for SellBook
     * @param   _nPrice  Depth requested. If 1, top of the book, if 2 best 2 prices etc
     * @param   _nOrder  The number of orders to be retrieved at a time at the price point
     * @param   _lastPrice  The price point to start at
     * @param   _lastOrder  the orderid to start at
     * @return  uint256[]  Prices array
     * @return  uint256[]  Quantities array
     * @return  uint256  Last Price processed. 0 if no more price point left
     * @return  bytes32  Last Order id processed. "" if no more orders left
     */
    function getNBook(
        bytes32 _tradePairId,
        Side _side,
        uint256 _nPrice,
        uint256 _nOrder,
        uint256 _lastPrice,
        bytes32 _lastOrder
    ) external view override returns (uint256[] memory, uint256[] memory, uint256, bytes32) {
        bytes32 bookId = _side == Side.BUY
            ? tradePairMap[_tradePairId].buyBookId
            : tradePairMap[_tradePairId].sellBookId;
        return orderBooks.getNOrders(bookId, _nPrice, _nOrder, _lastPrice, _lastOrder);
    }

    /**
     * @notice  Returns order details given the order id
     * @param   _orderId  order id assigned by the contract
     * @return  Order  Order Struct
     */
    function getOrder(bytes32 _orderId) external view override returns (Order memory) {
        return orderMap[_orderId];
    }

    /**
     * @notice  Returns order remaining quantity given the order id
     * @param   _orderId  order id assigned by the contract
     * @return  remaining quantity of the order
     */
    function getOrderRemainingQuantity(bytes32 _orderId) external view override returns (uint256) {
        Order storage order = orderMap[_orderId];
        return UtilsLibrary.getRemainingQuantity(order.quantity, order.quantityFilled);
    }

    /**
     * @notice  Returns order details given the trader and the clientOrderId
     * @param   _trader  user's address
     * @param   _clientOrderId   client Order id assigned by the user
     * @return  Order  Order Struct
     */
    function getOrderByClientOrderId(
        address _trader,
        bytes32 _clientOrderId
    ) external view override returns (Order memory) {
        return orderMap[clientOrderIDMap[_trader][_clientOrderId]];
    }

    /**
     * @notice  Returns the next Id to be used as order id
     * @return  bytes32  id
     */
    function getNextOrderId() private returns (bytes32) {
        return bytes32(getNextId());
    }

    /**
     * @notice  increments the id counter to be used as order id or as an execution id
     * @return  uint256  id
     */
    function getNextId() private returns (uint256) {
        return idCounter++;
    }

    /**
     * @notice  Emits a given order's latest state
     * @dev     The details of the emitted event is as follows: \
     * *version*  event version \
     * *traderaddress*  traders’s wallet (immutable) \
     * *pair*  traded pair. ie. ALOT/AVAX in bytes32 (immutable) \
     * *orderId*  unique order id assigned by the contract (immutable) \
     * *clientOrderId*  client order id provided by the sender of the order as a reference (immutable) \
     * *price * price of the order entered by the trader. (0 if market order) (immutable) \
     * *totalamount*   cumulative amount in quote currency. ⇒ price* quantityfilled . If
     * multiple partial fills , the new partial fill price*quantity is added to the
     * current value in the field. Average execution price can be quickly
     * calculated by totalamount/quantityfilled regardless of the number of
     * partial fills at different prices \
     * *quantity*  order quantity (immutable) \
     * *side* Order side. See #addOrder (immutable) \
     * *type1*  See #addOrder (immutable) \
     * *type2*  See #addOrder (immutable) \
     * ```solidity
     * status  Order Status  {
     *          NEW,
     *          REJECTED,
     *          PARTIAL,
     *          FILLED,
     *          CANCELED,
     *          EXPIRED, -- For future use
     *          KILLED -- For future use
     *          CANCEL_REJECT – Cancel Request Rejected with reason code
     *       }
     * ```
     * *quantityfilled*  cumulative quantity filled \
     * *totalfee* cumulative fee paid for the order (total fee is always in terms of
     * received(incoming) currency. ie. if Buy ALOT/AVAX, fee is paid in ALOT, if Sell
     * ALOT/AVAX , fee is paid in AVAX \
     * *code*  reason when order has REJECT or CANCEL_REJECT status, empty otherwise \
     * Note: Order price can be different than the execution price.
     * @param   _orderId  order id
     */
    function emitStatusUpdate(bytes32 _orderId) private {
        Order storage order = orderMap[_orderId];
        uint32 previousUpdateBlock = order.updateBlock;
        order.updateBlock = uint32(block.number);
        emit OrderStatusChanged(
            ORDER_STATUS_CHANGED_VERSION,
            order.traderaddress,
            order.tradePairId,
            order,
            previousUpdateBlock,
            bytes32(0) // no reject reason
        );
    }

    /**
     * @notice  Calculates the commission and updates the order state after an execution
     * @dev     Updates the `totalAmount`, `quantityFilled`, `totalFee` and the status of the order.
     * Commissions are rounded down based on evm and display decimals to avoid DUST
     * @param   _orderId  order id to update
     * @param   _quantity  execution quantity
     * @param   _quoteAmount  quote amount
     * @param   _fee  fee (commission) paid for the order

     */
    function updateOrder(bytes32 _orderId, uint256 _quantity, uint256 _quoteAmount, uint256 _fee) private {
        Order storage order = orderMap[_orderId];
        order.quantityFilled = order.quantityFilled + _quantity;
        order.status = order.quantity == order.quantityFilled ? Status.FILLED : Status.PARTIAL;
        order.totalAmount = order.totalAmount + _quoteAmount;
        order.totalFee = order.totalFee + _fee;
    }

    /**
     * @notice  Applies an execution to both maker and the taker orders and adjust holdings in portfolio
     * @dev     Emits Executed event showing the execution details. Note that an order's price
     * can be different than a taker order price, but it should be identical to maker order's price.
     * @param   _makerOrderId  maker order id
     * @param   _takerOrderId  maker order id
     * @param   _price  execution price
     * @param   _quantity  execution quantity
     */
    function addExecution(bytes32 _makerOrderId, bytes32 _takerOrderId, uint256 _price, uint256 _quantity) private {
        Order storage makerOrder = orderMap[_makerOrderId];
        TradePair storage tradePair = tradePairMap[makerOrder.tradePairId];
        Order storage takerOrder = orderMap[_takerOrderId];

        uint256 quoteAmount = UtilsLibrary.getQuoteAmount(tradePair.baseDecimals, _price, _quantity);
        (uint256 mlastFee, uint256 tlastFee) = portfolio.addExecution(
            makerOrder.tradePairId,
            tradePair,
            makerOrder.side,
            makerOrder.traderaddress,
            takerOrder.traderaddress,
            _quantity,
            quoteAmount
        );
        updateOrder(makerOrder.id, _quantity, quoteAmount, mlastFee);
        updateOrder(takerOrder.id, _quantity, quoteAmount, tlastFee);
        emitExecuted(_price, _quantity, makerOrder.id, takerOrder.id, mlastFee, tlastFee);
        emitStatusUpdate(makerOrder.id); // EMIT maker order's status update
    }

    /**
     * @notice  Emits the Executed Event showing \
     * `version`  event version \
     * `tradePairId`  traded pair from makerOrder, i.e. ALOT/AVAX in bytes32 \
     * `_price`  see below \
     * `_quantity`  see below \
     * `_makerOrderId`  see below \
     * `_takerOrderId`  see below \
     * `_mlastFee`  see below \
     * `_tlastFee`  see below \
     * `takerSide`  Side of the taker order. 0 - BUY, 1- SELL (Note: This can be used to identify
     * the fee UNITs. If takerSide = 1, then the fee is paid by the Maker in Base
     * Currency and the fee paid by the taker in Quote currency. If takerSide= 0
     * then the fee is paid by the Maker in Quote Currency and the fee is paid by
     * the taker in Base currency \
     * `execId`  Unique trade id (execution id) assigned by the contract \
     * `addressMaker`  maker traderaddress \
     * `addressTaker`  taker traderaddress
     * @param   _price      executed price
     * @param   _quantity   executed quantity
     * @param   _makerOrderId  Maker Order id
     * @param   _takerOrderId  Taker Order id
     * @param   _mlastFee   fee paid by maker
     * @param   _tlastFee   fee paid by taker
     */
    function emitExecuted(
        uint256 _price,
        uint256 _quantity,
        bytes32 _makerOrderId,
        bytes32 _takerOrderId,
        uint256 _mlastFee,
        uint256 _tlastFee
    ) private {
        Order storage makerOrder = orderMap[_makerOrderId];
        Order storage takerOrder = orderMap[_takerOrderId];
        emit Executed(
            EXECUTED_VERSION,
            makerOrder.tradePairId,
            _price,
            _quantity,
            makerOrder.id,
            takerOrder.id,
            _mlastFee,
            _tlastFee,
            takerOrder.side,
            getNextId(),
            makerOrder.traderaddress,
            takerOrder.traderaddress
        );
    }

    /**
     * @notice  Removes closed order from the mapping
     * @dev     Consumes gas but imperative to keep blockchain's active state lean.
     * @param   _orderId  order id to remove
     */
    function removeClosedOrder(bytes32 _orderId) private {
        Order storage order = orderMap[_orderId];
        if (order.status == Status.FILLED || order.status == Status.CANCELED) {
            delete clientOrderIDMap[order.traderaddress][order.clientOrderId];
            delete orderMap[_orderId];
        }
    }

    /**
     * @notice  Checks if order can be entered without any issues
     * @dev     Checks if tradePair or addOrder is paused as well as
     * if decimals, order types and clientOrderId are supplied properly \
     * @dev     clientorderid is sent by the owner of an order and it is returned in responses for
     * reference. It must be unique per traderaddress.
     * @param   _msgSender  msg.Sender address
     * @param   _order  order details

     */
    function addOrderChecks(address _msgSender, NewOrder memory _order) private view returns (uint256, bytes32) {
        // Order owner check. Will revert the order or the orderList entirely
        require(_order.traderaddress == _msgSender, "T-OOCA-01");
        TradePair storage tradePair = tradePairMap[_order.tradePairId];
        // Pair level checks. Will revert the order or the orderList entirely
        require(!tradePair.pairPaused, "T-PPAU-01");
        require(!tradePair.addOrderPaused, "T-AOPA-01");
        // Order Types Check - Limit, Market etc
        if (!allowedOrderTypes[_order.tradePairId].contains(uint256(_order.type1))) {
            return (0, UtilsLibrary.stringToBytes32("T-IVOT-01"));
            // Quantity digit check
        } else if (!UtilsLibrary.decimalsOk(_order.quantity, tradePair.baseDecimals, tradePair.baseDisplayDecimals)) {
            return (0, UtilsLibrary.stringToBytes32("T-TMDQ-01"));
            // Unique ClientOrderId Check
        } else if (clientOrderIDMap[_order.traderaddress][_order.clientOrderId] != 0) {
            return (0, UtilsLibrary.stringToBytes32("T-CLOI-01"));
            // Pair Level PostOnly mode check. Only PO Orders allowed when TradePair is listed for the first time.
        } else if (tradePair.postOnly) {
            if (!(_order.type1 == Type1.LIMIT && _order.type2 == Type2.PO)) {
                return (0, UtilsLibrary.stringToBytes32("T-POOA-01"));
            }
        }

        bytes32 bookIdOtherSide = _order.side == Side.BUY ? tradePair.sellBookId : tradePair.buyBookId;
        uint256 marketPrice = orderBooks.bestPrice(bookIdOtherSide);

        if (_order.type1 == Type1.MARKET) {
            // Market orders not allowed in Auction Mode
            if (!UtilsLibrary.matchingAllowed(tradePair.auctionMode)) {
                return (0, UtilsLibrary.stringToBytes32("T-AUCT-04"));
            }
            //price set to the worst price to fill up to this price given enough quantity
            _order.price = _order.side == Side.BUY
                ? (marketPrice * (100 + tradePair.allowedSlippagePercent)) / 100
                : (marketPrice * (100 - tradePair.allowedSlippagePercent)) / 100;
            // don't need to do a _price digit check here for market orders as it is taken from the orderbook
        } else {
            // _price digit check for LIMIT order
            if (!UtilsLibrary.decimalsOk(_order.price, tradePair.quoteDecimals, tradePair.quoteDisplayDecimals)) {
                return (0, UtilsLibrary.stringToBytes32("T-TMDP-01"));
            }
            // PostOnly Check (reject order that will get a fill)
            if (
                _order.type2 == Type2.PO &&
                marketPrice > 0 && // marketPrice > 0 check for non-empty orderbook
                (_order.side == Side.BUY ? _order.price >= marketPrice : _order.price <= marketPrice)
            ) {
                return (0, UtilsLibrary.stringToBytes32("T-T2PO-01"));
            }
        }

        uint256 tradeAmnt = UtilsLibrary.getQuoteAmount(tradePair.baseDecimals, _order.price, _order.quantity);

        // a market order will be rejected/reverted here if there is an empty orderbook because _price will be 0
        if (tradeAmnt < tradePair.minTradeAmount) {
            return (0, UtilsLibrary.stringToBytes32("T-LTMT-01"));
        } else if (tradeAmnt > tradePair.maxTradeAmount) {
            return (0, UtilsLibrary.stringToBytes32("T-MTMT-01"));
        }
        return (_order.price, "");
    }

    /**
     * @notice  To send multiple Orders of any type in a single transaction designed specifically for Market Makers
     * @dev     if a single order in the new list reverts due to insufficient funds or if the msg sender is different than
     * the order.traderaddress, the entire transaction is reverted. No orders will go through.
     * This function will only revert if it fails pair level checks, which are
     * tradePair.pairPaused or tradePair.addOrderPaused \
     * It can also potentially revert if type2= FOK is used. Safe to use with IOC, GTC & PO. \
     * For the rest of the order level check failures, It will reject those orders by emitting
     * OrderStatusChanged event with "status" = Status.REJECTED and "code" = rejectReason
     * The event will have your clientOrderId, but no orderId will be assigned to the order as it will not be
     * added to the blockchain. \
     * Order rejects will only be raised if called from this function. Single orders entered using addOrder
     * function will revert as before for backward compatibility. \
     * See addOrderChecks function. Every line that starts with  return (0, rejectReason) will be rejected.
     * @param   _orders  array of newOrder struct. See ITradePairs.NewOrder
     * Sample typescript code
     * const orders = [];
     * const order = { traderaddress: Ox
     *               , clientOrderId: Oxid3
     *               , tradePairId:
     *               , price:
     *               , quantity:
     *               , side: 0  // Buy
     *               , type1: 1 // Limit
     *               , type2: 3 //PO
     *          };
     * orders.push(order);
     * await tradePairs.addOrderList(orders);
     */
    function addOrderList(NewOrder[] calldata _orders) external override nonReentrant {
        addOrderListPrivate(msg.sender, _orders);
    }

    /**
     * @notice  To send multiple Orders of any type in a single transaction designed specifically for Market Makers
     * @dev     See addOrderList
     * @param   _msgSender  msg.Sender's address
     * @param   _orders  array of newOrder struct. See ITradePairs.NewOrder
     */

    function addOrderListPrivate(address _msgSender, NewOrder[] calldata _orders) private {
        for (uint256 i = 0; i < _orders.length; ++i) {
            addOrderPrivate(
                _msgSender,
                _orders[i],
                i == _orders.length - 1, // Autofill using the last order
                false // emit status=REJECTED for individual orders form the list instead of reverting the entire list
            );
        }
    }

    /**
     * @notice  DEPRECATED Frontend Entry function to call to add an order
     * @dev DEPRECATED use addOrder(order) function instead. Will be removed in November 2024
     * @param   _trader  address of the trader. If msg.sender is not the `_trader` the tx will revert.
     * @param   _clientOrderId unique id provided by the owner of an order
     * @param   _tradePairId  id of the trading pair
     * @param   _price  price of the order
     * @param   _quantity  quantity of the order
     * @param   _side  enum ITradePairs.Side  Side of the order 0 BUY, 1 SELL
     * @param   _type1  enum ITradePairs.Type1 Type of the order. 0 MARKET , 1 LIMIT (STOP and STOPLIMIT NOT Supported)
     * @param   _type2  enum ITradePairs.Type2 SubType of the order
     */
    function addOrder(
        address _trader,
        bytes32 _clientOrderId,
        bytes32 _tradePairId,
        uint256 _price,
        uint256 _quantity,
        Side _side,
        Type1 _type1,
        Type2 _type2
    ) external override nonReentrant {
        NewOrder memory newOrder;
        newOrder.traderaddress = _trader;
        newOrder.clientOrderId = _clientOrderId;
        newOrder.tradePairId = _tradePairId;
        newOrder.price = _price;
        newOrder.quantity = _quantity;
        newOrder.side = _side;
        newOrder.type1 = _type1;
        newOrder.type2 = _type2;
        addOrderPrivate(msg.sender, newOrder, true, true);
    }

    /**
     * @notice  Frontend Entry function to call to add an order
     * @dev     Adds an order with the given fields. As a general rule of thumb msg.sender should be the `_trader`
     * otherwise the tx will revert. 'OrderStatusChanged' event will be emitted
     * when an order is received and committed to the blockchain. You can get the contract
     * generated orderid along with your clientorderid from this event. When the blockchain is extremely busy,
     * the transactions are queued up in the mempool and prioritized based on their gas price.
     * @dev     `_clientOrderId` is sent by the owner of an order and it is returned in responses for
     * reference. It must be unique per traderaddress. \
     * @dev     Price for market Orders are set to 0 internally (type1=0). Valid price decimals and evm decimals
     * can be obtained by calling `getTradePair(..)` and accessing baseDisplayDecimals and baseDecimals respectively. \
     * @dev     Valid quantity decimals (quoteDisplayDecimals) and evm decimals can be obtained by calling
     * `getTradePair(..)` and accessing quoteDisplayDecimals and quoteDecimals respectively. \
     * @dev     The default for type2 (Order SubType) is 0 equivalent to GTC. \
     * Here are the other SubTypes: \
     * 0 = GTC : Good Till Cancel \
     * 1 = FOK : FIll or Kill (Will fill entirely or will revert with "T-FOKF-01") \
     * 2 = IOC : Immediate or Cancel  (Will fill partially or fully, will get status=CANCELED if filled partially) \
     * 3 = PO  : Post Only (Will either go in the orderbook or revert with "T-T2PO-01" if it has a potential match)
     * @param   _order  newOrder struct to be sent out. See ITradePairs.NewOrder
     * Sample typescript code
     * const order = { traderaddress: Ox    //address of the trader. If msg.sender is not the `_trader` the tx will revert.
     *               , clientOrderId: Oxid3 //unique id provided by the owner of an order
     *               , tradePairId:         //id of the trading pair
     *               , price:               //price of the order
     *               , quantity:            //quantity of the order
     *               , side: 0              // enum ITradePairs.Side  Side of the order 0 BUY, 1 SELL
     *               , type1: 1             // enum ITradePairs.Type1 Type of the order. 0 MARKET, 1 LIMIT
     *               , type2: 3             // enum ITradePairs.Type2 SubType of the order
     *          };
     */
    function addNewOrder(NewOrder calldata _order) external override nonReentrant {
        addOrderPrivate(msg.sender, _order, true, true); // if false will get rejects instead of reverts
    }

    /**
     * @notice  See addOrder
     * @param   _msgSender  address of the msg.Sender. If msg.sender is not the same as _order.traderaddress
     * the tx will revert.
     * @param   _order  newOrder struct to be sent out. See ITradePairs.NewOrder
     * @param   _autofill  controls the autofill logic. Autofill is applied
     * if it is a single order or the very last order in a list. If we apply autofill to any order before
     * the last one in a list, we may change the balances of a token and subsequent orders for the same token
     * may expect the balances before the tx has started. Total 20 Y available. 2 orders entered.
     * Ord1 Sell 12 Y and Ord2 Sell another 8 Y. if we autofill on Ord1, Ord2 will revert the entire tx with P-AFNE
     * In this case it will attempt to autofill on Ord2 but it won't since there will be no inventory available.
     * if Ord1 Sell 12 Y and Ord2 Sell another 7 Y , then there is 1 Y available that can be used for autofill.
     * @param   _revertOrders  controls the revert logic
     * if true, it is called from deprecated addOrder function, it will revert with the a rejectReason for backward
     * compatibility.\
     * if false, it is called from addOrderList or new addOrder function. it will reject the order by emitting
     * OrderStatusChange with "status" = REJECTED and "code" = rejectReason instead of reverting.
     * Should be removed when deprecated addOrder method is removed
     */
    function addOrderPrivate(
        address _msgSender,
        NewOrder memory _order,
        bool _autofill,
        bool _revertOrders
    ) private whenNotPaused {
        // Returns applicable price for Type1=MARKET
        // OR _price unchanged for Type1=LIMIT
        // OR 0 price along with a rejectReason
        (uint256 price, bytes32 rejectReason) = addOrderChecks(_msgSender, _order);
        if (price == 0) {
            // order can't be processed.
            if (_revertOrders) {
                revert(UtilsLibrary.bytes32ToString(rejectReason)); // revert to keep single order logic backward compatible
            } else {
                // Coming from new functions: Raise Event instead of Revert
                // Some fields are initialized with 0
                Order memory rejectedOrder = Order(
                    bytes32(0), // id - Rejecting order before assigning an orderid
                    _order.clientOrderId,
                    _order.tradePairId,
                    _order.price,
                    0, //totalAmount
                    _order.quantity,
                    0, //quantityFilled
                    0, // totalFee
                    _order.traderaddress,
                    _order.side,
                    _order.type1,
                    _order.type2,
                    Status.REJECTED,
                    uint32(block.number) //updateBlock
                );
                emit OrderStatusChanged(
                    ORDER_STATUS_CHANGED_VERSION,
                    rejectedOrder.traderaddress,
                    rejectedOrder.tradePairId,
                    rejectedOrder,
                    rejectedOrder.updateBlock, // previous update block is the same as updateBlock
                    rejectReason
                );
                return; // reject & stop processing the order
            }
        }

        TradePair storage tradePair = tradePairMap[_order.tradePairId];
        bytes32 orderId = getNextOrderId();
        clientOrderIDMap[_order.traderaddress][_order.clientOrderId] = orderId;
        Order storage order = orderMap[orderId];
        order.id = orderId;
        order.clientOrderId = _order.clientOrderId;
        order.tradePairId = _order.tradePairId;
        order.traderaddress = _order.traderaddress;
        order.price = price;
        order.quantity = _order.quantity;
        // for new orders this ensures that previousUpdateBlock is the same as updateBlock
        order.updateBlock = uint32(block.number);
        if (_order.side != Side.BUY) {
            // evm initialized to BUY already
            order.side = _order.side;
        }
        if (_order.type1 != Type1.MARKET) {
            // evm initialized to MARKET already
            order.type1 = _order.type1;
            if (_order.type2 != Type2.GTC) {
                // evm initialized to GTC already
                // MARKET orders can only be GTC
                // All auction orders have to be LIMIT & GTC
                order.type2 = UtilsLibrary.matchingAllowed(tradePair.auctionMode) ? _order.type2 : Type2.GTC;
            }
        }
        //order.totalAmount= 0;         // evm initialized
        //order.quantityFilled= 0;      // evm initialized
        //order.status= Status.NEW;     // evm initialized
        //order.totalFee= 0;            // evm initialized

        //Skip matching if in Auction Mode
        uint quantityRemaining = order.quantity;
        if (UtilsLibrary.matchingAllowed(tradePair.auctionMode)) {
            quantityRemaining = matchOrder(order.id, maxNbrOfFills);
        }

        bytes32 adjSymbol = order.side == Side.BUY ? tradePair.quoteSymbol : tradePair.baseSymbol;

        if (_order.type1 == Type1.MARKET) {
            order.price = 0; //Reset the market order price back to 0
        } else {
            if (order.type2 == Type2.FOK) {
                require(quantityRemaining == 0, "T-FOKF-01");
            }
            if (_order.type2 == Type2.IOC && quantityRemaining > 0) {
                order.status = Status.CANCELED;
            }
            // Unfilled Limit Orders Go in the Orderbook (Including Auction Orders)
            if (
                quantityRemaining > 0 &&
                order.status != Status.CANCELED &&
                (order.type2 == Type2.GTC || order.type2 == Type2.PO)
            ) {
                bytes32 bookIdSameSide = order.side == Side.BUY ? tradePair.buyBookId : tradePair.sellBookId;
                orderBooks.addOrder(bookIdSameSide, order.id, order.price);

                uint256 adjAmount = order.side == Side.BUY
                    ? UtilsLibrary.getQuoteAmount(tradePair.baseDecimals, order.price, quantityRemaining)
                    : quantityRemaining;
                portfolio.adjustAvailable(IPortfolio.Tx.DECREASEAVAIL, order.traderaddress, adjSymbol, adjAmount);
            }
        }
        // EMIT order status. if no fills, the status will be NEW, if any fills status will be either PARTIAL or FILLED
        // when taker order,  previousupdateblock = updateblock
        emitStatusUpdate(order.id);
        if (_autofill) {
            // Only called if it is a single order or the very last order in an order list.
            // if any funds available for ALOT or adjSymbol in the portfolio then use it to autoFill the gasTank.
            portfolio.autoFill(order.traderaddress, adjSymbol);
        }
        removeClosedOrder(order.id);
    }

    /**
     * @notice  Function to match Auction orders
     * @dev     Requires `DEFAULT_ADMIN_ROLE`, also called by `ExchangeSub.matchAuctionOrders` that
     * requires `AUCTION_ADMIN_ROLE`.
     * @param   _takerOrderId  Taker Order id
     * @param   _maxNbrOfFills   controls max number of fills an order can get at a time to avoid running out of gas
     * @return  uint256  Remaining quantity of the taker order
     */
    function matchAuctionOrder(
        bytes32 _takerOrderId,
        uint256 _maxNbrOfFills
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        TradePair storage tradePair = tradePairMap[orderMap[_takerOrderId].tradePairId];
        require(tradePair.auctionMode == AuctionMode.MATCHING, "T-AUCT-01");
        require(tradePair.auctionPrice > 0, "T-AUCT-03");
        return matchOrder(_takerOrderId, _maxNbrOfFills);
    }

    /**
     * @notice  Matches a taker order with maker orders in the opposite Orderbook before
     * it is entered in its own orderbook.
     * Also handles matching auction orders.
     * @dev     IF BUY order, it will try to match with an order in the SELL OrderBook and vice versa
     * A taker order that is entered can match with multiple maker orders that are waiting in the orderbook.
     * This function may run out of gas not because of the single taker order but because of the number of
     * maker orders that are matching with it. This variable is ESSENTIAL for tradepairs in AUCTION_MODE== MATCHING
     * because we are guaranteed to run into such situations where a single large SELL order (quantity 1000)
     * is potentially matched with multiple small BUY orders (1000 orders with quantity 1) , creating 1000 matches
     * which will run out of gas.
     * @param   _takerOrderId  Taker Order id
     * @param   _maxNbrOfFills  Max number of fills an order can get at a time to avoid running out of gas
     * (Defaults to maxNbrOfFills=100).
     * @return  uint256  Remaining quantity of the taker order
     */
    function matchOrder(bytes32 _takerOrderId, uint256 _maxNbrOfFills) private returns (uint256) {
        Order storage takerOrder = orderMap[_takerOrderId];
        Side side = takerOrder.side;
        TradePair storage tradePair = tradePairMap[takerOrder.tradePairId];
        // Get the opposite Book. if buying need to match with SellBook and vice versa
        bytes32 bookId = side == Side.BUY ? tradePair.sellBookId : tradePair.buyBookId;

        (uint256 price, bytes32 makerOrderId) = orderBooks.getTopOfTheBook(bookId);

        Order storage makerOrder;
        uint256 quantity;
        uint256 takerRemainingQuantity = UtilsLibrary.getRemainingQuantity(
            takerOrder.quantity,
            takerOrder.quantityFilled
        );
        // Don't need price > 0 check as orderBooks.getHead(bookId,price) != ""
        // which is makerOrderId != "" takes care of it
        while (
            takerRemainingQuantity > 0 &&
            makerOrderId != "" &&
            (side == Side.BUY ? takerOrder.price >= price : takerOrder.price <= price) &&
            _maxNbrOfFills > 0
        ) {
            makerOrder = orderMap[makerOrderId];
            quantity = orderBooks.matchTrade(
                bookId,
                price,
                takerRemainingQuantity,
                UtilsLibrary.getRemainingQuantity(makerOrder.quantity, makerOrder.quantityFilled)
            );

            if (tradePair.auctionMode == AuctionMode.MATCHING) {
                // In the typical flow, takerOrder amounts are all available and not locked
                // In auction, taker order amounts are locked like a maker order and
                // has to be made available before addExecution
                portfolio.adjustAvailable(
                    IPortfolio.Tx.INCREASEAVAIL,
                    takerOrder.traderaddress,
                    tradePair.baseSymbol,
                    quantity
                );
                // In Auction, all executions should be at auctionPrice
                price = tradePair.auctionPrice;
            }
            addExecution(makerOrder.id, takerOrder.id, price, quantity); // this makes a state change to Order Map

            if (tradePair.auctionMode == AuctionMode.MATCHING && makerOrder.price > tradePair.auctionPrice) {
                // Increase the available by the difference between the makerOrder & the auction Price
                portfolio.adjustAvailable(
                    IPortfolio.Tx.INCREASEAVAIL,
                    makerOrder.traderaddress,
                    tradePair.quoteSymbol,
                    UtilsLibrary.getQuoteAmount(
                        tradePair.baseDecimals,
                        makerOrder.price - tradePair.auctionPrice,
                        quantity
                    )
                );
            }
            removeClosedOrder(makerOrder.id);
            (price, makerOrderId) = orderBooks.getTopOfTheBook(bookId);
            takerRemainingQuantity = UtilsLibrary.getRemainingQuantity(takerOrder.quantity, takerOrder.quantityFilled);
            _maxNbrOfFills--;
        }

        if (tradePair.auctionMode == AuctionMode.MATCHING) {
            // when taker order, previousupdateblock = updateblock
            emitStatusUpdate(takerOrder.id); // EMIT taker order's status update
            if (takerRemainingQuantity == 0) {
                // Remove the taker auction order from the sell orderbook
                orderBooks.removeFirstOrder(tradePair.sellBookId, takerOrder.price);
                removeClosedOrder(takerOrder.id);
            }
        } else if (takerRemainingQuantity > 0 && (_maxNbrOfFills == 0 || takerOrder.type1 == Type1.MARKET)) {
            // This is not applicable to Auction Matching Mode
            // if an order gets the max number of fills in a single block, it gets CANCELED for the
            // remaining amount to protect the above loop from running out of gas.
            // OR IF the Market Order fills all the way to the worst price and still has remaining,
            // it gets CANCELED for the remaining amount.
            takerOrder.status = Status.CANCELED;
        }

        return takerRemainingQuantity;
    }

    /**
     * @notice  Admin Function to cancel orders in the orderbook when delisting a trade pair
     * @dev     TradePair needs to be paused. No orders can be entered/canceled by users in this state
     * The admin can not pick and choose a particular order. He can only pick the number of orders to cancel and
     * the order book to cancel them from. It always start canceling/clearing the orderbook from the bottom of the
     * book where orders are way off-market. This way, this function's admin powers are much more limited,
     * as it will have to cancel a lot of orders before it reaches the orders that are financially viable to
     * manipulate and one side of the entire orderbook would be almost empty by then
     * @param   _tradePairId  id of the trading pair
     * @param   _isBuyBook  true if buy Orderbook
     * @param   _maxCount  controls max number of orders to cancel at a time to avoid running out of gas
     */
    function unsolicitedCancel(
        bytes32 _tradePairId,
        bool _isBuyBook,
        uint256 _maxCount
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        require(tradePair.pairPaused, "T-PPAU-04");
        //Need to be able to cancel when tradePair is paused
        bytes32 bookId = _isBuyBook ? tradePair.buyBookId : tradePair.sellBookId;
        (uint256 price, bytes32 orderId) = orderBooks.getBottomOfTheBook(bookId);
        while (orderId != "" && _maxCount > 0) {
            doOrderCancel(orderId, false); //Admin Function, no autofill needed
            (price, orderId) = orderBooks.getBottomOfTheBook(bookId);
            _maxCount--;
        }
    }

    /**
     * @notice  Cancels an order and immediately enters a similar order in the same direction.
     * @dev     Only the quantity and the price of the order can be changed. All the other order
     * fields are copied from the canceled order to the new order.
     * The time priority of the original order is lost.
     * Canceled order's locked quantity is made available for the new order within this tx
     * This function will technically accept the same clientOrderId as the previous because when the previous order
     * is cancelled it is removed from the mapping and the previous clientOrderId is now available. Not recommended!
     * @param   _orderId  order id to cancel
     * @param   _clientOrderId  client order id of the new order
     * @param   _price  price of the new order
     * @param   _quantity  quantity of the new order
     */
    function cancelReplaceOrder(
        bytes32 _orderId,
        bytes32 _clientOrderId,
        uint256 _price,
        uint256 _quantity
    ) external override nonReentrant {
        Order storage order = orderMap[_orderId];
        require(order.id != bytes32(0), "T-OAEX-01");
        require(order.traderaddress == msg.sender, "T-OOCC-01");
        NewOrder memory newOrder = NewOrder(
            _clientOrderId,
            order.tradePairId,
            _price,
            _quantity,
            order.traderaddress,
            order.side,
            order.type1,
            order.type2
        );
        doOrderCancel(order.id, false); // let autofill run in addOrderPrivate in the next line
        addOrderPrivate(msg.sender, newOrder, true, true);
    }

    /**
     * @notice  Cancels an order given the order id supplied
     * @dev     FILLED & CANCELED orders are removed from the blockchain state.
     * Will emit OrderStatusChanged "status" = CANCEL_REJECT, "code"= "T-OAEX-01" for orders that are
     * already canceled/filled.
     * The remaining status are NEW & PARTIAL and they are ok to cancel
     * Will emit OrderStatusChanged "status" = CANCEL_REJECT, "code"= T-OOCC-02" if the order.traderaddress
     * of the order that is canceled is different than msg.sender
     * Will only revert if tradePair.pairPaused is set to true by admins
     * @param   _orderId  order id to cancel
     */
    function cancelOrder(bytes32 _orderId) external override nonReentrant {
        cancelOrderPrivate(msg.sender, _orderId, true); // Single Cancel, default autofill to true
    }

    /**
     * @notice  Cancels an order given the order id supplied
     * @dev     See cancelOrder
     * @param   _msgSender  address of the msg.Sender
     * @param   _orderId  order id to cancel
     * @param   _autofill  controls the autofill logic. Autofill is applied
     * if it is a single cancel or the very last cancel in a cancel list.
     */
    function cancelOrderPrivate(address _msgSender, bytes32 _orderId, bool _autofill) private whenNotPaused {
        Order storage order = orderMap[_orderId];
        bytes32 rejectReason;
        if (order.id == bytes32(0)) {
            // Cancel Reject if the order is CLOSED
            rejectReason = UtilsLibrary.stringToBytes32("T-OAEX-01");
        } else if (order.traderaddress != _msgSender) {
            // Cancel Reject if the order is not owned by the msgSender
            rejectReason = UtilsLibrary.stringToBytes32("T-OOCC-02");
        }

        if (rejectReason == bytes32(0)) {
            TradePair storage tradePair = tradePairMap[order.tradePairId];
            require(!tradePair.pairPaused, "T-PPAU-02");
            doOrderCancel(order.id, _autofill);
        } else {
            //It takes less contract space in here to do a few assignments instead of
            //Order memory rejectedOrder = Order(....)
            Order memory rejectedOrder;
            rejectedOrder.traderaddress = _msgSender;
            rejectedOrder.id = _orderId;
            rejectedOrder.status = Status.CANCEL_REJECT;
            rejectedOrder.type1 = Type1.LIMIT; //Can't cancel a MARKET order so defaulting to LIMIT
            // rejectedOrder.updateBlock = 0; // Order hasn't been updated. This is a reject only
            // All other fields are initialized with default values as their values are unknown
            // rejectedOrder.side = Side.BUY
            // rejectedOrder.type2 = Type2.GTC

            emit OrderStatusChanged(
                ORDER_STATUS_CHANGED_VERSION,
                _msgSender, //assuming msg sender is the owner of the order to be canceled.
                bytes32(0), //tradePairId value is unknown
                rejectedOrder,
                0, // previous update block unknown
                rejectReason // Reject reason
            );
        }
    }

    /**
     * @notice  To Cancel and then add multiple Orders in a single transaction designed specifically for Market Makers
     * @dev     It calls cancelOrderList and then addLimitOrderList functions
     * Cancels all the orders in the _orderIds list and then adds the orders in the _orders list immediately in the same block.
     * Cancel List is completely independent of the new list to be added. In other words, you can technically cancel 2 orders
     * from 2 different tradepairs and then add 5 new orders for a third tradePairId.
     * Canceled order's locked quantity is made available for the new order within this tx if they are for the same pair.
     * Call with Maximum ~15 orders at a time for a block size of 30M
     * When processing cancellations list (_orderIdsToCancel) ******
     * Will emit OrderStatusChanged "status" = CANCEL_REJECT, "code"= "T-OAEX-01" for orders that are already canceled/filled \
     * In this case, because the closed orders are already removed from the blockchain, all values in the OrderStatusChanged
     * event except "orderId", "traderaddress", "status" and "code" fields will be empty/default values. This includes the
     * indexed field "pair" which you may use as filters for your event listeners. Hence you should process the
     * transaction log rather than relying on your event listeners if you need to capture CANCEL_REJECT messages and
     * filtering your events using the "pair" field.
     * Will emit OrderStatusChanged "status" = CANCEL_REJECT, "code"= T-OOCC-02" if the traderaddress
     * of the order that is being canceled is different than msg.sender
     * if any of the cancels are rejected, the rest of the cancel request will still be processed.
     * When processing the NEW Orders list(_orders) ******
     * if a single order in the new list reverts due to insufficient funds or if the msg sender is different than the
     * order.traderaddress, the entire transaction is reverted. No orders nor cancels will go through. Otherwise, this
     * function will only revert if either tradePair.pairPaused or tradePair.addOrderPaused is set to true by admins  \
     * For the rest of the order level check failures, It will reject but not revert those orders by emitting
     * OrderStatusChanged event with "status" = Status.REJECTED and "code" = rejectReason
     * In other words, if any of the new orders are rejected, the rest of the new orders will still be processed.
     * New Order rejects will only be raised if called from this function. Single orders entered using addOrder
     * function will revert as before for backward compatibility. \
     * See addOrderChecks function. Every line that starts with return (0, rejectReason) will be rejected.
     * @param   _orderIdsToCancel  array of order ids to be canceled
     * @param   _orders  array of newOrder struct to be sent out. See ITradePairs.NewOrder
     * Sample typescript code
     * const orderIdsToCancel =["id1","id2"];
     * const orders = [];
     * const order = { traderaddress: Ox
     *               , clientOrderId: Oxid3
     *               , tradePairId:
     *               , price:
     *               , quantity:
     *               , side: 0  // Buy
     *               , type1: 1 // Limit
     *               , type2: 3 //PO
     *          };
     * orders.push(order);
     * await tradePairs.cancelAddList(orderIdsToCancel, orders);
     */
    function cancelAddList(
        bytes32[] calldata _orderIdsToCancel,
        NewOrder[] calldata _orders
    ) external override nonReentrant {
        cancelOrderListPrivate(msg.sender, _orderIdsToCancel, false); // Don't autofill while processing the cancels list
        addOrderListPrivate(msg.sender, _orders); // will autofill when processing the last order in the add list
    }

    /**
     * @notice  Cancels all the orders in the array of order ids supplied
     * @dev     This function may run out of gas if a trader is trying to cancel too many orders
     * Call with Maximum ~50 orders at a time for a block size of 30M
     * Will emit OrderStatusChanged "status" = CANCEL_REJECT, "code"= "T-OAEX-01" for orders that are already
     * canceled/filled while continuing to cancel the remaining open orders in the list. \
     * Because the closed orders are already removed from the blockchain, all values in the OrderStatusChanged
     * event except "orderId", "traderaddress", "status" and "code" fields will be empty/default values. This includes the
     * indexed field "pair" which you may use as filters for your event listeners. Hence you should process the
     * transaction log rather than relying on your event listeners if you need to capture CANCEL_REJECT messages and
     * filtering your events using the "pair" field.
     * @param   _orderIds  array of order ids
     */
    function cancelOrderList(bytes32[] calldata _orderIds) external override nonReentrant {
        cancelOrderListPrivate(msg.sender, _orderIds, true); // will autofill with the last cancel in the cancel list
    }

    /**
     * @notice  Cancels all the orders in the array of order ids supplied
     * @dev     See cancelOrderList
     * @param   _msgSender  array of order ids to be canceled
     * @param   _orderIds   array of order ids
     * @param   _autofill  controls the autofill logic. Autofill only when processing the last
     * cancel in the cancel list & if also the _autofill flag is true
     */
    function cancelOrderListPrivate(address _msgSender, bytes32[] calldata _orderIds, bool _autofill) private {
        for (uint256 i = 0; i < _orderIds.length; ++i) {
            cancelOrderPrivate(_msgSender, _orderIds[i], i == _orderIds.length - 1 && _autofill);
        }
    }

    /**
     * @notice  Cancels an order and makes the locked amount available in the portfolio
     * @param   _orderId  order id to cancel
     * @param   _autofill when true autofills the user's gas tank if it is below the treshold
     */
    function doOrderCancel(bytes32 _orderId, bool _autofill) private {
        //DO not add requires here for unsolicitedCancel to work
        Order storage order = orderMap[_orderId];
        TradePair storage tradePair = tradePairMap[order.tradePairId];
        order.status = Status.CANCELED;

        bytes32 bookId = order.side == Side.BUY ? tradePair.buyBookId : tradePair.sellBookId;
        bytes32 adjSymbol = order.side == Side.BUY ? tradePair.quoteSymbol : tradePair.baseSymbol;
        uint256 adjAmount = order.side == Side.BUY
            ? UtilsLibrary.getQuoteAmount(
                tradePair.baseDecimals,
                order.price,
                UtilsLibrary.getRemainingQuantity(order.quantity, order.quantityFilled)
            )
            : UtilsLibrary.getRemainingQuantity(order.quantity, order.quantityFilled);

        orderBooks.removeOrder(bookId, _orderId, order.price);
        portfolio.adjustAvailable(IPortfolio.Tx.INCREASEAVAIL, order.traderaddress, adjSymbol, adjAmount);

        emitStatusUpdate(order.id);

        if (_autofill) {
            // we just made some funds available for the adjSymbol, so we can autofill without worrying about
            // funds availability
            portfolio.autoFill(order.traderaddress, adjSymbol);
        }
        removeClosedOrder(order.id);
    }

    // solhint-disable-next-line payable-fallback
    fallback() external {
        revert("T-NFUN-01");
    }
}
