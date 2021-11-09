// SPDX-License-Identifier: BSD-3-Clause

pragma solidity ^0.8.3;

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

    function pause() external;
    function unpause() external;
    function pauseTradePair(bytes32 _tradePairId, bool _pairPaused) external;
    function pauseAddOrder(bytes32 _tradePairId, bool _allowAddOrder) external;
    function addTradePair(bytes32 _tradePairId, bytes32 _baseSymbol, uint8 _baseDecimals, uint8 _baseDisplayDecimals,
                          bytes32 _quoteSymbol, uint8 _quoteDecimals, uint8 _quoteDisplayDecimals,
                          uint _minTradeAmount, uint _maxTradeAmount) external;
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
    function getNSellBook(bytes32 _tradePairId, uint _n) external view returns (uint[] memory, uint[] memory);
    function getNBuyBook(bytes32 _tradePairId, uint _n) external view returns (uint[] memory, uint[] memory);
    function getOrder(bytes32 _orderUid) external view returns (Order memory);
    function addOrder(bytes32 _tradePairId, uint _price, uint _quantity, Side _side, Type1 _type1) external;
    function cancelOrder(bytes32 _tradePairId, bytes32 _orderId) external;
    function cancelAllOrders(bytes32 _tradePairId, bytes32[] memory _orderIds) external;

    enum Side     {BUY, SELL}
    enum Type1    {MARKET, LIMIT, STOP, STOPLIMIT}
    enum Status   {NEW, REJECTED, PARTIAL, FILLED, CANCELED, EXPIRED, KILLED}
    enum RateType {MAKER, TAKER}
    enum Type2    {GTC, FOK}
}
