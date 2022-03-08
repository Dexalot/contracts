// SPDX-License-Identifier: BSD-3-Clause

pragma solidity ^0.8.3;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./library/Bytes32Library.sol";
import "./library/StringLibrary.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/ITradePairs.sol";

import "./OrderBooks.sol";
/**
*   @author "DEXALOT TEAM"
*   @title "TradePairs: a contract implementing the data structures and functions for trade pairs"
*   @dev "For each trade pair an entry is added tradePairMap."
*   @dev "The naming convention for the trade pairs is as follows: BASEASSET/QUOTEASSET."
*   @dev "For base asset AVAX and quote asset USDT the trade pair name is AVAX/USDT."
*/

contract TradePairs is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, ITradePairs {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using StringLibrary for string;
    using Bytes32Library for bytes32;

    // version
    bytes32 constant public VERSION = bytes32('1.2.9');

    // denominator for rate calculations
    uint constant public TENK = 10000;

    // order counter to build a unique handle for each new order
    uint private orderCounter;

    // a dynamic array of trade pairs added to TradePairs contract
    bytes32[] private tradePairsArray;


    struct TradePair {
        bytes32 baseSymbol;          // symbol for base asset
        bytes32 quoteSymbol;         // symbol for quote asset
        bytes32 buyBookId;           // identifier for the buyBook for TradePair
        bytes32 sellBookId;          // identifier for the sellBook for TradePair
        uint minTradeAmount;         // min trade for a TradePair expressed as amount = (price * quantity) / (10 ** quoteDecimals)
        uint maxTradeAmount;         // max trade for a TradePair expressed as amount = (price * quantity) / (10 ** quoteDecimals)
        uint makerRate;              // numerator for maker fee rate % to be used with a denominator of 10000
        uint takerRate;              // numerator for taker fee rate % to be used with a denominator of 10000
        uint8 baseDecimals;          // decimals for base asset
        uint8 baseDisplayDecimals;   // display decimals for base asset
        uint8 quoteDecimals;         // decimals for quote asset
        uint8 quoteDisplayDecimals;  // display decimals for quote asset
        uint8 allowedSlippagePercent;// numerator for allowed slippage rate % to be used with denominator 100
        bool addOrderPaused;         // boolean to control addOrder functionality per TradePair
        bool pairPaused;             // boolean to control addOrder and cancelOrder functionality per TradePair
        AuctionMode auctionMode;     // control auction states
        uint auctionPrice;           // Indicative & Final Price
        uint auctionIntervalPct;     // auctionIntervalPct=500 (5.00% = 500/10000)   Buy Side (10000-500)/10000 = 95%
    }

    // mapping data structure for all trade pairs
    mapping (bytes32 => TradePair) private tradePairMap;

    // mapping  for allowed order types for a TradePair
    mapping (bytes32 => EnumerableSetUpgradeable.UintSet) private allowedOrderTypes;

    // mapping structure for all orders
    mapping (bytes32 => Order) private orderMap;

    // reference to OrderBooks contract (one sell or buy book)
    OrderBooks private orderBooks;

    // reference Portfolio contract
    IPortfolio private portfolio;

    event NewTradePair(bytes32 pair, uint8 basedisplaydecimals, uint8 quotedisplaydecimals, uint mintradeamount, uint maxtradeamount);

    event OrderStatusChanged(address indexed traderaddress, bytes32 indexed pair, bytes32 id,  uint price, uint totalamount, uint quantity,
                             Side side, Type1 type1, Status status, uint quantityfilled, uint totalfee);

    event Executed(bytes32 indexed pair, uint price, uint quantity, bytes32 maker, bytes32 taker, uint feeMaker, uint feeTaker, bool feeMakerBase, uint execId);

    event ParameterUpdated(bytes32 indexed pair, string param, uint oldValue, uint newValue);

    function initialize(address _orderbooks, address _portfolio) public initializer {
        __Ownable_init();
        orderCounter = block.timestamp;
        orderBooks = OrderBooks(_orderbooks);
        portfolio = IPortfolio(_portfolio);
    }

    function addTradePair(bytes32 _tradePairId,
                          bytes32 _baseSymbol, uint8 _baseDecimals, uint8 _baseDisplayDecimals,
                          bytes32 _quoteSymbol, uint8 _quoteDecimals,  uint8 _quoteDisplayDecimals,
                          uint _minTradeAmount, uint _maxTradeAmount, AuctionMode _mode) public override onlyOwner {

        if (tradePairMap[_tradePairId].baseSymbol == '') {
            EnumerableSetUpgradeable.UintSet storage enumSet = allowedOrderTypes[_tradePairId];
            enumSet.add(uint(Type1.LIMIT)); // LIMIT orders always allowed
            //enumSet.add(uint(Type1.MARKET));  // trade pairs are added without MARKET orders

            bytes32 _buyBookId = string(abi.encodePacked(_tradePairId.bytes32ToString(), '-BUYBOOK')).stringToBytes32();
            bytes32 _sellBookId = string(abi.encodePacked(_tradePairId.bytes32ToString(), '-SELLBOOK')).stringToBytes32();

            tradePairMap[_tradePairId].baseSymbol = _baseSymbol;
            tradePairMap[_tradePairId].baseDecimals = _baseDecimals;
            tradePairMap[_tradePairId].baseDisplayDecimals = _baseDisplayDecimals;
            tradePairMap[_tradePairId].quoteSymbol = _quoteSymbol;
            tradePairMap[_tradePairId].quoteDecimals = _quoteDecimals;
            tradePairMap[_tradePairId].quoteDisplayDecimals = _quoteDisplayDecimals;
            tradePairMap[_tradePairId].minTradeAmount = _minTradeAmount;
            tradePairMap[_tradePairId].maxTradeAmount = _maxTradeAmount;
            tradePairMap[_tradePairId].buyBookId = _buyBookId;
            tradePairMap[_tradePairId].sellBookId = _sellBookId;
            tradePairMap[_tradePairId].makerRate = 10; // makerRate=10 (0.10% = 10/10000)
            tradePairMap[_tradePairId].takerRate = 20; // takerRate=20 (0.20% = 20/10000)
            tradePairMap[_tradePairId].allowedSlippagePercent = 20; // allowedSlippagePercent=20 (20% = 20/100) market orders can't be filled worst than 80% of the bestBid / 120% of bestAsk
            tradePairMap[_tradePairId].auctionIntervalPct = 1000 ;//auctionIntervalPct=1000 (10.00% = 1000/10000)   Buy Side (10000-1000)/10000 = 90%
            // tradePairMap[_tradePairId].addOrderPaused = false;   // addOrder is not paused by default (EVM initializes to false)
            // tradePairMap[_tradePairId].pairPaused = false;       // pair is not paused by default (EVM initializes to false)

            tradePairMap[_tradePairId].auctionMode = _mode;
            if (matchingAllowed(_mode)) {
                enumSet.add(uint(Type1.LIMITFOK));  // LIMITFOK orders allowed only when not in auction mode
            }

            tradePairsArray.push(_tradePairId);

            emit NewTradePair(_tradePairId, _baseDisplayDecimals, _quoteDisplayDecimals, _minTradeAmount, _maxTradeAmount);
        }
    }

    // FRONTEND FUNCTION TO GET A LIST OF TRADE PAIRS
    function getTradePairs() public override view returns (bytes32[] memory) {
        return tradePairsArray;
    }

    function pause() public override onlyOwner {
        _pause();
    }

    function unpause() public override onlyOwner {
        _unpause();
    }

    function pauseTradePair(bytes32 _tradePairId, bool _pairPaused) public override onlyOwner {
        tradePairMap[_tradePairId].pairPaused = _pairPaused;
    }

    function pauseAddOrder(bytes32 _tradePairId, bool _addOrderPaused) public override onlyOwner {
        tradePairMap[_tradePairId].addOrderPaused = _addOrderPaused;
    }

    function matchingAllowed(AuctionMode _mode) private pure returns(bool) {
        return _mode == AuctionMode.OFF || _mode == AuctionMode.LIVETRADING ;
    }

    function isAuctionRestricted(AuctionMode _mode) private pure returns(bool) {
        return _mode == AuctionMode.RESTRICTED || _mode == AuctionMode.CLOSING ;
    }

    function setAuctionMode(bytes32 _tradePairId, AuctionMode _mode) public override onlyOwner {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        uint oldValue = uint(_tradePair.auctionMode);
        _tradePair.auctionMode = _mode;
        if (matchingAllowed(_mode)) {
            require(orderBooks.first(_tradePair.sellBookId) == 0
                            || orderBooks.first(_tradePair.sellBookId) > orderBooks.last(_tradePair.buyBookId), "T-AUCT-11");
            addOrderType(_tradePairId, Type1.LIMITFOK);
            pauseTradePair(_tradePairId, false);

        } else if (_mode == AuctionMode.OPEN ) {
            removeOrderType(_tradePairId, Type1.LIMITFOK);
            pauseTradePair(_tradePairId, false);

        } else if (_mode == AuctionMode.MATCHING
                            || _mode == AuctionMode.PAUSED) {
            pauseTradePair(_tradePairId, true);

        } else if (isAuctionRestricted(_mode)) {
            pauseTradePair(_tradePairId, false);
        }
        emit ParameterUpdated(_tradePairId, "T-AUCTIONMODE", oldValue, uint(_mode) );
    }

    function setAuctionPrice (bytes32 _tradePairId, uint _price, uint _pct) public override onlyOwner {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(decimalsOk(_price, _tradePair.quoteDecimals, _tradePair.quoteDisplayDecimals), "T-AUCT-02");
        if (_tradePair.auctionMode != AuctionMode.MATCHING){
            require(_pct > 0, "T-AUCT-12");
        }
        uint oldValue = _tradePair.auctionPrice;
        uint oldValuePct = _tradePair.auctionIntervalPct;
        _tradePair.auctionPrice = _price;
        //Auction Price should be set right after matching status and pct should be equal to 0
        if (_tradePair.auctionMode == AuctionMode.MATCHING) {
            _pct = 0;
        }
        _tradePair.auctionIntervalPct= _pct;
        emit ParameterUpdated(_tradePairId, "T-AUCTIONPRICE", oldValue, _price);
        emit ParameterUpdated(_tradePairId, "T-AUCTIONINTPCT", oldValuePct, _pct);
    }

    function getAuctionData (bytes32 _tradePairId) public view override returns (uint8 mode, uint price, uint percent, uint lower, uint upper) {
         TradePair storage _tradePair = tradePairMap[_tradePairId];
         mode = uint8(_tradePair.auctionMode);
         price = _tradePair.auctionPrice;
         percent = _tradePair.auctionIntervalPct;
         lower = _tradePair.auctionPrice * (10000 - _tradePair.auctionIntervalPct) / TENK;
         upper = _tradePair.auctionPrice * (10000 + _tradePair.auctionIntervalPct) / TENK;
    }

    function tradePairExists(bytes32 _tradePairId) public view returns (bool) {
        bool exists = false;
        if (tradePairMap[_tradePairId].baseSymbol != '') { // It is possible to have a tradepair with baseDecimal
            exists = true;
        }
        return exists;
    }

    function setMinTradeAmount(bytes32 _tradePairId, uint _minTradeAmount) public override onlyOwner {
        uint oldValue = tradePairMap[_tradePairId].minTradeAmount;
        tradePairMap[_tradePairId].minTradeAmount = _minTradeAmount;
        emit ParameterUpdated(_tradePairId, "T-MINTRAMT", oldValue, _minTradeAmount);
    }

    function getMinTradeAmount(bytes32 _tradePairId) public override view returns (uint) {
        return tradePairMap[_tradePairId].minTradeAmount;
    }

    function setMaxTradeAmount(bytes32 _tradePairId, uint _maxTradeAmount) public override onlyOwner {
        uint oldValue = tradePairMap[_tradePairId].maxTradeAmount;
        tradePairMap[_tradePairId].maxTradeAmount = _maxTradeAmount;
        emit ParameterUpdated(_tradePairId, "T-MAXTRAMT", oldValue, _maxTradeAmount);
    }

    function getMaxTradeAmount(bytes32 _tradePairId) public override view returns (uint) {
        return tradePairMap[_tradePairId].maxTradeAmount;
    }

    function addOrderType(bytes32 _tradePairId, Type1 _type) public override onlyOwner {
        allowedOrderTypes[_tradePairId].add(uint(_type));
        emit ParameterUpdated(_tradePairId, "T-OTYPADD", 0, uint(_type));
    }

    function removeOrderType(bytes32 _tradePairId, Type1 _type) public override onlyOwner {
        require(_type != Type1.LIMIT, "T-LONR-01");
        allowedOrderTypes[_tradePairId].remove(uint(_type));
        emit ParameterUpdated(_tradePairId, "T-OTYPREM", 0, uint(_type));
    }

    function getAllowedOrderTypes(bytes32 _tradePairId) public view returns (uint[] memory) {
        uint size = allowedOrderTypes[_tradePairId].length();
        uint[] memory allowed = new uint[](size);
        for (uint i=0; i<size; i++) {
            allowed[i] = allowedOrderTypes[_tradePairId].at(i);
        }
        return allowed;
    }

    function setDisplayDecimals(bytes32 _tradePairId, uint8 _displayDecimals, bool _isBase) public override onlyOwner {
        uint oldValue = tradePairMap[_tradePairId].baseDisplayDecimals;
        if (_isBase) {
            tradePairMap[_tradePairId].baseDisplayDecimals = _displayDecimals;
        } else {
            oldValue = tradePairMap[_tradePairId].quoteDisplayDecimals;
            tradePairMap[_tradePairId].quoteDisplayDecimals = _displayDecimals;
        }
        emit ParameterUpdated(_tradePairId, "T-DISPDEC", oldValue, _displayDecimals);
    }

    function getDisplayDecimals(bytes32 _tradePairId, bool _isBase) public override view returns (uint8) {
        if (_isBase) {
            return tradePairMap[_tradePairId].baseDisplayDecimals;
        } else {
            return tradePairMap[_tradePairId].quoteDisplayDecimals;
        }
    }

    function getDecimals(bytes32 _tradePairId, bool _isBase) public override view returns (uint8) {
        if (_isBase) {
            return tradePairMap[_tradePairId].baseDecimals;
        } else {
            return tradePairMap[_tradePairId].quoteDecimals;
        }
    }

    function getSymbol(bytes32 _tradePairId, bool _isBase) public override view returns (bytes32) {
        if (_isBase) {
            return tradePairMap[_tradePairId].baseSymbol;
        } else {
            return tradePairMap[_tradePairId].quoteSymbol;
        }
    }

    function updateRate(bytes32 _tradePairId, uint _rate, ITradePairs.RateType _rateType) public override onlyOwner {
        uint oldValue = tradePairMap[_tradePairId].makerRate;
        if (_rateType == ITradePairs.RateType.MAKER) {
            tradePairMap[_tradePairId].makerRate = _rate; // (_rate/100)% = _rate/10000: _rate=10 => 0.10%
            emit ParameterUpdated(_tradePairId, "T-MAKERRATE", oldValue, _rate);
        } else if (_rateType == ITradePairs.RateType.TAKER) {
            oldValue = tradePairMap[_tradePairId].takerRate;
            tradePairMap[_tradePairId].takerRate = _rate; // (_rate/100)% = _rate/10000: _rate=20 => 0.20%
            emit ParameterUpdated(_tradePairId, "T-TAKERRATE", oldValue, _rate);
        } // Ignore the rest for now
    }

    function getMakerRate(bytes32 _tradePairId) public view override returns (uint) {
        return tradePairMap[_tradePairId].makerRate;
    }

    function getTakerRate(bytes32 _tradePairId) public view override returns (uint) {
        return tradePairMap[_tradePairId].takerRate;
    }

    function setAllowedSlippagePercent(bytes32 _tradePairId, uint8 _allowedSlippagePercent) public override onlyOwner {
        uint oldValue = tradePairMap[_tradePairId].allowedSlippagePercent;
        tradePairMap[_tradePairId].allowedSlippagePercent = _allowedSlippagePercent;
        emit ParameterUpdated(_tradePairId, "T-SLIPPAGE", oldValue, _allowedSlippagePercent);
    }

    function getAllowedSlippagePercent(bytes32 _tradePairId) public override view returns (uint8) {
        return tradePairMap[_tradePairId].allowedSlippagePercent;
    }

    function getNSellBook(bytes32 _tradePairId, uint nPrice, uint nOrder, uint lastPrice, bytes32 lastOrder)
                public view override returns (uint[] memory, uint[] memory, uint , bytes32) {
        // get lowest (_type=0) N orders
        return orderBooks.getNOrders(tradePairMap[_tradePairId].sellBookId, nPrice, nOrder, lastPrice, lastOrder,  0);
    }

    function getNBuyBook(bytes32 _tradePairId, uint nPrice, uint nOrder, uint lastPrice, bytes32 lastOrder)
                public view override returns (uint[] memory, uint[] memory, uint , bytes32) {
        // get highest (_type=1) N orders
        return orderBooks.getNOrders(tradePairMap[_tradePairId].buyBookId, nPrice, nOrder, lastPrice, lastOrder, 1);
    }

    function getOrder(bytes32 _orderId) public view override returns (Order memory) {
        return orderMap[_orderId];
    }

    function getOrderId() private returns (bytes32) {
        return keccak256(abi.encodePacked(orderCounter++));
    }

    // get remaining quantity for an Order struct - cheap pure function
    function getRemainingQuantity(Order memory _order) private pure returns (uint) {
        return _order.quantity - _order.quantityFilled;
    }

    // get quote amount
    function getQuoteAmount(bytes32 _tradePairId, uint _price, uint _quantity) private view returns (uint) {
      return  (_price * _quantity) / 10 ** tradePairMap[_tradePairId].baseDecimals;
    }

    function emitStatusUpdate(bytes32 _tradePairId, bytes32 _orderId) private {
        Order storage _order = orderMap[_orderId];
        emit OrderStatusChanged(_order.traderaddress, _tradePairId, _order.id,
                                _order.price, _order.totalAmount, _order.quantity, _order.side,
                                _order.type1, _order.status, _order.quantityFilled,  _order.totalFee);
    }

    //Used to Round Up the auction price interval small restrictions
    // example: a = 1245, m: 100 ==> 1300
    function ceil(uint a, uint m) pure public returns (uint) {
        return ((a + m - 1) / m) * m;
    }

    //Used to Round Down the fees to the display decimals to avoid dust
    //Used to Round Down the auction price interval to avoid small restrictions
    // example: a = 1245, m: 2 ==> 1200
    function floor(uint a, uint m) pure public returns (uint) {
        return (a / 10 ** m) * 10 ** m;
    }

    function handleExecution(bytes32 _tradePairId, bytes32 _orderId, uint _price, uint _quantity, uint _rate) private returns (uint) {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        Order storage _order = orderMap[_orderId];
        require(_order.status != Status.CANCELED, "T-OACA-01");
        _order.quantityFilled += _quantity;
        require(_order.quantityFilled <= _order.quantity, "T-CQFA-01");
        _order.status = _order.quantity == _order.quantityFilled ? Status.FILLED : Status.PARTIAL;
        uint amount = getQuoteAmount(_tradePairId, _price, _quantity);
        _order.totalAmount += amount;
        //Rounding Down the fee based on display decimals to avoid DUST
        uint lastFeeRounded = _order.side == Side.BUY ?
                floor(_quantity * _rate / TENK, _tradePair.baseDecimals - _tradePair.baseDisplayDecimals) :
                floor(amount * _rate / TENK, _tradePair.quoteDecimals - _tradePair.quoteDisplayDecimals);
        _order.totalFee += lastFeeRounded;
        return lastFeeRounded;
    }

    function addExecution(bytes32 _tradePairId, Order memory _makerOrder, Order memory _takerOrder, uint _price, uint _quantity) private {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        // fill the maker first so it is out of the book quickly
        uint mlastFee = handleExecution(_tradePairId, _makerOrder.id, _price, _quantity, _tradePair.makerRate); // also updates the order status
        uint tlastFee = handleExecution(_tradePairId, _takerOrder.id, _price, _quantity, _tradePair.takerRate); // also updates the order status
        portfolio.addExecution(_makerOrder, _takerOrder.traderaddress, _tradePair.baseSymbol, _tradePair.quoteSymbol, _quantity,
                               getQuoteAmount(_tradePairId, _price, _quantity), mlastFee, tlastFee);
        emit Executed(_tradePairId, _price, _quantity, _makerOrder.id, _takerOrder.id, mlastFee, tlastFee, _makerOrder.side == Side.BUY ? true : false, orderCounter++);

        emitStatusUpdate(_tradePairId, _makerOrder.id); // EMIT maker order's status update
    }

    function decimalsOk(uint value, uint8 decimals, uint8 displayDecimals) private pure returns (bool) {
        return (value - (value - ((value % 10**decimals) % 10**(decimals - displayDecimals) ))) == 0;
    }

    // FRONTEND ENTRY FUNCTION TO CALL TO ADD ORDER
    function addOrder(bytes32 _tradePairId, uint _price, uint _quantity, Side _side, Type1 _type1) public override nonReentrant whenNotPaused {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(!_tradePair.pairPaused, "T-PPAU-01");
        require(!_tradePair.addOrderPaused, "T-AOPA-01");
        require(allowedOrderTypes[_tradePairId].contains(uint(_type1)), "T-IVOT-01");

        require(decimalsOk(_quantity, _tradePair.baseDecimals, _tradePair.baseDisplayDecimals), "T-TMDQ-01");

        if (_type1 == Type1.LIMIT  || _type1 == Type1.LIMITFOK ) {
            addLimitOrder(_tradePairId, _price, _quantity, _side, _type1);
        } else if (_type1 == Type1.MARKET) {
            addMarketOrder(_tradePairId, _quantity, _side);
        }
    }

    function addMarketOrder(bytes32 _tradePairId, uint _quantity, Side _side) private {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(matchingAllowed(_tradePair.auctionMode), "T-AUCT-04");
        uint marketPrice;
        uint worstPrice; // Market Orders will be filled up to allowedSlippagePercent from the marketPrice to protect the trader, the remaining qty gets unsolicited cancel
        bytes32 bookId;
        if (_side == Side.BUY) {
            bookId = _tradePair.sellBookId;
            marketPrice = orderBooks.first(bookId);
            worstPrice = marketPrice * (100 + _tradePair.allowedSlippagePercent) / 100;
        } else {
            bookId = _tradePair.buyBookId;
            marketPrice = orderBooks.last(bookId);
            worstPrice = marketPrice * (100 - _tradePair.allowedSlippagePercent) / 100;
        }

        // don't need digit check here as it is taken from the book
        uint tradeAmnt = (marketPrice * _quantity) / (10 ** _tradePair.baseDecimals);
        // a market order will be rejected here if there is nothing in the book because marketPrice will be 0
        require(tradeAmnt >= _tradePair.minTradeAmount, "T-LTMT-01");
        require(tradeAmnt <= _tradePair.maxTradeAmount, "T-MTMT-01");

        bytes32 orderId = getOrderId();
        Order storage _order = orderMap[orderId];
        _order.id = orderId;
        _order.traderaddress= msg.sender;
        _order.price = worstPrice; // setting the price to the worst price so it can be filled up to this price given enough qty
        _order.quantity = _quantity;
        _order.side = _side;
        //_order.quantityFilled = 0;     // evm intialized
        //_order.totalAmount = 0;        // evm intialized
        //_order.type1 = _type1;         // evm intialized to MARKET
        //_order.status = Status.NEW;    // evm intialized
        //_order.totalFee = 0;           // evm intialized;

        uint takerRemainingQuantity;
        if (_side == Side.BUY) {
            takerRemainingQuantity= matchSellBook(_tradePairId, _order);
        } else {  // == Order.Side.SELL
            takerRemainingQuantity= matchBuyBook(_tradePairId, _order);
        }

        if (!orderBooks.orderListExists(bookId, worstPrice)
                && takerRemainingQuantity > 0) {
            // IF the Market Order fills all the way to the worst price, it gets KILLED for the remaining amount.
            orderMap[_order.id].status = Status.KILLED;
        }
        _order.price = 0; //Reset the market order price back to 0
        emitStatusUpdate(_tradePairId, _order.id);  // EMIT taker(potential) order status. if no fills, the status will be NEW, if not status will be either PARTIAL or FILLED
    }

    function matchAuctionOrders(bytes32 _tradePairId, uint8 _maxCount) public override onlyOwner {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(_tradePair.auctionMode == AuctionMode.MATCHING, "T-AUCT-01");
        require(_tradePair.auctionPrice > 0 && _tradePair.auctionIntervalPct==0, "T-AUCT-03");
        Order memory takerOrder;
        uint takerRemainingQuantity;
        bytes32 bookId;
        bookId = _tradePair.sellBookId;
        uint price = orderBooks.first(bookId);
        bytes32 head = orderBooks.getHead(bookId, price);
        if ( head != '' ) {
            takerOrder = getOrder(head);
            uint startRemainingQuantity = getRemainingQuantity(takerOrder);
            takerRemainingQuantity= matchBuyBookAuction(_tradePairId, takerOrder, _maxCount);
            if (takerRemainingQuantity == 0) {
                orderBooks.removeFirstOrder(bookId, price);
            }
            if (startRemainingQuantity == takerRemainingQuantity) {
                emit ParameterUpdated(_tradePairId, "T-AUCT-MATCH", 1, 0);
            } else {
                emitStatusUpdate(_tradePairId, takerOrder.id); // EMIT taker order's status update
            }
        } else {
            emit ParameterUpdated(_tradePairId, "T-AUCT-MATCH", 1, 0);
        }
    }

    function matchSellBook(bytes32 _tradePairId, Order memory takerOrder) private returns (uint) {
        bytes32 sellBookId = tradePairMap[_tradePairId].sellBookId;
        uint price = orderBooks.first(sellBookId);
        bytes32 head = orderBooks.getHead(sellBookId, price);
        Order memory makerOrder;
        uint quantity;
        //Don't need price > 0 check as sellBook.getHead(price) != '' takes care of it
        while ( getRemainingQuantity(takerOrder) > 0 && head != '' && takerOrder.price >=  price) {
            makerOrder = getOrder(head);
            quantity = orderBooks.matchTrade(sellBookId, price, getRemainingQuantity(takerOrder), getRemainingQuantity(makerOrder));
            addExecution(_tradePairId, makerOrder, takerOrder, price, quantity); // this makes a state change to Order Map
            takerOrder.quantityFilled += quantity;  // locally keep track of Qty remaining
            price = orderBooks.first(sellBookId);
            head = orderBooks.getHead(sellBookId, price);
        }
        return getRemainingQuantity(takerOrder);
    }

    function matchBuyBook(bytes32 _tradePairId, Order memory takerOrder) private returns (uint) {
        bytes32 buyBookId = tradePairMap[_tradePairId].buyBookId;
        uint price = orderBooks.last(buyBookId);
        bytes32 head = orderBooks.getHead(buyBookId, price);
        Order memory makerOrder;
        uint quantity;
        //Don't need price > 0 check as buyBook.getHead(price) != '' takes care of it
        while (getRemainingQuantity(takerOrder) > 0 && head != '' && takerOrder.price <=  price ) {
            makerOrder = getOrder(head);
            quantity = orderBooks.matchTrade(buyBookId, price, getRemainingQuantity(takerOrder), getRemainingQuantity(makerOrder));
            addExecution(_tradePairId, makerOrder, takerOrder, price, quantity); // this makes a state change to Order Map
            takerOrder.quantityFilled += quantity;  // locally keep track of Qty remaining
            price = orderBooks.last(buyBookId);
            head = orderBooks.getHead(buyBookId, price);
        }
        return getRemainingQuantity(takerOrder);
    }

    function matchBuyBookAuction(bytes32 _tradePairId, Order memory takerOrder, uint8 maxCount) private returns (uint) {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        bytes32 buyBookId = _tradePair.buyBookId;
        uint price = orderBooks.last(buyBookId);
        bytes32 head = orderBooks.getHead(buyBookId, price);
        Order memory makerOrder;
        uint quantity;
        //Don't need price > 0 check as buyBook.getHead(price) != '' takes care of it
        while (getRemainingQuantity(takerOrder) > 0 && head != '' && takerOrder.price <=  price && maxCount>0) {
            makerOrder = getOrder(head);
            quantity = orderBooks.matchTrade(buyBookId, price, getRemainingQuantity(takerOrder), getRemainingQuantity(makerOrder));
            portfolio.adjustAvailable(IPortfolio.Tx.INCREASEAVAIL, takerOrder.traderaddress, _tradePair.baseSymbol, quantity);
            addExecution(_tradePairId, makerOrder, takerOrder, _tradePair.auctionPrice , quantity); // this makes a state change to Order Map
            // Increase the available by the difference between the makerOrder & the auction Price
            if (makerOrder.price > _tradePair.auctionPrice) {
                portfolio.adjustAvailable(IPortfolio.Tx.INCREASEAVAIL, makerOrder.traderaddress, _tradePair.quoteSymbol,
                                    getQuoteAmount(_tradePairId, makerOrder.price -_tradePair.auctionPrice, quantity));
            }
            takerOrder.quantityFilled += quantity;  // locally keep track of Qty remaining
            price = orderBooks.last(buyBookId);
            head = orderBooks.getHead(buyBookId, price);
            maxCount--;
        }
        return getRemainingQuantity(takerOrder);
    }

    function addLimitOrder(bytes32 _tradePairId, uint _price, uint _quantity, Side _side, Type1 _type1) private {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(decimalsOk(_price, _tradePair.quoteDecimals, _tradePair.quoteDisplayDecimals), "T-TMDP-01");
        uint tradeAmnt = (_price * _quantity) / (10 ** _tradePair.baseDecimals);
        require(tradeAmnt >= _tradePair.minTradeAmount, "T-LTMT-02");
        require(tradeAmnt <= _tradePair.maxTradeAmount, "T-MTMT-02");

        bytes32 orderId = getOrderId();
        Order storage _order = orderMap[orderId];
        _order.id = orderId;
        _order.traderaddress = msg.sender;
        _order.price = _price;
        _order.quantity = _quantity;
        _order.side = _side;
        _order.type1 = _type1;
        //_order.totalAmount= 0;         // evm intialized
        //_order.quantityFilled= 0;      // evm intialized
        //_order.status= Status.NEW;     // evm intialized
        //_order.totalFee= 0;            // evm intialized


        if (_side == Side.BUY) {
            //Skip matching if in Auction Mode
            if (matchingAllowed(_tradePair.auctionMode)) {
                _quantity = matchSellBook(_tradePairId, _order);
            }
            // Unfilled Limit Orders Go in the Orderbook (Including Auction Orders)
            if (_quantity > 0  && _type1 == Type1.LIMIT) {
                orderBooks.addOrder(_tradePair.buyBookId, _order.id, _order.price);
                portfolio.adjustAvailable(IPortfolio.Tx.DECREASEAVAIL, _order.traderaddress, _tradePair.quoteSymbol,
                                          getQuoteAmount(_tradePairId, _price, _quantity));
            }
        } else {  // == Order.Side.SELL
            //Skip matching if in Auction Mode
            if (matchingAllowed(_tradePair.auctionMode)) {
                _quantity = matchBuyBook(_tradePairId, _order);
            }
            // Unfilled Limit Orders Go in the Orderbook (Including Auction Orders)
            if (_quantity > 0 && _type1 == Type1.LIMIT) {
                orderBooks.addOrder(_tradePair.sellBookId, _order.id, _order.price);
                portfolio.adjustAvailable(IPortfolio.Tx.DECREASEAVAIL, _order.traderaddress, _tradePair.baseSymbol, _quantity);
            }
        }
        if (_type1 == Type1.LIMITFOK && _quantity > 0) {
            _order.status = Status.KILLED;
        }
        emitStatusUpdate(_tradePairId, _order.id);  // EMIT order status. if no fills, the status will be NEW, if any fills status will be either PARTIAL or FILLED
    }

    function doOrderCancel(bytes32 _tradePairId, bytes32 _orderId) private {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        Order storage _order = orderMap[_orderId];
        _order.status = Status.CANCELED;
        if (_order.side == Side.BUY) {
            orderBooks.cancelOrder(_tradePair.buyBookId, _orderId, _order.price);
            portfolio.adjustAvailable(IPortfolio.Tx.INCREASEAVAIL, _order.traderaddress, _tradePair.quoteSymbol,
                                      getQuoteAmount(_tradePairId, _order.price, getRemainingQuantity(_order)));
        } else {
            orderBooks.cancelOrder(_tradePair.sellBookId, _orderId, _order.price);
            portfolio.adjustAvailable(IPortfolio.Tx.INCREASEAVAIL, _order.traderaddress, _tradePair.baseSymbol, getRemainingQuantity(_order));
        }
        emitStatusUpdate(_tradePairId, _order.id);
    }

    // FRONTEND ENTRY FUNCTION TO CALL TO C/R ORDER DURING AUCTION
    // The original order will lose its Time Priority as it is a new Order that is entered
    function cancelReplaceOrder(bytes32 _tradePairId, bytes32 _orderId, uint _price, uint _quantity) public override nonReentrant whenNotPaused {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(uint8(_tradePair.auctionMode) > 1, "T-AUCT-13");
        Order storage _order = orderMap[_orderId];
        require(_order.id != '', "T-EOID-01");
        require(_order.traderaddress == msg.sender, "T-OOCC-01");
        require(_order.quantityFilled < _order.quantity && (_order.status == Status.PARTIAL || _order.status== Status.NEW), "T-OAEX-01");
        require(!_tradePair.pairPaused, "T-PPAU-04");
        doOrderCancel(_tradePairId, _order.id);
        addLimitOrder(_tradePairId, _price, _quantity, _order.side, _order.type1);
    }

    // FRONTEND ENTRY FUNCTION TO CALL TO CANCEL ONE ORDER
    function cancelOrder(bytes32 _tradePairId, bytes32 _orderId) public override nonReentrant whenNotPaused {
        Order storage _order = orderMap[_orderId];
        require(_order.id != '', "T-EOID-01");
        require(_order.traderaddress == msg.sender, "T-OOCC-01");
        require(_order.quantityFilled < _order.quantity && (_order.status == Status.PARTIAL || _order.status== Status.NEW), "T-OAEX-01");
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(!_tradePair.pairPaused, "T-PPAU-02");
        doOrderCancel(_tradePairId, _order.id);
    }

    // FRONTEND ENTRY FUNCTION TO CALL TO CANCEL A DYNAMIC LIST OF ORDERS
    // THIS FUNCTION MAY RUN OUT OF GAS FOR FOR A TRADER TRYING TO CANCEL MANY ORDERS
    // CALL MAXIMUM 20 ORDERS AT A TIME
    function cancelAllOrders(bytes32 _tradePairId, bytes32[] memory _orderIds) public override nonReentrant whenNotPaused {
        TradePair storage _tradePair = tradePairMap[_tradePairId];
        require(!_tradePair.pairPaused, "T-PPAU-03");
        for (uint i=0; i<_orderIds.length; i++) {
            Order storage _order = orderMap[_orderIds[i]];
            require(_order.traderaddress == msg.sender, "T-OOCC-02");
            if (_order.id != '' && _order.quantityFilled < _order.quantity && (_order.status == Status.PARTIAL || _order.status== Status.NEW)) {
                doOrderCancel(_tradePairId, _order.id);
            }
        }
    }

    fallback() external {}

}
