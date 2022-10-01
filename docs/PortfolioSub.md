# PortfolioSub

**Subnet Portfolio**

Receives messages from mainnet for deposits and sends withdraw requests to mainnet.  It also
   transfers tokens between traders as their orders gets matched.

**Dev notes:** _Allows one to withdraw and deposit native token from/to the subnet wallet. Any other token has be be
deposited via PortfolioBridge using processXFerPayload function. It can only be invoked by a bridge
provider&#x27;s message receive event.
Any other token token including ALOT (native) can be withdrawn to mainnet using withdrawToken that will
send the holdings back to the user&#x27;s wallet in the mainnet.
TradePairs needs to have EXECUTOR_ROLE on PortfolioSub contract.
If a trader deposits a token and has 0 ALOT in his subnet wallet, this contract will make a call
to GasStation to deposit a small amount of ALOT to the user&#x27;s wallet to be used for gas.
In return, It will deduct a tiny amount of the token transferred._

## Types

### AssetEntry



```solidity
struct AssetEntry {
  uint256 total;
  uint256 available;
}
```
### AssetType



```solidity
enum AssetType {
  NATIVE,
  ERC20,
  NONE
}
```

## Variables

### assets

```solidity
mapping(address => mapping(bytes32 => struct PortfolioSub.AssetEntry)) assets
```
### tokenTotals

```solidity
mapping(bytes32 => uint256) tokenTotals
```
### walletBalanceDepositThreshold

```solidity
uint256 walletBalanceDepositThreshold
```
### depositFeeRate

```solidity
uint256 depositFeeRate
```
### withdrawFeeRate

```solidity
uint256 withdrawFeeRate
```
### feeAddress

```solidity
address feeAddress
```
### EXECUTOR_ROLE

```solidity
bytes32 EXECUTOR_ROLE
```
### totalNativeBurned

```solidity
uint256 totalNativeBurned
```
### VERSION

```solidity
bytes32 VERSION
```


## Methods

### initialize

Initializer for upgradeable Portfolio Sub

**Dev notes:** _Initializes with the native deposit threshold, users can deposit ALOT if they at least have 0.05 ALOT._

```solidity
function initialize(bytes32 _native, uint32 _chainId) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _native | bytes32 | Native token of the chain |
| _chainId | uint32 |  |


### setFeeAddress


**Dev notes:** _Only callable by the owner_

```solidity
function setFeeAddress(address _feeAddress) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _feeAddress | address | Address to collect trading fees |


### setAuctionMode

Set auction mode for a token

**Dev notes:** _Only callable by the default admin_

```solidity
function setAuctionMode(bytes32 _symbol, enum ITradePairs.AuctionMode _mode) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _mode | enum ITradePairs.AuctionMode | New auction mode |


### getBalance

Frontend function to show traders total and available balance for a token


```solidity
function getBalance(address _owner, bytes32 _symbol) external view returns (uint256 total, uint256 available, enum PortfolioSub.AssetType assetType)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | Address of the trader |
| _symbol | bytes32 | Symbol of the token |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| total | uint256 | Total balance of the trader |
| available | uint256 | Available balance of the trader |
| assetType | enum PortfolioSub.AssetType | Type of the token |

### addExecution

Function for TradePairs to transfer tokens between addresses as a result of an execution

**Dev notes:** _WHEN Increasing in addExectuion the amount is applied to both total and available
(so SafeIncrease can be used) as opposed to
WHEN Decreasing in addExectuion the amount is only applied to total. (SafeDecrease
can NOT be used, so we have safeDecreaseTotal instead)
i.e. (USDT 100 Total, 50 Available after we send a BUY order of 10 avax at 5$.
Partial Exec 5 at $5. Total goes down to 75. Available stays at 50)_

