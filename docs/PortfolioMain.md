# PortfolioMain

**Mainnet Portfolio**


**Dev notes:** _This contract prevalidates the PortfolioSub checks and allows deposits to be sent to the subnet.
ExchangeMain needs to have DEFAULT_ADMIN_ROLE on PortfolioMain._


## Variables

### VERSION

```solidity
bytes32 VERSION
```
### tokenMap

```solidity
mapping(bytes32 => contract IERC20Upgradeable) tokenMap
```
### bridgeFeeCollected

```solidity
mapping(bytes32 => uint256) bridgeFeeCollected
```


## Methods

### initialize

initializer function for Upgradeable Portfolio

**Dev notes:** _Grants admin role to msg.sender_

```solidity
function initialize(bytes32 _native, uint32 _chainId) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _native | bytes32 | Native token of the network. AVAX in mainnet, ALOT in subnet. |
| _chainId | uint32 |  |


### addIERC20

Add IERC20 token to the tokenMap. Only in the mainnet


```solidity
function addIERC20(bytes32 _symbol, address _tokenaddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode) internal
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | symbol of the token |
| _tokenaddress | address | address of the token |
| _srcChainId | uint32 |  |
| _decimals | uint8 | decimals of the token |
|  | enum ITradePairs.AuctionMode |  |


### removeIERC20

Remove IERC20 token from the tokenMap

**Dev notes:** _tokenMap balance for the symbol should be 0 before it can be removed.
                Make sure that there are no in-flight withdraw messages coming from the subnet_

```solidity
function removeIERC20(bytes32 _symbol) internal
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | symbol of the token |


### getToken

Frontend function to get the ERC20 token


```solidity
function getToken(bytes32 _symbol) external view returns (contract IERC20Upgradeable)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | symbol of the token |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract IERC20Upgradeable | IERC20Upgradeable  ERC20 token |

### depositNative



```solidity
function depositNative(address payable _from, enum IPortfolioBridge.BridgeProvider _bridge) external payable
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address payable | Address of the depositor |
| _bridge | enum IPortfolioBridge.BridgeProvider | Enum for bridge type |


### depositToken



```solidity
function depositToken(address _from, bytes32 _symbol, uint256 _quantity, enum IPortfolioBridge.BridgeProvider _bridge) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | Address of the depositor |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount of token to deposit |
| _bridge | enum IPortfolioBridge.BridgeProvider | Enum for bridge type |


### depositTokenFromContract

Allows deposits from trusted contracts

**Dev notes:** _Used by Avalaunch for DD deposits and Vesting Contracts.
                Keepig for backward compatibility instead of using ON_BEHALF_ROLE_

```solidity
function depositTokenFromContract(address _from, bytes32 _symbol, uint256 _quantity) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | Address of the depositor |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount of token to deposit |


### processXFerPayload

Processes the message coming from the bridge

**Dev notes:** _Only process WITHDRAW messages as it is the only message that can be sent to the portfolio main
                Even when the contract is paused, this method is allowed for the messages that
                are in flight to complete properly. Pause for upgrade, then wait to make sure no messages are in
                fligh then upgrade_

```solidity
function processXFerPayload(address _trader, bytes32 _symbol, uint256 _quantity, enum IPortfolio.Tx _transaction) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _trader | address | Address of the trader |
| _symbol | bytes32 | Symbol of the token in form of _symbol + chainId |
| _quantity | uint256 | Amount of token to be withdrawn |
| _transaction | enum IPortfolio.Tx | Transaction type |


### lzRecoverPayload

Recovers the stucked message from the LZ bridge, returns the funds to the depositor/withdrawer

**Dev notes:** _Only call this just before calling force resume receive function for the LZ bridge
    Only the owner can call this function_

```solidity
function lzRecoverPayload(bytes _payload) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _payload | bytes | Payload of the message |


### collectBridgeFees

Allows the owner to withdraw the fees collected from the bridge

**Dev notes:** _Collect fees to pay for the bridge as native token
    Only the owner can call this function_

```solidity
function collectBridgeFees(bytes32[] _symbols) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbols | bytes32[] | Array of symbols of tokens to withdraw |


### collectNativeBridgeFees

Allows the owner to withdraw the fees collected in AVAX from the bridge

**Dev notes:** _Collect fees to pay for the bridge as native token
    Only the owner can call this function_

```solidity
function collectNativeBridgeFees() external
```


### updateTransferFeeRate


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function updateTransferFeeRate(uint256 _rate, enum IPortfolio.Tx _rateType) external
```


### setAuctionMode


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function setAuctionMode(bytes32 _symbol, enum ITradePairs.AuctionMode _mode) external
```


### withdrawNative


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function withdrawNative(address payable _to, uint256 _quantity) external
```


### withdrawToken


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function withdrawToken(address _to, bytes32 _symbol, uint256 _quantity, enum IPortfolioBridge.BridgeProvider) external
```


### adjustAvailable


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function adjustAvailable(enum IPortfolio.Tx _transaction, address _trader, bytes32 _symbol, uint256 _amount) external
```


### addExecution


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function addExecution(enum ITradePairs.Side _makerSide, address _makerAddr, address _takerAddr, bytes32 _baseSymbol, bytes32 _quoteSymbol, uint256 _baseAmount, uint256 _quoteAmount, uint256 _makerfeeCharged, uint256 _takerfeeCharged) external
```



