# ITradePairs

**Interface of TradePairs**



## Types

### Order



```solidity
struct Order {
  bytes32 id;
  bytes32 clientOrderId;
  bytes32 tradePairId;
  uint256 price;
  uint256 totalAmount;
  uint256 quantity;
  uint256 quantityFilled;
  uint256 totalFee;
  address traderaddress;
  enum ITradePairs.Side side;
  enum ITradePairs.Type1 type1;
  enum ITradePairs.Type2 type2;
  enum ITradePairs.Status status;
}
```
### TradePair



```solidity
struct TradePair {
  bytes32 baseSymbol;
  bytes32 quoteSymbol;
  bytes32 buyBookId;
  bytes32 sellBookId;
  uint256 minTradeAmount;
  uint256 maxTradeAmount;
  uint256 auctionPrice;
  enum ITradePairs.AuctionMode auctionMode;
  uint8 makerRate;
  uint8 takerRate;
  uint8 baseDecimals;
  uint8 baseDisplayDecimals;
  uint8 quoteDecimals;
  uint8 quoteDisplayDecimals;
  uint8 allowedSlippagePercent;
  bool addOrderPaused;
  bool pairPaused;
}
```
### Side



```solidity
enum Side {
  BUY,
  SELL
}
```
### Type1



```solidity
enum Type1 {
  MARKET,
  LIMIT,
  STOP,
  STOPLIMIT
}
```
### Status



```solidity
enum Status {
  NEW,
  REJECTED,
  PARTIAL,
  FILLED,
  CANCELED,
  EXPIRED,
  KILLED
}
```
### RateType



```solidity
enum RateType {
  MAKER,
  TAKER
}
```
### Type2



```solidity
enum Type2 {
  GTC,
  FOK,
  IOC,
  PO
}
```
### AuctionMode



```solidity
enum AuctionMode {
  OFF,
  LIVETRADING,
  OPEN,
  CLOSING,
  PAUSED,
  MATCHING,
  RESTRICTED
}
```


## Events

### NewTradePair



```solidity
event NewTradePair(uint8 version, bytes32 pair, uint8 basedisplaydecimals, uint8 quotedisplaydecimals, uint256 mintradeamount, uint256 maxtradeamount)
```
### OrderStatusChanged

Emits a given order's latest state

