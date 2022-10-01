# Portfolio

**Abstract contract to be inherited in PortfolioMain and PortfolioSub**

Dexalot lives in a dual chain environment. Avalanche Mainnet C-Chain (mainnet) and Avalanche
supported Dexalot Subnet (subnet). Dexalot’s contracts don’t bridge any coins or tokens
between these two chains, but rather lock them in the PortfolioMain contract in the
mainnet and then communicate the users’ holdings to its smart contracts in the subnet for
trading purposes. Dexalot is bridge agnostic. You will be able to deposit with one bridge and
withdraw with another. Having said that, LayerZero is the sole bridge provider at the start.
More bridges can be added in the future as needed.
Because of this novel architecture, a subnet wallet can only house ALOT token and nothing
else. That&#x27;s why the subnet wallet is referred to as the “Gas Tank”. All assets will be
handled inside the PortfolioSub smart contract in the subnet.
PortfolioBridge and PortfolioBridgeSub are bridge aggregators in charge of sending/receiving messages
via generic messaging using ative bridge transports.

**Dev notes:** _This contract contains shared logic for PortfolioMain and PortfolioSub.
It is perfectly sufficient for your trading application to interface with only the Dexalot Subnet
and use Dexalot frontend to perform deposit/withdraw operations manually for cross chain bridging.
If your trading application has a business need to deposit/withdraw more often, then your app
will need to integrate with the PortfolioMain contract in the mainnet as well to fully automate
your flow.
ExchangeSub needs to have DEFAULT_ADMIN_ROLE on this contract._


## Variables

### TENK

```solidity
uint256 TENK
```
### allowDeposit

```solidity
bool allowDeposit
```
### chainId

```solidity
uint32 chainId
```
### tokenList

```solidity
struct EnumerableSetUpgradeable.Bytes32Set tokenList
```
### trustedContracts

```solidity
mapping(address => bool) trustedContracts
```
### trustedContractToIntegrator

```solidity
mapping(address => string) trustedContractToIntegrator
```
### bridgeSwapAmount

```solidity
mapping(bytes32 => uint256) bridgeSwapAmount
```
### bridgeFee

```solidity
mapping(bytes32 => uint256) bridgeFee
```
### portfolioBridge

```solidity
contract IPortfolioBridge portfolioBridge
```
### PBRIDGE_ROLE

```solidity
bytes32 PBRIDGE_ROLE
```
### native

```solidity
bytes32 native
```
### tokenDetailsMap

```solidity
mapping(bytes32 => struct IPortfolio.TokenDetails) tokenDetailsMap
```
### PORTFOLIO_BRIDGE_ROLE

```solidity
bytes32 PORTFOLIO_BRIDGE_ROLE
```

## Events

### ParameterUpdated



```solidity
event ParameterUpdated(bytes32 pair, string _param, uint256 _oldValue, uint256 _newValue)
```
### AddressSet



```solidity
event AddressSet(string name, string actionName, address oldAddress, address newAddress)
```
### RoleUpdated



```solidity
event RoleUpdated(string name, string actionName, bytes32 updatedRole, address updatedAddress)
```

## Methods

### initialize

initializer function for Upgradeable Portfolio

**Dev notes:** _Grants admin role to msg.sender_

```solidity
function initialize(bytes32 _native, uint32 _chainId) public virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _native | bytes32 | Native token of the network. AVAX in mainnet, ALOT in subnet. |
| _chainId | uint32 |  |


### setPortfolioBridge

Sets the portfolio bridge contract address

**Dev notes:** _Only callable by admin_

```solidity
function setPortfolioBridge(address _portfolioBridge) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _portfolioBridge | address | New portfolio bridge contract address |


### enableBridgeProvider

Enables or disables a bridge provider

**Dev notes:** _Only callable by admin_

```solidity
function enableBridgeProvider(enum IPortfolioBridge.BridgeProvider _bridge, bool _enable) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bridge | enum IPortfolioBridge.BridgeProvider | Enum value of the bridge provider |
| _enable | bool | True to enable, false to disable |


### lzForceResumeReceive

Clears the blocking message in the LZ bridge, if any

**Dev notes:** _Force resume receive action is destructive
should be used only when the bridge is stuck and message is already recovered
   Only callable by admin_

```solidity
function lzForceResumeReceive(uint16 _srcChainId, bytes _srcAddress) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | LZ Chain ID of the source chain |
| _srcAddress | bytes | Address of the source contract |


### lzRetryPayload

Retries the stuck message in the LZ bridge, if any

**Dev notes:** _Only callable by admin_