```solidity
function addExecution(enum ITradePairs.Side _makerSide, address _makerAddr, address _takerAddr, bytes32 _baseSymbol, bytes32 _quoteSymbol, uint256 _baseAmount, uint256 _quoteAmount, uint256 _makerfeeCharged, uint256 _takerfeeCharged) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _makerSide | enum ITradePairs.Side | Side of the maker |
| _makerAddr | address | Address of the maker |
| _takerAddr | address | Address of the taker |
| _baseSymbol | bytes32 | Symbol of the base token |
| _quoteSymbol | bytes32 | Symbol of the quote token |
| _baseAmount | uint256 | Amount of the base token |
| _quoteAmount | uint256 | Amount of the quote token |
| _makerfeeCharged | uint256 | Fee charged to the maker |
| _takerfeeCharged | uint256 | Fee charged to the taker |


### processXFerPayload

Processes the message coming from the bridge

**Dev notes:** _DEPOSIT messages are the only message that can be sent to the portfolio sub for the moment
Even when the contract is paused, this method is allowed for the messages that
are in flight to complete properly.
CAUTION: if Paused for upgrade, wait to make sure no messages are in flight, then upgrade._

```solidity
function processXFerPayload(address _trader, bytes32 _symbol, uint256 _quantity, enum IPortfolio.Tx _transaction) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _trader | address | Address of the trader |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount of the token |
| _transaction | enum IPortfolio.Tx | Transaction type |


### lzRecoverPayload

Recovers the stucked message from the LZ bridge, returns the funds to the depositor/withdrawer

**Dev notes:** _Only call this just before calling force resume receive function for the LZ bridge
Only the DEFAULT_ADMIN can call this function_

```solidity
function lzRecoverPayload(bytes _payload) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _payload | bytes | Payload of the message |


### depositNative

This function is only used to deposit native ALOT from the subnet wallet


```solidity
function depositNative(address payable _from, enum IPortfolioBridge.BridgeProvider) external payable
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address payable | Address of the depositor |
|  | enum IPortfolioBridge.BridgeProvider |  |


### withdrawNative

This function is used to withdraw only native ALOT to the subnet wallet

**Dev notes:** _This function decreases ALOT balance of the user and calls the PortfolioMinter to mint the native ALOT_

```solidity
function withdrawNative(address payable _to, uint256 _quantity) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address payable | Address of the withdrawer |
| _quantity | uint256 | Amount of the native ALOT to withdraw |


### withdrawToken

Withdraws the token to the mainnet


```solidity
function withdrawToken(address _to, bytes32 _symbol, uint256 _quantity, enum IPortfolioBridge.BridgeProvider _bridge) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | Address of the withdrawer |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount of the token |
| _bridge | enum IPortfolioBridge.BridgeProvider | Enum bridge type |


### adjustAvailable

Function for TradePairs to adjust total and available as a result of an order update


```solidity
function adjustAvailable(enum IPortfolio.Tx _transaction, address _trader, bytes32 _symbol, uint256 _amount) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _transaction | enum IPortfolio.Tx | Transaction type |
| _trader | address | Address of the trader |
| _symbol | bytes32 | Symbol of the token |
| _amount | uint256 | Amount of the token |


### transferToken

Transfers token from the `msg.sender`'s portfolio to `_to`'s portfolio

**Dev notes:** _This is not a ERC20 transfer, this is a balance transfer between portfolios_

```solidity
function transferToken(address _to, bytes32 _symbol, uint256 _quantity) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | Address of the receiver |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount of the token |


### withdrawFees

Withdraws collected fees to the mainnet

**Dev notes:** _Only admin can call this function_

```solidity
function withdrawFees() external
```


### getSwapAmount

Returns the swap amount for the given gas amount

**Dev notes:** _Calculates the swap amount for each token for the given gas amount_

```solidity
function getSwapAmount(bytes32 _symbol, uint256 _gasAmount) internal view returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _gasAmount | uint256 | Amount of gas to be swapped |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256  Amount of the token to be swapped |

### getGasStation



```solidity
function getGasStation() external view returns (contract IGasStation)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract IGasStation | IGasStation  Gas station contract |

### setGasStation

Sets the gas station contract

**Dev notes:** _Only admin can call this function_

