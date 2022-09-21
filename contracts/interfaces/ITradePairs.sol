// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

/**
*   @author "DEXALOT TEAM"
*   @title "ITradePairs: interface of TradePairs"
*/

interface ITradePairs {
    struct Order {
        bytes32 id;
        uint price;
        uint totalAmount;
        uint quantity;
        uint quantityFilled;
        uint totalFee;
        address traderaddress;
        Side side;
        Type1 type1;
        Status status;
    }

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
    }

    function pause() external;
    function unpause() external;
    function pauseTradePair(bytes32 _tradePairId, bool _pairPaused) external;
    function pauseAddOrder(bytes32 _tradePairId, bool _allowAddOrder) external;
    function addTradePair(bytes32 _tradePairId, bytes32 _baseSymbol, uint8 _baseDecimals, uint8 _baseDisplayDecimals,
                          bytes32 _quoteSymbol, uint8 _quoteDecimals, uint8 _quoteDisplayDecimals,
                          uint _minTradeAmount, uint _maxTradeAmount, AuctionMode _mode) external;
    function getTradePairs() external view returns (bytes32[] memory);
    function setMinTradeAmount(bytes32 _tradePairId, uint _minTradeAmount) external;
    function getMinTradeAmount(bytes32 _tradePairId) external view returns (uint);
    function setMaxTradeAmount(bytes32 _tradePairId, uint _maxTradeAmount) external;
    function getMaxTradeAmount(bytes32 _tradePairId) external view returns (uint);
    function addOrderType(bytes32 _tradePairId, Type1 _type) external;
    function removeOrderType(bytes32 _tradePairId, Type1 _type) external;
    function setDisplayDecimals(bytes32 _tradePairId, uint8 _displayDecimals, bool _isBase) external;
    function getDisplayDecimals(bytes32 _tradePairId, bool _isBase) external view returns (uint8);
    function getDecimals(bytes32 _tradePairId, bool _isBase) external view returns (uint8);
    function getSymbol(bytes32 _tradePairId, bool _isBase) external view returns (bytes32);
    function updateRate(bytes32 _tradePairId, uint _rate, RateType _rateType) external;
    function getMakerRate(bytes32 _tradePairId) external view returns (uint);
    function getTakerRate(bytes32 _tradePairId) external view returns (uint);
    function setAllowedSlippagePercent(bytes32 _tradePairId, uint8 _allowedSlippagePercent) external;
    function getAllowedSlippagePercent(bytes32 _tradePairId) external view returns (uint8);
    function getNSellBook(bytes32 _tradePairId, uint nPrice, uint nOrder, uint lastPrice, bytes32 lastOrder) external view
                                                                    returns (uint[] memory, uint[] memory, uint , bytes32);
    function getNBuyBook(bytes32 _tradePairId, uint nPrice, uint nOrder, uint lastPrice, bytes32 lastOrder) external view
                                                                    returns (uint[] memory, uint[] memory, uint , bytes32);
    function getOrder(bytes32 _orderUid) external view returns (Order memory);
    function addOrder(bytes32 _tradePairId, uint _price, uint _quantity, Side _side, Type1 _type1) external;
    function addOrderFrom(address _trader, bytes32 _tradePairId, uint _price, uint _quantity, Side _side, Type1 _type1) external;
    function cancelOrder(bytes32 _tradePairId, bytes32 _orderId) external;
    function cancelAllOrders(bytes32 _tradePairId, bytes32[] memory _orderIds) external;
    function cancelReplaceOrder(bytes32 _tradePairId, bytes32 _orderId, uint _price, uint _quantity) external;
    function setAuctionMode(bytes32 _tradePairId, AuctionMode _mode) external;
    function matchAuctionOrders(bytes32 _tradePairId, uint8 maxCount) external;
    function setAuctionPrice (bytes32 _tradePairId, uint _price) external;
    function getAuctionData (bytes32 _tradePairId) external view returns (uint8, uint);
    function unsolicitedCancel(bytes32 _tradePairId, bytes32 bookId , uint8 _maxCount) external;
    function getQuoteAmount(bytes32 _tradePairId, uint _price, uint _quantity) external view returns(uint);

    enum Side     {BUY, SELL}
    enum Type1    {MARKET, LIMIT, STOP, STOPLIMIT, LIMITFOK}
    enum Status   {NEW, REJECTED, PARTIAL, FILLED, CANCELED, EXPIRED, KILLED}
    enum RateType {MAKER, TAKER}
    enum Type2    {GTC, FOK}
    enum AuctionMode  {OFF, LIVETRADING, OPEN, CLOSING, PAUSED, MATCHING, CLOSINGT2, RESTRICTED}
}
