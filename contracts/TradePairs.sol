// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./library/UtilsLibrary.sol";

import "./interfaces/IPortfolio.sol";
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
    bytes32 public constant VERSION = bytes32("2.1.0");

    // denominator for rate calculations
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
    IPortfolio private portfolio;

    bytes32 public constant ON_BEHALFOF_ROLE = keccak256("ON_BEHALFOF_ROLE");

    //Event versions to better communicate changes to listening components
    uint8 private constant NEW_TRADE_PAIR_VERSION = 1;
    uint8 private constant ORDER_STATUS_CHANGED_VERSION = 1;
    uint8 private constant EXECUTED_VERSION = 1;
    uint8 private constant PARAMETER_UPDATED_VERSION = 1;

    /**
     * @notice  initializer function for Upgradeable TradePairs
     * @dev     idCounter needs to be unique for each order and execution id.
     * Both the orderbooks and the portolio should be deployed before tradepairs.
     * @param   _orderbooks  orderbooks instance
     * @param   _portfolio  portfolio instance
     */
    function initialize(address _orderbooks, address _portfolio) public initializer {
        __AccessControlEnumerable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        // intitialize deployment account to have DEFAULT_ADMIN_ROLE
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        idCounter = block.timestamp;
        orderBooks = OrderBooks(_orderbooks);
        portfolio = IPortfolio(_portfolio);
    }

    /**
     * @notice  Adds a new TradePair
     * @dev     Only DEFAULT_ADMIN or ExchangeSub can call this function which has this role.
     * ExhangeSub makes sure that the symbols are added to the portfolio with the
     * correct addresses first.
     * @param   _tradePairId  id of the trading pair
     * @param   _baseSymbol  symbol of the base asset
     * @param   _baseDecimals  evm decimals of the base asset
     * @param   _baseDisplayDecimals  display decimals of the base Asset. Quantity increment
     * @param   _quoteSymbol  symbol of the quote asset
     * @param   _quoteDecimals  evm decimals of the quote asset
     * @param   _quoteDisplayDecimals  display decimals of the quote Asset. Price increment
     * @param   _minTradeAmount  minimum trade amount
     * @param   _maxTradeAmount  maximum trade amount
     * @param   _mode  Auction Mode of the auction token. Auction token is always the BASE asset.
     */
    function addTradePair(
        bytes32 _tradePairId,
        bytes32 _baseSymbol,
        uint8 _baseDecimals,
        uint8 _baseDisplayDecimals,
        bytes32 _quoteSymbol,
        uint8 _quoteDecimals,
        uint8 _quoteDisplayDecimals,
        uint256 _minTradeAmount,
        uint256 _maxTradeAmount,
        AuctionMode _mode
    ) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "T-OACC-01");
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
            tradePair.baseSymbol = _baseSymbol;
            tradePair.baseDecimals = _baseDecimals;
            tradePair.baseDisplayDecimals = _baseDisplayDecimals;
            tradePair.quoteSymbol = _quoteSymbol;
            tradePair.quoteDecimals = _quoteDecimals;
            tradePair.quoteDisplayDecimals = _quoteDisplayDecimals;
            tradePair.minTradeAmount = _minTradeAmount;
            tradePair.maxTradeAmount = _maxTradeAmount;
            tradePair.buyBookId = buyBookId;
            tradePair.sellBookId = sellBookId;
            tradePair.makerRate = 10; // makerRate=10 (0.10% = 10/10000)
            tradePair.takerRate = 20; // takerRate=20 (0.20% = 20/10000)
            // with default allowedSlippagePercent of 20, the market orders cannot be filled
            // worst than 80% of the bestBid and 120% of bestAsk
            tradePair.allowedSlippagePercent = 20; // allowedSlippagePercent=20 (20% = 20/100)
            // tradePair.addOrderPaused = false;   // addOrder is not paused by default (EVM initializes to false)
            // tradePair.pairPaused = false;       // pair is not paused by default (EVM initializes to false)

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
     * @notice  Gets a list of the trade Pairs
     * @dev     All pairs are returned. Even the delisted ones.
     * @return  bytes32[]  Array of trade Pairs .
     */
    function getTradePairs() external view override returns (bytes32[] memory) {
        return tradePairsArray;
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
     * @param   _pause  true to pause, false to unpause
     */
    function pauseTradePair(bytes32 _tradePairId, bool _pause) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        tradePairMap[_tradePairId].pairPaused = _pause;
    }

    /**
     * @notice  Pauses adding new orders to a specific Trade Pair
     * @dev     Can only be called by DEFAULT_ADMIN.
     * @param   _tradePairId  id of the trading pair
     * @param   _pause  true to pause, false to unpause
     */
    function pauseAddOrder(bytes32 _tradePairId, bool _pause) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        tradePairMap[_tradePairId].addOrderPaused = _pause;
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
     * @notice  Sets the auction mode of a specific Trade Pair
     * @dev     Need to be able to call it internally from the constructor
     * @param   _tradePairId  id of the trading pair
     * @param   _mode  Auction Mode
     */
    function setAuctionModePrivate(bytes32 _tradePairId, AuctionMode _mode) private {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = uint256(tradePair.auctionMode);
        tradePair.auctionMode = _mode;
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
     * @notice  Returns the auction mode and the auction price of a specific Trade Pair
     * @param   _tradePairId  id of the trading pair
     * @return  mode  auction mode
     * @return  price  auction price
     */
    function getAuctionData(bytes32 _tradePairId) external view override returns (uint8 mode, uint256 price) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        mode = uint8(tradePair.auctionMode);
        price = tradePair.auctionPrice;
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
    function setMinTradeAmount(bytes32 _tradePairId, uint256 _minTradeAmount)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = tradePair.minTradeAmount;
        tradePair.minTradeAmount = _minTradeAmount;
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-MINTRAMT", oldValue, _minTradeAmount);
    }

    /**
     * @notice  Returns the minimum trade amount allowed for a specific Trade Pair
     * @dev     The min trade amount needs to satisfy
     * `getQuoteAmount(_price, _quantity, _tradePairId) >= _minTradeAmount`
     * @param   _tradePairId  id of the trading pair
     * @return  uint256  minimum trade amount in terms of quote asset
     */
    function getMinTradeAmount(bytes32 _tradePairId) external view override returns (uint256) {
        return tradePairMap[_tradePairId].minTradeAmount;
    }

    /**
     * @notice  Sets the maximum trade amount allowed for a specific Trade Pair
     * @dev     Can only be called by DEFAULT_ADMIN. The max trade amount needs to satisfy
     * `getQuoteAmount(_price, _quantity, _tradePairId) <= _maxTradeAmount`
     * @param   _tradePairId  id of the trading pair
     * @param   _maxTradeAmount  maximum trade amount in terms of quote asset
     */
    function setMaxTradeAmount(bytes32 _tradePairId, uint256 _maxTradeAmount)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = tradePair.maxTradeAmount;
        tradePair.maxTradeAmount = _maxTradeAmount;
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-MAXTRAMT", oldValue, _maxTradeAmount);
    }

    /**
     * @notice  Returns the maximum trade amount allowed for a specific Trade Pair
     * @dev     The max trade amount needs to satisfy
     * `getQuoteAmount(_price, _quantity, _tradePairId) <= _maxTradeAmount`
     * @param   _tradePairId  id of the trading pair
     * @return  uint256  maximum trade amount in terms of quote asset
     */
    function getMaxTradeAmount(bytes32 _tradePairId) external view override returns (uint256) {
        return tradePairMap[_tradePairId].maxTradeAmount;
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
        for (uint256 i = 0; i < size; i++) {
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
     * @notice  Returns the display decimals of the base or the quote asset in a tradePair
     * @dev     Display decimals can also be referred as
     * `Quantity Increment if _isBase==true` or `PriceIncrement if _isBase==false`
     * @param   _tradePairId  id of the trading pair
     * @param   _isBase  true/false
     * @return  uint8  display decimal
     */
    function getDisplayDecimals(bytes32 _tradePairId, bool _isBase) external view override returns (uint8) {
        return
            _isBase ? tradePairMap[_tradePairId].baseDisplayDecimals : tradePairMap[_tradePairId].quoteDisplayDecimals;
    }

    /**
     * @notice  Returns the evm decimals of the base or the quote symbol in a tradePair
     * @dev     The decimals is identical to decimals value from ERC20 contract of the symbol.
     * It is 18 for ALOT and AVAX.
     * @param   _tradePairId  id of the trading pair
     * @param   _isBase  true/false
     * @return  uint8  evm decimal
     */
    function getDecimals(bytes32 _tradePairId, bool _isBase) external view override returns (uint8) {
        return _isBase ? tradePairMap[_tradePairId].baseDecimals : tradePairMap[_tradePairId].quoteDecimals;
    }

    /**
     * @notice  Returns the base or quote symbol
     * @param   _tradePairId  id of the trading pair
     * @param   _isBase  true/false
     * @return  bytes32  symbol in bytes32
     */
    function getSymbol(bytes32 _tradePairId, bool _isBase) external view override returns (bytes32) {
        return _isBase ? tradePairMap[_tradePairId].baseSymbol : tradePairMap[_tradePairId].quoteSymbol;
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
     * @notice  Returns Maker Rate (Commission)
     * @param   _tradePairId  id of the trading pair
     * @return  uint8  maker Rate
     */
    function getMakerRate(bytes32 _tradePairId) external view override returns (uint8) {
        return tradePairMap[_tradePairId].makerRate;
    }

    /**
     * @notice  Returns Taker Rate (Commission)
     * @param   _tradePairId  id of the trading pair
     * @return  uint8  taker Rate
     */
    function getTakerRate(bytes32 _tradePairId) external view override returns (uint8) {
        return tradePairMap[_tradePairId].takerRate;
    }

    /**
     * @notice  sets the slippage percent for market orders, before it gets unsolicited cancel
     * @dev     Can only be called by DEFAULT_ADMIN. Market Orders will be filled up to allowedSlippagePercent
     * from the marketPrice(bestbid or bestask) to protect the trader. The remaining quantity gets
     * unsolicited cancel
     * @param   _tradePairId  id of the trading pair
     * @param   _allowedSlippagePercent  allowed slippage percent=20 (Default = 20 : 20% = 20/100)
     */
    function setAllowedSlippagePercent(bytes32 _tradePairId, uint8 _allowedSlippagePercent)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        uint256 oldValue = tradePair.allowedSlippagePercent;
        tradePair.allowedSlippagePercent = _allowedSlippagePercent;
        emit ParameterUpdated(PARAMETER_UPDATED_VERSION, _tradePairId, "T-SLIPPAGE", oldValue, _allowedSlippagePercent);
    }

    /**
     * @notice  Allowed slippage percent for market orders, before the market order gets an unsolicited cancel.
     * @param   _tradePairId  id of the trading pair
     * @return  uint8  slippage percent
     */
    function getAllowedSlippagePercent(bytes32 _tradePairId) external view override returns (uint8) {
        return tradePairMap[_tradePairId].allowedSlippagePercent;
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
    )
        external
        view
        override
        returns (
            uint256[] memory,
            uint256[] memory,
            uint256,
            bytes32
        )
    {
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
    function getOrder(bytes32 _orderId) public view override returns (Order memory) {
        return orderMap[_orderId];
    }

    /**
     * @notice  Returns order details given the trader and the clientOrderId
     * @param   _trader  user's address
     * @param   _clientOrderId   client Order id assigned by the user
     * @return  Order  Order Struct
     */
    function getOrderByClientOrderId(address _trader, bytes32 _clientOrderId)
        external
        view
        override
        returns (Order memory)
    {
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

    // get quote amount
    /**
     * @notice  Returns the quote amount for a given price and quantity
     * @param   _tradePairId  id of the trading pair
     * @param   _price  price
     * @param   _quantity  quantity
     * @return  uint256  quote amount
     */
    function getQuoteAmount(
        bytes32 _tradePairId,
        uint256 _price,
        uint256 _quantity
    ) public view override returns (uint256) {
        return (_price * _quantity) / 10**tradePairMap[_tradePairId].baseDecimals;
    }

    /**
     * @notice  Emits a given order's latest state
     * @dev     The details of the emitted event is as follows: \
     * *version*  event version \
     * *traderaddress*  traders’s wallet (immutable) \
     * *pair*  traded pair. ie. ALOT/AVAX in bytes32 (immutable) \
     * *orderId*  unique order id assigned by the contract (immutable) \
     * *clientOrderId*  client order id given by the sender of the order as a reference (immutable) \
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
     *          REJECTED, -- not used
     *          PARTIAL,
     *          FILLED,
     *          CANCELED,
     *          EXPIRED, -- not used
     *          KILLED -- not used
     *       }
     * ```
     * *quantityfilled*  cumulative quantity filled \
     * *totalfee* cumulative fee paid for the order (total fee is always in terms of
     * received(incoming) currency. ie. if Buy ALOT/AVAX, fee is paid in ALOT, if Sell
     * ALOT/AVAX , fee is paid in AVAX \
     * Note: Order price can be different than the execution price.
     * @param   _orderId  order id
     */
    function emitStatusUpdate(bytes32 _orderId) private {
        Order storage order = orderMap[_orderId];
        emit OrderStatusChanged(
            ORDER_STATUS_CHANGED_VERSION,
            order.traderaddress,
            order.tradePairId,
            order.id,
            order.clientOrderId,
            order.price,
            order.totalAmount,
            order.quantity,
            order.side,
            order.type1,
            order.type2,
            order.status,
            order.quantityFilled,
            order.totalFee
        );
    }

    /**
     * @notice  Calculates the commission and updates the order state after an execution
     * @dev     Updates the `totalAmount`, `quantityFilled`, `totalFee` and the status of the order.
     * Commissions are rounded down based on evm and display decimals to avoid DUST
     * @param   _orderId  order id to update
     * @param   _price  execution price ( Can be different than order price)
     * @param   _quantity  execution quantity
     * @param   _rate  maker or taker rate
     * @return  uint256  last fee charged
     */
    function handleExecution(
        bytes32 _orderId,
        uint256 _price,
        uint256 _quantity,
        uint8 _rate
    ) private returns (uint256) {
        Order storage order = orderMap[_orderId];
        TradePair storage tradePair = tradePairMap[order.tradePairId];
        require(order.status != Status.CANCELED, "T-OACA-01");
        order.quantityFilled += _quantity;
        require(order.quantityFilled <= order.quantity, "T-CQFA-01");
        order.status = order.quantity == order.quantityFilled ? Status.FILLED : Status.PARTIAL;
        uint256 amount = getQuoteAmount(order.tradePairId, _price, _quantity);
        order.totalAmount += amount;
        // Rounding Down the fee based on display decimals to avoid DUST
        uint256 lastFeeRounded = order.side == Side.BUY
            ? UtilsLibrary.floor((_quantity * _rate) / TENK, tradePair.baseDecimals - tradePair.baseDisplayDecimals)
            : UtilsLibrary.floor((amount * _rate) / TENK, tradePair.quoteDecimals - tradePair.quoteDisplayDecimals);
        order.totalFee += lastFeeRounded;
        return lastFeeRounded;
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
    function addExecution(
        bytes32 _makerOrderId,
        bytes32 _takerOrderId,
        uint256 _price,
        uint256 _quantity
    ) private {
        Order storage makerOrder = orderMap[_makerOrderId];
        TradePair storage tradePair = tradePairMap[makerOrder.tradePairId];
        Order storage takerOrder = orderMap[_takerOrderId];
        uint256 mlastFee = handleExecution(makerOrder.id, _price, _quantity, tradePair.makerRate);
        uint256 tlastFee = handleExecution(takerOrder.id, _price, _quantity, tradePair.takerRate);
        uint256 qAmount = getQuoteAmount(makerOrder.tradePairId, _price, _quantity);
        portfolio.addExecution(
            makerOrder.side,
            makerOrder.traderaddress,
            takerOrder.traderaddress,
            tradePair.baseSymbol,
            tradePair.quoteSymbol,
            _quantity,
            qAmount,
            mlastFee,
            tlastFee
        );
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
     * @notice  Checks if order can be entered without any issues
     * @dev     Checks if tradePair or addOrder is paused as well as
     * if decimals, order types and clientOrderId are supplied properly \
     * @dev     clientorderid is sent by the owner of an order and it is returned in responses for
     * reference. It must be unique per traderaddress.
     * @param   _trader  trader address
     * @param   _clientOrderId  unique id provided by the owner of an order
     * @param   _tradePairId  id of the trading pair
     * @param   _quantity  quantity
     * @param   _type1  Type1 : MARKET,LIMIT etc
     */
    function addOrderChecks(
        address _trader,
        bytes32 _clientOrderId,
        bytes32 _tradePairId,
        uint256 _quantity,
        Type1 _type1
    ) private view {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        require(!tradePair.pairPaused, "T-PPAU-01");
        require(!tradePair.addOrderPaused, "T-AOPA-01");
        require(allowedOrderTypes[_tradePairId].contains(uint256(_type1)), "T-IVOT-01");
        require(UtilsLibrary.decimalsOk(_quantity, tradePair.baseDecimals, tradePair.baseDisplayDecimals), "T-TMDQ-01");
        require(clientOrderIDMap[_trader][_clientOrderId] == 0, "T-CLOI-01");
    }

    /**
     * @notice  Frontend Entry function to call to add an order
     * @dev     Adds an order with the given fields. As a general rule of thumb msg.sender should be the `_trader`
     * otherwise the tx will revert. 'OrderStatusChanged' event will be emitted
     * when an order is received and committed to the blockchain. You can get the contract
     * generated orderid along with your clientorderid from this event. When the blockchain is extremely busy,
     * the transactions are queued up in the mempool and prioritized based on their gas price.
     * We have seen orders waiting for hours in the mempool in Avalanche C-Chain, before they are committed
     * in extreme cases. This is a function of the blockchain and will typically happen when the current gas
     * price is around 100 gwei (3-4 times of the minimum gas price) and your transaction maximum gas is set
     * to be 50 gwei(normal level). Your transaction will wait in the mempool until the blockchain gas price
     * goes back to normal levels. \
     * @dev     `_clientoOderId` is sent by the owner of an order and it is returned in responses for
     * reference. It must be unique per traderaddress. \
     * @dev     Price for market Orders are set to 0 internally (type1=0). Valid price decimals (baseDisplayDecimals)
     * and evm decimals can be obtained by calling `getDisplayDecimals` and `getDecimals`, respectively. \
     * @dev     Valid quantity decimals (quoteDisplayDecimals) and evm decimals can be obtained by calling
     * `getDisplayDecimals` and `getDecimals`, respectively. \
     * @dev     The default for type2 (Order SubType) is 0 equivalent to GTC. \
     * Here are the other SubTypes: \
     * 0 = GTC : Good Till Cancel \
     * 1 = FOK : FIll or Kill (Will fill entirely or will revert with "T-FOKF-01") \
     * 2 = IOC : Immedidate or Cancel  (Will fill partially or fully, will get status=CANCELED if filled partially) \
     * 3 = PO : Post Only (Will either go in the orderbook or revert with "T-T2PO-01" if it has a potential match)
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
    ) external override nonReentrant whenNotPaused {
        require(_trader == msg.sender || hasRole(ON_BEHALFOF_ROLE, msg.sender), "T-OOCA-01");
        addOrderChecks(_trader, _clientOrderId, _tradePairId, _quantity, _type1);

        if (_type1 == Type1.LIMIT) {
            addLimitOrder(_trader, _clientOrderId, _tradePairId, _price, _quantity, _side, _type2);
        } else if (_type1 == Type1.MARKET) {
            addMarketOrder(_trader, _clientOrderId, _tradePairId, _quantity, _side);
        }
    }

    /**
     * @notice  Private function. Adds a LIMIT Order. See #addOrder.
     * @param   _trader   See #addOrder
     * @param   _clientOrderId   See #addOrder
     * @param   _tradePairId   See #addOrder
     * @param   _price   See #addOrder
     * @param   _quantity   See #addOrder
     * @param   _side   See #addOrder
     * @param   _type2   See #addOrder
     */
    function addLimitOrder(
        address _trader,
        bytes32 _clientOrderId,
        bytes32 _tradePairId,
        uint256 _price,
        uint256 _quantity,
        Side _side,
        Type2 _type2
    ) private {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        require(UtilsLibrary.decimalsOk(_price, tradePair.quoteDecimals, tradePair.quoteDisplayDecimals), "T-TMDP-01");
        uint256 tradeAmnt = getQuoteAmount(_tradePairId, _price, _quantity);
        require(tradeAmnt >= tradePair.minTradeAmount, "T-LTMT-02");
        require(tradeAmnt <= tradePair.maxTradeAmount, "T-MTMT-02");

        bytes32 orderId = getNextOrderId();
        clientOrderIDMap[_trader][_clientOrderId] = orderId;
        Order storage order = orderMap[orderId];
        order.id = orderId;
        order.clientOrderId = _clientOrderId;
        order.tradePairId = _tradePairId;
        order.traderaddress = _trader;
        order.price = _price;
        order.quantity = _quantity;
        order.side = _side;
        order.type1 = Type1.LIMIT;
        if (_type2 != Type2.GTC && !UtilsLibrary.matchingAllowed(tradePair.auctionMode)) {
            _type2 = Type2.GTC; // All auction orders are GTC
        }
        order.type2 = _type2;
        //order.totalAmount= 0;         // evm intialized
        //order.quantityFilled= 0;      // evm intialized
        //order.status= Status.NEW;     // evm intialized
        //order.totalFee= 0;            // evm intialized

        //Skip matching if in Auction Mode
        if (UtilsLibrary.matchingAllowed(tradePair.auctionMode)) {
            _quantity = matchOrder(order.id, 255);
        }
        require(_type2 != Type2.PO || (_type2 == Type2.PO && order.quantity == _quantity), "T-T2PO-01");
        // Unfilled Limit Orders Go in the Orderbook (Including Auction Orders)
        if (_quantity > 0 && (_type2 == Type2.GTC || _type2 == Type2.PO)) {
            bytes32 bookId = _side == Side.BUY ? tradePair.buyBookId : tradePair.sellBookId;
            orderBooks.addOrder(bookId, order.id, order.price);
            bytes32 adjSymbol = _side == Side.BUY ? tradePair.quoteSymbol : tradePair.baseSymbol;
            uint256 adjAmount = _side == Side.BUY ? getQuoteAmount(_tradePairId, _price, _quantity) : _quantity;
            portfolio.adjustAvailable(IPortfolio.Tx.DECREASEAVAIL, order.traderaddress, adjSymbol, adjAmount);
        }
        if (_type2 == Type2.FOK) {
            require(_quantity == 0, "T-FOKF-01");
        }
        if (_type2 == Type2.IOC && _quantity > 0) {
            order.status = Status.CANCELED;
        }
        // EMIT order status. if no fills, the status will be NEW, if any fills status will be either PARTIAL or FILLED
        emitStatusUpdate(order.id);
    }

    /**
     * @notice  Private function. Adds a MARKET Order. See #addOrder.
     * @param   _trader  See #addOrder
     * @param   _clientOrderId  See #addOrder
     * @param   _tradePairId  See #addOrder
     * @param   _quantity  See #addOrder
     * @param   _side  See #addOrder
     */
    function addMarketOrder(
        address _trader,
        bytes32 _clientOrderId,
        bytes32 _tradePairId,
        uint256 _quantity,
        Side _side
    ) private {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        require(UtilsLibrary.matchingAllowed(tradePair.auctionMode), "T-AUCT-04");
        // Market Orders will be filled up to allowedSlippagePercent from the marketPrice to protect the trader,
        // the remaining quantity gets unsolicited cancel

        bytes32 bookId = _side == Side.BUY ? tradePair.sellBookId : tradePair.buyBookId;
        uint256 marketPrice = orderBooks.bestPrice(bookId);
        uint256 worstPrice = _side == Side.BUY
            ? (marketPrice * (100 + tradePair.allowedSlippagePercent)) / 100
            : (marketPrice * (100 - tradePair.allowedSlippagePercent)) / 100;

        // don't need digit check here as it is taken from the book
        uint256 tradeAmnt = getQuoteAmount(_tradePairId, marketPrice, _quantity);
        // a market order will be rejected here if there is nothing in the book because marketPrice will be 0
        require(tradeAmnt >= tradePair.minTradeAmount, "T-LTMT-01");
        require(tradeAmnt <= tradePair.maxTradeAmount, "T-MTMT-01");

        bytes32 orderId = getNextOrderId();
        clientOrderIDMap[_trader][_clientOrderId] = orderId;
        Order storage order = orderMap[orderId];
        order.id = orderId;
        order.clientOrderId = _clientOrderId;
        order.tradePairId = _tradePairId;
        order.traderaddress = _trader;
        order.price = worstPrice; // price set to the worst price to fill up to this price given enough quantity
        order.quantity = _quantity;
        order.side = _side;
        //order.type2 = Type2.GTC;      // evm initialzed
        //order.quantityFilled = 0;     // evm intialized
        //order.totalAmount = 0;        // evm intialized
        //order.type1 = _type1;         // evm intialized to MARKET
        //order.status = Status.NEW;    // evm intialized
        //order.totalFee = 0;           // evm intialized

        uint256 takerRemainingQuantity = matchOrder(order.id, 255);
        if (!orderBooks.orderListExists(bookId, worstPrice) && takerRemainingQuantity > 0) {
            // IF the Market Order fills all the way to the worst price, it gets KILLED for the remaining amount.
            orderMap[order.id].status = Status.CANCELED;
        }
        order.price = 0; //Reset the market order price back to 0

        // Order status will be either FILLED
        // or CANCELED in case it hits allowedSlippagePercent treshold after partial fills
        emitStatusUpdate(order.id);
    }

    /**
     * @notice  Function to match Auction orders
     * @dev     Requires `DEFAULT_ADMIN_ROLE`, also called by `ExchangeSub.matchAuctionOrders` that
     * requires `AUCTION_ADMIN_ROLE`.
     * @param   _takerOrderId  Taker Order id
     * @param   _maxCount   controls max number of fills an order can get at a time to avoid running out of gas
     * @return  uint256  Remaining quantity of the taker order
     */
    function matchAuctionOrder(bytes32 _takerOrderId, uint8 _maxCount)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256)
    {
        TradePair storage tradePair = tradePairMap[orderMap[_takerOrderId].tradePairId];
        require(tradePair.auctionMode == AuctionMode.MATCHING, "T-AUCT-01");
        require(tradePair.auctionPrice > 0, "T-AUCT-03");
        return matchOrder(_takerOrderId, _maxCount);
    }

    /**
     * @notice  Matches a taker order with maker orders in the opposite Orderbook before
     * it is entered in its own orderbook.
     * Also handles matching auction orders.
     * @dev     IF BUY order, it will try to match with an order in the SELL OrderBook and vice versa
     * @param   _takerOrderId  Taker Order id
     * @param   _maxCount  Max number of fills an order can get at a time to avoid running out of gas (Defaults 255).
     * @return  uint256  Remaining quantity of the taker order
     */
    function matchOrder(bytes32 _takerOrderId, uint8 _maxCount) private returns (uint256) {
        Order storage takerOrder = orderMap[_takerOrderId];
        Side side = takerOrder.side;
        TradePair storage tradePair = tradePairMap[takerOrder.tradePairId];
        // Get the opposite Book. if buying need to match with SellBook and vice versa
        bytes32 bookId = side == Side.BUY ? tradePair.sellBookId : tradePair.buyBookId;

        (uint256 price, bytes32 makerOrderId) = orderBooks.getTopOfTheBook(bookId);

        Order storage makerOrder;
        uint256 quantity;
        // Don't need price > 0 check as orderBooks.getHead(bookId,price) != ""
        // which is makerOrderId != "" takes care of it
        while (
            takerOrder.quantity > takerOrder.quantityFilled &&
            makerOrderId != "" &&
            (side == Side.BUY ? takerOrder.price >= price : takerOrder.price <= price) &&
            _maxCount > 0
        ) {
            makerOrder = orderMap[makerOrderId];
            quantity = orderBooks.matchTrade(
                bookId,
                price,
                UtilsLibrary.getRemainingQuantity(takerOrder.quantity, takerOrder.quantityFilled),
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
                    getQuoteAmount(makerOrder.tradePairId, makerOrder.price - tradePair.auctionPrice, quantity)
                );
            }
            (price, makerOrderId) = orderBooks.getTopOfTheBook(bookId);
            _maxCount--;
        }

        uint256 takerRemainingQuantity = UtilsLibrary.getRemainingQuantity(
            takerOrder.quantity,
            takerOrder.quantityFilled
        );
        if (tradePair.auctionMode == AuctionMode.MATCHING) {
            emitStatusUpdate(takerOrder.id); // EMIT taker order's status update
            if (takerRemainingQuantity == 0) {
                // Remove the taker auction order from the sell orderbook
                orderBooks.removeFirstOrder(tradePair.sellBookId, takerOrder.price);
            }
        }

        return takerRemainingQuantity;
    }

    /**
     * @notice  Admin Function to cancel orders in the orderbook when delisting a trade pair
     * @dev     Will cancel orders even when TradePair is paused
     * @param   _tradePairId  id of the trading pair
     * @param   _isBuyBook  true if buy Orderbook
     * @param   _maxCount  controls max number of orders to cancel at a time to avoid running out of gas
     */
    function unsolicitedCancel(
        bytes32 _tradePairId,
        bool _isBuyBook,
        uint8 _maxCount
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TradePair storage tradePair = tradePairMap[_tradePairId];
        //Need to be able to cancel when tradePair is paused
        bytes32 bookId = _isBuyBook ? tradePair.buyBookId : tradePair.sellBookId;
        (uint256 price, bytes32 orderId) = orderBooks.getTopOfTheBook(bookId);
        while (orderId != "" && _maxCount > 0) {
            doOrderCancel(orderId);
            (price, orderId) = orderBooks.getTopOfTheBook(bookId);
            _maxCount--;
        }
    }

    /**
     * @notice  Cancels an order and immediately enters a similar order in the same direction.
     * @dev     Only the quantity and the price of the order can be changed. All the other order
     * fields are copied from the canceled order to the new order.
     * The time priority of the original order is lost.
     * Canceled order's locked quantity is made available for the new order within this tx
     * @param   _orderId  order id to cancel
     * @param   _clientOrderId  clinent order id of the new order
     * @param   _price  price of the new order
     * @param   _quantity  quantity of the new order
     */
    function cancelReplaceOrder(
        bytes32 _orderId,
        bytes32 _clientOrderId,
        uint256 _price,
        uint256 _quantity
    ) external override nonReentrant whenNotPaused {
        Order storage order = orderMap[_orderId];
        require(order.traderaddress == msg.sender, "T-OOCC-01");
        require(UtilsLibrary.canCancel(order.quantity, order.quantityFilled, order.status), "T-OAEX-01");
        addOrderChecks(order.traderaddress, _clientOrderId, order.tradePairId, _quantity, order.type1);
        doOrderCancel(order.id);
        addLimitOrder(
            order.traderaddress,
            _clientOrderId,
            order.tradePairId,
            _price,
            _quantity,
            order.side,
            order.type2
        );
    }

    /**
     * @notice  Cancels an order given the order id supplied
     * @dev     Will revert with "T-OAEX-01" if order is already filled or canceled
     * @param   _orderId  order id to cancel
     */
    function cancelOrder(bytes32 _orderId) external override nonReentrant whenNotPaused {
        Order storage order = orderMap[_orderId];
        require(order.traderaddress == msg.sender, "T-OOCC-01");
        require(UtilsLibrary.canCancel(order.quantity, order.quantityFilled, order.status), "T-OAEX-01");
        TradePair storage tradePair = tradePairMap[order.tradePairId];
        require(!tradePair.pairPaused, "T-PPAU-02");
        doOrderCancel(order.id);
    }

    /**
     * @notice  Cancels all the orders given the array of order ids supplied
     * @dev     This function may run out of gas if a trader is trying to cancel too many orders
     * Call with Maximum 20 orders at a time
     * Will skip orders that are already canceled/filled and continue canceling the remaining ones in the list
     * @param   _orderIds  array of order ids
     */
    function cancelAllOrders(bytes32[] memory _orderIds) external override nonReentrant whenNotPaused {
        for (uint256 i = 0; i < _orderIds.length; i++) {
            Order storage order = orderMap[_orderIds[i]];
            require(order.traderaddress == msg.sender, "T-OOCC-02");
            TradePair storage tradePair = tradePairMap[order.tradePairId];
            require(!tradePair.pairPaused, "T-PPAU-03");
            if (UtilsLibrary.canCancel(order.quantity, order.quantityFilled, order.status)) {
                doOrderCancel(order.id);
            }
        }
    }

    /**
     * @notice  Cancels an order and makes the locked amount available in the porftolio
     * @param   _orderId  order id to cancel
     */
    function doOrderCancel(bytes32 _orderId) private {
        //DO not add requires here for unsolicitedCancel to work
        Order storage order = orderMap[_orderId];
        TradePair storage tradePair = tradePairMap[order.tradePairId];
        order.status = Status.CANCELED;

        bytes32 bookId = order.side == Side.BUY ? tradePair.buyBookId : tradePair.sellBookId;
        bytes32 adjSymbol = order.side == Side.BUY ? tradePair.quoteSymbol : tradePair.baseSymbol;
        uint256 adjAmount = order.side == Side.BUY
            ? getQuoteAmount(
                order.tradePairId,
                order.price,
                UtilsLibrary.getRemainingQuantity(order.quantity, order.quantityFilled)
            )
            : UtilsLibrary.getRemainingQuantity(order.quantity, order.quantityFilled);

        orderBooks.removeOrder(bookId, _orderId, order.price);
        portfolio.adjustAvailable(IPortfolio.Tx.INCREASEAVAIL, order.traderaddress, adjSymbol, adjAmount);
        emitStatusUpdate(order.id);
    }

    // solhint-disable-next-line payable-fallback
    fallback() external {
        revert("T-NFUN-01");
    }
}
