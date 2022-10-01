# OrderBooks

**Central Limit Order Books**

This contract implements Central Limit Order Books with price and time priority
interacting with the underlying Red-Black-Tree.

**Dev notes:** _For each trade pair two order books are added to orderBookMap: buyBook and sellBook.
The naming convention for the order books is as follows: TRADEPAIRNAME-BUYBOOK and TRADEPAIRNAME-SELLBOOK.
For trade pair AVAX/USDT the order books are AVAX/USDT-BUYBOOK amd AVAX/USDT-SELLBOOK.
TradePairs should have EXECUTOR_ROLE in OrderBooks._

## Types

### OrderBook



```solidity
struct OrderBook {
  mapping(uint256 => struct Bytes32LinkedListLibrary.LinkedList) orderList;
  struct RBTLibrary.Tree orderBook;
  enum ITradePairs.Side side;
}
```

## Variables

### VERSION

```solidity
bytes32 VERSION
```
### EXECUTOR_ROLE

```solidity
bytes32 EXECUTOR_ROLE
```

## Events

### TradePairsSet



```solidity
event TradePairsSet(address _oldTradePairs, address _newTradePairs)
```

## Methods

### initialize

Initializer for upgradeable contract.


```solidity
function initialize() public
```


### setTradePairs

Sets trade pairs contract


```solidity
function setTradePairs(address _tradePairs) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tradePairs | address | address of the trade pairs contract |


### getTradePairs



```solidity
function getTradePairs() external view returns (contract ITradePairs)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract ITradePairs | ITradePairs  trade pairs contract |

### addToOrderbooks

Adds OrderBook with its side


```solidity
function addToOrderbooks(bytes32 _orderBookID, enum ITradePairs.Side _side) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | . |
| _side | enum ITradePairs.Side | BuyBook or SellBook |


### bestPrice

Returns the Best Bid or Best ASK depending on the OrderBook side


```solidity
function bestPrice(bytes32 _orderBookID) external view returns (uint256 price)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | Best Bid or Best ASK |

### getTopOfTheBook

Returns the OrderId of the Best Bid or Best ASK depending on the OrderBook side


```solidity
function getTopOfTheBook(bytes32 _orderBookID) external view returns (uint256 price, bytes32 orderId)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | Best Bid or Best ASK |
| orderId | bytes32 | Order Id of the Best Bid or Best ASK |

### isNotCrossedBook

Shows if any orders in the orderbook is crossed. Only relevant for auction orders

**Dev notes:** _Returns True if one of the orderbooks is empty_

```solidity
function isNotCrossedBook(bytes32 _sellBookId, bytes32 _buyBookId) external view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _sellBookId | bytes32 | Sell Order book ID |
| _buyBookId | bytes32 | Buy Order book ID |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool True if orderbook is not crossed and clear |

### exists



```solidity
function exists(bytes32 _orderBookID, uint256 _price) external view returns (bool doesExist)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _price | uint256 | Price |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| doesExist | bool | True if price exists |

### getNode


**Dev notes:** _used for getting red-black-tree details in debugging_

```solidity
function getNode(bytes32 _orderBookID, uint256 _price) external view returns (uint256 price, uint256 parent, uint256 left, uint256 right, bool red, bytes32 head, uint256 size)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _price | uint256 | Price |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | Price |
| parent | uint256 | Parent price |
| left | uint256 | Left price |
| right | uint256 | Right price |
| red | bool | True if red |
| head | bytes32 | Head price |
| size | uint256 | Size of the tree |

### getQuantitiesAtPrice


**Dev notes:** _Used for getting the quantities in linked list of orders at a price_

```solidity
function getQuantitiesAtPrice(bytes32 _orderBookID, uint256 _price) external view returns (uint256[])
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _price | uint256 | Price |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | uint256[]  Quantities |

### nextPrice

Next price from a tree of prices


```solidity
function nextPrice(bytes32 _orderBookID, enum ITradePairs.Side _side, uint256 _price) external view returns (uint256 price)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _side | enum ITradePairs.Side | Side |
| _price | uint256 | Price |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | Next price |

### getHead

Used for getting head of the linked list of orders at a price

**Dev notes:** _`( , bytes32 head) = orderBookMap[_orderBookID].orderList[price].getAdjacent('', false)`
will give the Same result as this function_

```solidity
function getHead(bytes32 _orderBookID, uint256 price) external view returns (bytes32 head)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| price | uint256 | Price |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| head | bytes32 | The id of the earliest order entered at the price level. |

### nextOrder

Get next order at a price from linked list of orders


```solidity
function nextOrder(bytes32 _orderBookID, uint256 _price, bytes32 _orderId) external view returns (bytes32 nextId)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _price | uint256 | Price |
| _orderId | bytes32 | Order ID |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| nextId | bytes32 | Next order ID |

### getBookSize

Used for getting number of price levels on an order book


```solidity
function getBookSize(bytes32 _orderBookID) external view returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256  Number of price levels |

### getNOrders

Get all orders at N price levels


```solidity
function getNOrders(bytes32 _orderBookID, uint256 _nPrice, uint256 _nOrder, uint256 _lastPrice, bytes32 _lastOrder) external view returns (uint256[] prices, uint256[] quantities, uint256, bytes32)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _nPrice | uint256 | Number of price levels |
| _nOrder | uint256 | Number of orders |
| _lastPrice | uint256 | Last price |
| _lastOrder | bytes32 | Last order |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| prices | uint256[] | Prices |
| quantities | uint256[] | Quantities |
| [2] | uint256 | uint256  Last price |
| [3] | bytes32 | bytes32  Last order |

### getNOrdersOld


**Dev notes:** _**Deprecated**. Use getNOrders instead. This is implemented with an unbound loop.
This function will run out of gas when retreiving big orderbook data._

```solidity
function getNOrdersOld(bytes32 _orderBookID, uint256 _n, uint256 _type) external view returns (uint256[], uint256[])
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _n | uint256 | Number of order to return |
| _type | uint256 | Type |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256[] | uint256[]  Prices |
| [1] | uint256[] | uint256[]  Quantities |

### matchTrade

Match orders


```solidity
function matchTrade(bytes32 _orderBookID, uint256 _price, uint256 _takerOrderRemainingQuantity, uint256 _makerOrderRemainingQuantity) external returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _price | uint256 | Price |
| _takerOrderRemainingQuantity | uint256 | Remaining quantity of the taker order |
| _makerOrderRemainingQuantity | uint256 | Remaining quantity of the maker order |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256  Matched quantity |

### addOrder

Add order to order book

**Dev notes:** _Make SURE the Quantity Check ( order remaining quantity > 0) is done before calling this function_

```solidity
function addOrder(bytes32 _orderBookID, bytes32 _orderUid, uint256 _price) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _orderUid | bytes32 | Order UID |
| _price | uint256 | Price |


### removeOrder

Removes order from order book


```solidity
function removeOrder(bytes32 _orderBookID, bytes32 _orderUid, uint256 _price) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _orderUid | bytes32 | Order UID |
| _price | uint256 | Price |


### orderListExists



```solidity
function orderListExists(bytes32 _orderBookID, uint256 _price) external view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _price | uint256 | Price |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  True if exists |

### removeFirstOrder

Removes the first order from the order book


```solidity
function removeFirstOrder(bytes32 _orderBookID, uint256 _price) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _orderBookID | bytes32 | Order book ID |
| _price | uint256 | Price |



