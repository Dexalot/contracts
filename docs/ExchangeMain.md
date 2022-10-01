# ExchangeMain

**Mainnet Exchange**

This contract is the mainnet version of the Dexalot Exchange.

**Dev notes:** _ExchangeMain is DEFAULT_ADMIN to PortfolioMain contract._


## Variables

### VERSION

```solidity
bytes32 VERSION
```
### priceFeed

```solidity
contract AggregatorV3Interface priceFeed
```

## Events

### CoinFlipped



```solidity
event CoinFlipped(uint80 roundid, int256 price, bool outcome)
```

## Methods

### initialize

Initializer for upgradeable contract.

**Dev notes:** _Sets Chainlink price feed address._

```solidity
function initialize() public
```


### pauseForUpgrade

(Un)pauses portoflioMain and portfolioBridgeMain for upgrade


```solidity
function pauseForUpgrade(bool _pause) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pause | bool | true to pause, false to unpause |


### setPriceFeed

Sets Chainlink price feed address.


```solidity
function setPriceFeed(address _address) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | address of the price feed contract |


### getPriceFeed



```solidity
function getPriceFeed() external view returns (contract AggregatorV3Interface)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract AggregatorV3Interface | AggregatorV3Interface  price feed contract |

### isHead

returns true/false = head/tail based on the latest AVAX/USD price


```solidity
function isHead() public view returns (uint80 r, int256 p, bool o)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| r | uint80 | the round id parameter from Chainlink price feed |
| p | int256 | price of AVAX for this round id |
| o | bool | outcome of the coin flip |

### flipCoin

emits coin flip results based on the latest AVAX/USD price


```solidity
function flipCoin() external
```