```solidity
function setGasStation(contract IGasStation _gasStation) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _gasStation | contract IGasStation | Gas station contract to be set |


### getTreasury



```solidity
function getTreasury() external view returns (address)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | address  Address of the treasury wallet |

### setTreasury

Sets the treasury wallet

**Dev notes:** _Only admin can call this function_

```solidity
function setTreasury(address _treasury) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _treasury | address | Address of the treasury wallet |


### getPortfolioMinter



```solidity
function getPortfolioMinter() external view returns (contract IPortfolioMinter)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract IPortfolioMinter | IPortfolioMinter  Portfolio minter contract |

### setPortfolioMinter

Sets the portfolio minter contract

**Dev notes:** _Only admin can call this function_

```solidity
function setPortfolioMinter(contract IPortfolioMinter _portfolioMinter) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _portfolioMinter | contract IPortfolioMinter | Portfolio minter contract to be set |


### setWalletBalanceDepositThreshold

Sets wallet balance deposit thresholds

**Dev notes:** _This threshold checks the users remaining native balance while depositing native from subnet wallet._

```solidity
function setWalletBalanceDepositThreshold(uint256 _amount) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | Amount of native token to be set as threshold |


### addToken

Adds the given token to the portfolioSub with 0 address in the subnet.

**Dev notes:** _Only callable by admin
We don't allow tokens with same symbols.
Native symbol is also added as a token with 0 address.
PortfolioSub keeps track of total deposited tokens in tokenTotals for sanity checks against mainnet
It has no ERC20 Contracts hence, it overwtires the addresses with address(0).
But PortfolioBridgeSub keeps all the symbols added from all different mainnet chains separately with
their original details including the addresses
except AVAX which passed with address(0)._

```solidity
function addToken(bytes32 _symbol, address _tokenAddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode _mode) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _tokenAddress | address | Address of the token |
| _srcChainId | uint32 | Source Chain id, overwritten by srcChain of Portolio. Only used by PortfolioBridgeSub. |
| _decimals | uint8 | Decimals of the token |
| _mode | enum ITradePairs.AuctionMode | Starting auction mode of the token |


### removeToken

Remove IERC20 token from the tokenMap

**Dev notes:** _tokenTotals for the symbol should be 0 before it can be removed
                Make sure that there are no in-flight deposit messages_

```solidity
function removeToken(bytes32 _symbol) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | symbol of the token |


### updateTransferFeeRate

Updates the transfer fee rate for the given Tx type

**Dev notes:** _Only admin can call this function_

```solidity
function updateTransferFeeRate(uint256 _rate, enum IPortfolio.Tx _rateType) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _rate | uint256 | Transfer fee rate to be set |
| _rateType | enum IPortfolio.Tx | Tx type for which the transfer fee rate is to be set |


### addIERC20

Add IERC20 token to the tokenMap


```solidity
function addIERC20(bytes32 _symbol, address _tokenaddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode) internal
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Token symbol |
| _tokenaddress | address | Mainnet token address or zero address for AVAX |
| _srcChainId | uint32 | Source Chain id |
| _decimals | uint8 | Token decimals |
|  | enum ITradePairs.AuctionMode |  |


### getToken


**Dev notes:** _Only valid for the mainnet. Implemented with an empty block here._

```solidity
function getToken(bytes32 _symbol) external view returns (contract IERC20Upgradeable)
```


### depositToken


**Dev notes:** _Only valid for the mainnet. Implemented with an empty block here._

```solidity
function depositToken(address _from, bytes32 _symbol, uint256 _quantity, enum IPortfolioBridge.BridgeProvider) external
```


### depositTokenFromContract


**Dev notes:** _Only valid for the mainnet. Implemented with an empty block here._

```solidity
function depositTokenFromContract(address _from, bytes32 _symbol, uint256 _quantity) external
```


### removeIERC20


**Dev notes:** _Only valid for the mainnet. Implemented with an empty block here._

```solidity
function removeIERC20(bytes32 _symbol) internal
```