**Dev notes:** _The details of the emitted event is as follows: \
`version`  event version \
`traderaddress`  traders’s wallet (immutable) \
`pair`  traded pair. ie. ALOT/AVAX in bytes32 (immutable) \
`orderId`  unique order id assigned by the contract (immutable) \
`clientOrderId`  client order id given by the sender of the order as a reference (immutable) \
`price` price of the order entered by the trader. (0 if market order) (immutable) \
`totalamount`   cumulative amount in quote currency. ⇒ price* quantityfilled . If
multiple partial fills , the new partial fill price*quantity is added to the
current value in the field. Average execution price can be quickly
calculated by totalamount/quantityfilled regardless of the number of
partial fills at different prices \
`quantity`  order quantity (immutable) \
`side` Order side      See #Side (immutable) \
`type1`  Order Type1   See #Type1 (immutable) \
`type2`  Order Type2   See #Type2 (immutable) \
`status` Order Status  See #Status \
`quantityfilled`  cumulative quantity filled \
`totalfee` cumulative fee paid for the order (total fee is always in terms of
received(incoming) currency. ie. if Buy ALOT/AVAX, fee is paid in ALOT, if Sell
ALOT/AVAX , fee is paid in AVAX \
**Note**: The execution price will always be equal or better than the Order price._

```solidity
event OrderStatusChanged(uint8 version, address traderaddress, bytes32 pair, bytes32 orderId, bytes32 clientOrderId, uint256 price, uint256 totalamount, uint256 quantity, enum ITradePairs.Side side, enum ITradePairs.Type1 type1, enum ITradePairs.Type2 type2, enum ITradePairs.Status status, uint256 quantityfilled, uint256 totalfee)
```
### Executed

Emits the Executed/Trade Event showing

**Dev notes:** _The details of the emitted event is as follows: \
`version`  event version \
`pair`  traded pair. ie. ALOT/AVAX in bytes32 \
`price`  executed price \
`quantity`  executed quantity \
`makerOrderId`  Maker Order id \
`takerOrderId`  Taker Order id \
`mlastFee`  fee paid by maker \
`tlastFee`  fee paid by taker \
`takerSide`  Side of the taker order. 0 - BUY, 1- SELL (Note: This can be used to identify
the fee UNITs. If takerSide = 1, then the fee is paid by the Maker in Base
Currency and the fee paid by the taker in Quote currency. If takerSide= 0
then the fee is paid by the Maker in Quote Currency and the fee is paid by
the taker in Base currency \
`execId`  Unique trade id (execution id) assigned by the contract \
`addressMaker`  maker traderaddress \
`addressTaker`  taker traderaddress \_

```solidity
event Executed(uint8 version, bytes32 pair, uint256 price, uint256 quantity, bytes32 makerOrder, bytes32 takerOrder, uint256 feeMaker, uint256 feeTaker, enum ITradePairs.Side takerSide, uint256 execId, address addressMaker, address addressTaker)
```
### ParameterUpdated



```solidity
event ParameterUpdated(uint8 version, bytes32 pair, string param, uint256 oldValue, uint256 newValue)
```

## Methods

### pause



```solidity
function pause() external
```


### unpause



```solidity
function unpause() external
```


### pauseTradePair



```solidity
function pauseTradePair(bytes32 _tradePairId, bool _pairPause) external
```


### pauseAddOrder



```solidity
function pauseAddOrder(bytes32 _tradePairId, bool _allowAddOrder) external
```


### addTradePair



```solidity
function addTradePair(bytes32 _tradePairId, bytes32 _baseSymbol, uint8 _baseDecimals, uint8 _baseDisplayDecimals, bytes32 _quoteSymbol, uint8 _quoteDecimals, uint8 _quoteDisplayDecimals, uint256 _minTradeAmount, uint256 _maxTradeAmount, enum ITradePairs.AuctionMode _mode) external
```


### getTradePairs



```solidity
function getTradePairs() external view returns (bytes32[])
```


### setMinTradeAmount



```solidity
function setMinTradeAmount(bytes32 _tradePairId, uint256 _minTradeAmount) external
```


### getMinTradeAmount



```solidity
function getMinTradeAmount(bytes32 _tradePairId) external view returns (uint256)
```


### setMaxTradeAmount



```solidity
function setMaxTradeAmount(bytes32 _tradePairId, uint256 _maxTradeAmount) external
```


### getMaxTradeAmount



```solidity
function getMaxTradeAmount(bytes32 _tradePairId) external view returns (uint256)
```


### addOrderType



```solidity
function addOrderType(bytes32 _tradePairId, enum ITradePairs.Type1 _type) external
```


### removeOrderType



```solidity
function removeOrderType(bytes32 _tradePairId, enum ITradePairs.Type1 _type) external
```


### setDisplayDecimals



```solidity
function setDisplayDecimals(bytes32 _tradePairId, uint8 _displayDecimals, bool _isBase) external
```


### getDisplayDecimals



```solidity
function getDisplayDecimals(bytes32 _tradePairId, bool _isBase) external view returns (uint8)
```


### getDecimals



```solidity
function getDecimals(bytes32 _tradePairId, bool _isBase) external view returns (uint8)
```


### getSymbol



```solidity
function getSymbol(bytes32 _tradePairId, bool _isBase) external view returns (bytes32)
```


### updateRate



```solidity
function updateRate(bytes32 _tradePairId, uint8 _rate, enum ITradePairs.RateType _rateType) external
```


### getMakerRate



```solidity
function getMakerRate(bytes32 _tradePairId) external view returns (uint8)
```


### getTakerRate



```solidity
function getTakerRate(bytes32 _tradePairId) external view returns (uint8)
```


### setAllowedSlippagePercent



```solidity
function setAllowedSlippagePercent(bytes32 _tradePairId, uint8 _allowedSlippagePercent) external
```


### getAllowedSlippagePercent



```solidity
function getAllowedSlippagePercent(bytes32 _tradePairId) external view returns (uint8)
```


### getNBook



```solidity
function getNBook(bytes32 _tradePairId, enum ITradePairs.Side _side, uint256 _nPrice, uint256 _nOrder, uint256 _lastPrice, bytes32 _lastOrder) external view returns (uint256[], uint256[], uint256, bytes32)
```


### getOrder



```solidity
function getOrder(bytes32 _orderId) external view returns (struct ITradePairs.Order)
```


### getOrderByClientOrderId



```solidity
function getOrderByClientOrderId(address _trader, bytes32 _clientOrderId) external view returns (struct ITradePairs.Order)
```


### addOrder



```solidity
function addOrder(address _trader, bytes32 _clientOrderId, bytes32 _tradePairId, uint256 _price, uint256 _quantity, enum ITradePairs.Side _side, enum ITradePairs.Type1 _type1, enum ITradePairs.Type2 _type2) external
```


### cancelOrder



```solidity
function cancelOrder(bytes32 _orderId) external
```


### cancelAllOrders



```solidity
function cancelAllOrders(bytes32[] _orderIds) external
```


### cancelReplaceOrder



```solidity
function cancelReplaceOrder(bytes32 _orderId, bytes32 _clientOrderId, uint256 _price, uint256 _quantity) external
```


### setAuctionMode



```solidity
function setAuctionMode(bytes32 _tradePairId, enum ITradePairs.AuctionMode _mode) external
```


### setAuctionPrice



```solidity
function setAuctionPrice(bytes32 _tradePairId, uint256 _price) external
```


### getAuctionData



```solidity
function getAuctionData(bytes32 _tradePairId) external view returns (uint8, uint256)
```


### unsolicitedCancel



```solidity
function unsolicitedCancel(bytes32 _tradePairId, bool _isBuyBook, uint8 _maxCount) external
```


### getQuoteAmount



```solidity
function getQuoteAmount(bytes32 _tradePairId, uint256 _price, uint256 _quantity) external view returns (uint256)
```


### getBookId



```solidity
function getBookId(bytes32 _tradePairId, enum ITradePairs.Side _side) external view returns (bytes32)
```


### matchAuctionOrder



```solidity
function matchAuctionOrder(bytes32 _takerOrderId, uint8 _maxCount) external returns (uint256)
```