```solidity
function lzRetryPayload(uint16 _srcChainId, bytes _srcAddress, bytes _payload) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | LZ Chain ID of the source chain |
| _srcAddress | bytes | Address of the source contract |
| _payload | bytes | Payload of the stucked message |


### getXFer

Parses XFER message coming from the bridge


```solidity
function getXFer(bytes _payload) internal view returns (address, bytes32, uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _payload | bytes | Payload passed from the bridge |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | address  Address of the trader |
| [1] | bytes32 | bytes32  Symbol of the token |
| [2] | uint256 | uint256  Amount of the token |

### lzRecoverPayload

Recovers the stuck message in the LZ bridge, if any

**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function lzRecoverPayload(bytes _payload) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _payload | bytes | Payload of the stucked message |


### processXFerPayload

Processes the XFER message coming from the bridge

**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function processXFerPayload(address _trader, bytes32 _symbol, uint256 _quantity, enum IPortfolio.Tx _transaction) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _trader | address | Address of the trader |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount of the token |
| _transaction | enum IPortfolio.Tx | Transaction type Enum |


### revokeRole

Revoke access control role wrapper

**Dev notes:** _Only callable by admin. Can't revoke itself's role, can't remove the only admin._

```solidity
function revokeRole(bytes32 _role, address _address) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _role | bytes32 | Role to be revoked |
| _address | address | Address to be revoked |


### getNative

Returns the native token of the chain


```solidity
function getNative() external view returns (bytes32)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | bytes32  Symbol of the native token |

### getChainId

Returns the native token of the chain


```solidity
function getChainId() external view returns (uint32)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint32 | bytes32  Symbol of the native token |

### pause

Pauses the portfolioBridge AND the contract

**Dev notes:** _Only callable by admin_

```solidity
function pause() external
```


### unpause

Unpauses portfolioBridge AND the contract

**Dev notes:** _Only callable by admin_

```solidity
function unpause() external
```


### pauseDeposit

(Dis)allows the deposit functionality only

**Dev notes:** _Only callable by admin_

```solidity
function pauseDeposit(bool _pause) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pause | bool | True to allow, false to disallow |


### setBridgeFee

Sets the bridge provider fee for the given token


```solidity
function setBridgeFee(bytes32 _symbol, uint256 _fee) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _fee | uint256 | Fee to be set |


### addTrustedContract

Adds the given contract to trusted contracts in order to provide excluded functionality

**Dev notes:** _Only callable by admin_

```solidity
function addTrustedContract(address _contract, string _organization) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contract | address | Address of the contract to be added |
| _organization | string | Organization of the contract to be added |


### isTrustedContract



```solidity
function isTrustedContract(address _contract) external view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contract | address | Address of the contract |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  True if the contract is trusted |

### removeTrustedContract

Removes the given contract from trusted contracts

**Dev notes:** _Only callable by admin_

```solidity
function removeTrustedContract(address _contract) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contract | address | Address of the contract to be removed |


### getBridgeSwapAmount

Returns the bridge swap amount for the given token


```solidity
function getBridgeSwapAmount(bytes32 _symbol) external view returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256  Bridge swap amount |

### setBridgeSwapAmount

Sets the bridge swap amount for the given token

**Dev notes:** _Always set it to equivalent of 1 ALOT. Only callable by admin._

```solidity
function setBridgeSwapAmount(bytes32 _symbol, uint256 _amount) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _amount | uint256 | Amount of token to be set |


### addIERC20

Function to add IERC20 token to the portfolio

**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function addIERC20(bytes32 _symbol, address _tokenaddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode _mode) internal virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _tokenaddress | address | Address of the token |
| _srcChainId | uint32 | Source Chain Id |
| _decimals | uint8 | Decimals of the token |
| _mode | enum ITradePairs.AuctionMode | Starting auction mode of the token |


### removeIERC20

Function to remove IERC20 token from the portfolio

**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function removeIERC20(bytes32 _symbol) internal virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |


### getToken

Frontend function to get the IERC20 token


```solidity
function getToken(bytes32 _symbol) external view virtual returns (contract IERC20Upgradeable)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract IERC20Upgradeable | IERC20Upgradeable  IERC20 token |

### addToken

Adds the given token to the portfolio

**Dev notes:** _Only callable by admin.
We don't allow tokens with the same symbols but different addresses.
Native symbol is also added by default with 0 address._

```solidity
function addToken(bytes32 _symbol, address _tokenAddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode _mode) public virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _tokenAddress | address | Address of the token |
| _srcChainId | uint32 | Source Chain id |
| _decimals | uint8 | Decimals of the token |
| _mode | enum ITradePairs.AuctionMode | Starting auction mode of the token |


### removeToken

Removes the given token from the portfolio

**Dev notes:** _Only callable by admin and portfolio should be paused. Makes sure there are no
in-flight deposit/withdraw messages_

```solidity
function removeToken(bytes32 _symbol) public virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |


### getTokenList

Frontend function to get all the tokens in the portfolio


```solidity
function getTokenList() external view returns (bytes32[])
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | bytes32[]  Array of symbols of the tokens |

### getTokenDetails

Returns the token details.

**Dev notes:** _Subnet does not have any ERC20s, hence the tokenAddress is token's mainnet address.
See the TokenDetails struct in IPortfolio for the full type information of the return variable._

```solidity
function getTokenDetails(bytes32 _symbol) external view returns (struct IPortfolio.TokenDetails)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token. Identical to mainnet |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct IPortfolio.TokenDetails | TokenDetails decimals (Identical to mainnet), tokenAddress (Token address at the mainnet) |

### getIdForToken



```solidity
function getIdForToken(bytes32 _symbol) internal view returns (bytes32 symbolId)
```


### fallback


**Dev notes:** _we revert transaction if a non-existing function is called_

```solidity
fallback() external payable
```


### receive

Receive function for direct send of native tokens
 @dev we process it as a deposit with the default bridge


```solidity
receive() external payable
```


### depositTokenChecks

Checks if the deposit is valid


```solidity
function depositTokenChecks(uint256 _quantity) internal virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _quantity | uint256 | Amount to be deposited |


### updateTransferFeeRate

Updates the transfer fee rate


```solidity
function updateTransferFeeRate(uint256 _rate, enum IPortfolio.Tx _rateType) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _rate | uint256 | New transfer fee rate |
| _rateType | enum IPortfolio.Tx | Enum for transfer type |


### setAuctionMode

Sets the auction mode for the token

**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function setAuctionMode(bytes32 _symbol, enum ITradePairs.AuctionMode _mode) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _mode | enum ITradePairs.AuctionMode | New auction mode to be set |


### depositNative


**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function depositNative(address payable _from, enum IPortfolioBridge.BridgeProvider _bridge) external payable virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address payable | Address of the depositor |
| _bridge | enum IPortfolioBridge.BridgeProvider | Enum for bridge type |


### withdrawNative


**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function withdrawNative(address payable _to, uint256 _quantity) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address payable | Address of the withdrawer |
| _quantity | uint256 | Amount to be withdrawn |


### depositToken


**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function depositToken(address _from, bytes32 _symbol, uint256 _quantity, enum IPortfolioBridge.BridgeProvider _bridge) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | Address of the depositor |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount to be deposited |
| _bridge | enum IPortfolioBridge.BridgeProvider | Enum for bridge type |


### depositTokenFromContract


**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function depositTokenFromContract(address _from, bytes32 _symbol, uint256 _quantity) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _from | address | Address of the depositor |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount to be deposited |


### withdrawToken


**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function withdrawToken(address _to, bytes32 _symbol, uint256 _quantity, enum IPortfolioBridge.BridgeProvider _bridge) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | Address of the withdrawer |
| _symbol | bytes32 | Symbol of the token |
| _quantity | uint256 | Amount to be withdrawn |
| _bridge | enum IPortfolioBridge.BridgeProvider | Enum for bridge type |


### adjustAvailable


**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function adjustAvailable(enum IPortfolio.Tx _transaction, address _trader, bytes32 _symbol, uint256 _amount) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _transaction | enum IPortfolio.Tx | Enum for transaction type |
| _trader | address | Address of the trader |
| _symbol | bytes32 | Symbol of the token |
| _amount | uint256 | Amount to be adjusted |


### addExecution


**Dev notes:** _Implemented in the child contract, as the logic differs._

```solidity
function addExecution(enum ITradePairs.Side _makerSide, address _makerAddr, address _takerAddr, bytes32 _baseSymbol, bytes32 _quoteSymbol, uint256 _baseAmount, uint256 _quoteAmount, uint256 _makerfeeCharged, uint256 _takerfeeCharged) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _makerSide | enum ITradePairs.Side | Side of the maker |
| _makerAddr | address | Address of the maker |
| _takerAddr | address | Address of the taker |
| _baseSymbol | bytes32 | Symbol of the base token |
| _quoteSymbol | bytes32 | Symbol of the quote token |
| _baseAmount | uint256 | Amount of base token |
| _quoteAmount | uint256 | Amount of quote token |
| _makerfeeCharged | uint256 | Fee charged to the maker |
| _takerfeeCharged | uint256 | Fee charged to the taker |



