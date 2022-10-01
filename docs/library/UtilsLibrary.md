# UtilsLibrary

**Common utility functions used across Dexalot&#x27;s smart contracts.**


**Dev notes:** _This library provides a set of simple, pure functions to be used in other contracts._




## Methods

### decimalsOk

Checks the validity of price and quantity given the evm and display decimals.


```solidity
function decimalsOk(uint256 _value, uint8 _decimals, uint8 _displayDecimals) internal pure returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _value | uint256 | price or quantity |
| _decimals | uint8 | evm decimals |
| _displayDecimals | uint8 | base or quote display decimals |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  true if ok |

### getRemainingQuantity

Returns the remaining quantity for an Order struct.


```solidity
function getRemainingQuantity(uint256 _quantity, uint256 _quantityFilled) internal pure returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _quantity | uint256 | original order quantity |
| _quantityFilled | uint256 | filled quantity |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256  remaining quantity |

### matchingAllowed

Checks if a tradePair is in auction and if matching is not allowed in the orderbook.


```solidity
function matchingAllowed(enum ITradePairs.AuctionMode _mode) internal pure returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _mode | enum ITradePairs.AuctionMode | Auction Mode |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  true/false |

### isAuctionRestricted

Checks if the auction is in a restricted state.


```solidity
function isAuctionRestricted(enum ITradePairs.AuctionMode _mode) internal pure returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _mode | enum ITradePairs.AuctionMode | Auction Mode |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  true if Auction is in restricted mode |

### canCancel

Checks if the order is cancelable.

**Dev notes:** _For an order _quantityFilled < _quantity and its status should be PARTIAL or NEW
                to be eligable for cancelation_

```solidity
function canCancel(uint256 _quantity, uint256 _quantityFilled, enum ITradePairs.Status _orderStatus) internal pure returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _quantity | uint256 | quantity of the order |
| _quantityFilled | uint256 | quantityFilled of the order |
| _orderStatus | enum ITradePairs.Status | status of the order |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  true if cancelable |

### floor

Round down a unit256 value.  Used for the fees to avoid dust.

**Dev notes:** _example: a = 1245, m: 2 ==> 1200_

```solidity
function floor(uint256 _a, uint256 _m) internal pure returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _a | uint256 | number to round down |
| _m | uint256 | number of digits from the right to round down |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256  . |

### min

Returns the minuimum of the two uint256 arguments


```solidity
function min(uint256 _a, uint256 _b) internal pure returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _a | uint256 | A |
| _b | uint256 | B |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256  Min of a and b |

### bytes32ToString

Converts a bytes32 value to a string


```solidity
function bytes32ToString(bytes32 _bytes32) internal pure returns (string)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytes32 | bytes32 | bytes32 data to be converted to string |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | string  converted string representation |

### stringToBytes32

Converts a string to a bytes32 value


```solidity
function stringToBytes32(string _string) internal pure returns (bytes32 result)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _string | string | a sting to be converted to bytes32 |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| result | bytes32 | converted bytes32 representation |

### getIdForToken

Returns the symbolId that consists of symbol+chainid


```solidity
function getIdForToken(bytes32 _symbol, uint32 _srcChainId) internal pure returns (bytes32 id)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | token symbol of an asset |
| _srcChainId | uint32 | chain id where the asset exists |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | bytes32 | the resulting symbolId |


