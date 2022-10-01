# PortfolioBridge

**Bridge aggregator and message relayer for multiple different bridges**

The default bridge provider is LayerZero and it can&#x27;t be disabled. Additional bridge providers
will be added as needed. This contract encapsulates all bridge provider implementations that Portfolio
doesn&#x27;t need to know about.

**Dev notes:** _The information flow for messages between PortfolioMain and PortfolopSub is as follows:
PortfolioMain &#x3D;&gt; PortfolioBridgeMain &#x3D;&gt; BridgeProviderA/B/n &#x3D;&#x3D;&#x3D;&#x3D;&gt; PortfolioBridgeSub &#x3D;&#x3D;&gt; PortfolioSub
PortfolioSub &#x3D;&gt; PortfolioBridgeSub &#x3D;&gt; BridgeProviderA/B/n &#x3D;&#x3D;&#x3D;&#x3D;&gt; PortfolioBridgeMain &#x3D;&#x3D;&gt; PortfolioMain
PortfolioBirdge also serves as a symbol mapper to support multichain symbol handling.
PortfolioBridgeMain always maps the symbol as SYMBOL+portolio.srcChainId and expects the same back,
i.e USDC43114 if USDC is from Avalanche Mainnet. USDC1 if it is from Etherum.
PortfolioBridgeSub always maps the symbol that it receives into a common symbol on receipt,
i.e USDC43114 is mapped to USDC.
When sending back to the target chain, it maps it back to the expected symbol by the target chain,
i.e USDC to USDC1 if sent back to Etherum, USDC43114 if sent to Avalache.
Symbol mapping happens in packXferMessage on the way out. packXferMessage calls getTokenId that has
different implementations in PortfolioBridgeMain &amp; PortfolioBridgeSub. On the receival, the symbol mapping
will happen in different functions, either in processPayload or in getXFerMessage.
We need to raise the XChainXFerMessage before xfer.symbol is mapped in processPayload function so the
incoming and the outgoing xfer messages always contain the symbolId rather than symbol.
getXFerMessage is called by the portfolio to recover a stucked message from the LZ bridge, and to return
the funds to the depositor/withdrawer. Hence, getXFerMessage maps the symbolId to symbol._


## Variables

### portfolio

```solidity
contract IPortfolio portfolio
```
### PORTFOLIO_ROLE

```solidity
bytes32 PORTFOLIO_ROLE
```
### bridgeEnabled

```solidity
mapping(enum IPortfolioBridge.BridgeProvider => bool) bridgeEnabled
```
### tokenDetailsMapById

```solidity
mapping(bytes32 => struct IPortfolio.TokenDetails) tokenDetailsMapById
```
### tokenDetailsMapBySymbol

```solidity
mapping(bytes32 => mapping(uint32 => bytes32)) tokenDetailsMapBySymbol
```
### tokenList

```solidity
struct EnumerableSetUpgradeable.Bytes32Set tokenList
```
### defaultTargetChainId

```solidity
uint32 defaultTargetChainId
```
### defaultBridgeProvider

```solidity
enum IPortfolioBridge.BridgeProvider defaultBridgeProvider
```

## Events

### RoleUpdated



```solidity
event RoleUpdated(string name, string actionName, bytes32 updatedRole, address updatedAddress)
```
### GasForDestinationLzReceiveUpdated



```solidity
event GasForDestinationLzReceiveUpdated(uint256 gasForDestinationLzReceive)
```
### DefaultChainIdUpdated



```solidity
event DefaultChainIdUpdated(uint32 chainId)
```

## Methods

### VERSION



```solidity
function VERSION() public pure virtual returns (bytes32)
```


### initialize

Initializer for upgradeable contract.

**Dev notes:** _Grant admin, pauser and msg_sender role to the sender. Set gas for lz. Set endpoint and enable bridge_

```solidity
function initialize(address _endpoint) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _endpoint | address | Endpoint of the LZ bridge |


### pause

Pauses bridge operations

**Dev notes:** _Only pauser can pause_

```solidity
function pause() external
```


### unpause

Unpauses bridge operations

**Dev notes:** _Only pauser can unpause_

```solidity
function unpause() external
```


### enableBridgeProvider

Enables/disables given bridge. Default bridge's state can't be modified

**Dev notes:** _Only admin can enable/disable bridge_

```solidity
function enableBridgeProvider(enum IPortfolioBridge.BridgeProvider _bridge, bool _enable) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bridge | enum IPortfolioBridge.BridgeProvider | Bridge to enable/disable |
| _enable | bool | True to enable, false to disable |


### isBridgeProviderEnabled



```solidity
function isBridgeProviderEnabled(enum IPortfolioBridge.BridgeProvider _bridge) external view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bridge | enum IPortfolioBridge.BridgeProvider | Bridge to check |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  True if bridge is enabled, false otherwise |

### getDefaultBridgeProvider

Returns default bridge Provider


```solidity
function getDefaultBridgeProvider() external view returns (enum IPortfolioBridge.BridgeProvider)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | enum IPortfolioBridge.BridgeProvider | BridgeProvider |

### revokeRole

Wrapper for revoking roles

**Dev notes:** _Only admin can revoke role_

```solidity
function revokeRole(bytes32 _role, address _address) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _role | bytes32 | Role to revoke |
| _address | address | Address to revoke role from |


### setPortfolio

Set portfolio address to grant role

**Dev notes:** _Only admin can set portfolio address. One to one relationship between Portflio and PortfolioBridge_

```solidity
function setPortfolio(address _portfolio) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _portfolio | address | Portfolio address |


### getPortfolio



```solidity
function getPortfolio() external view returns (contract IPortfolio)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract IPortfolio | IPortfolio  Portfolio contract |

### setGasForDestinationLzReceive

Set max gas that can be used at the destination chain after message delivery

**Dev notes:** _Only admin can set gas for destination chain_

```solidity
function setGasForDestinationLzReceive(uint256 _gas) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _gas | uint256 | Gas for destination chain |


### addToken

Adds the given token to the portfoBrige. PortfoBrigeSub the list will be bigger as they could be from
different mainnet chains

**Dev notes:** _Only callable by admin or from Portfolio when a new common symbol is added for the first time.
    The same common symbol but different symbolId are required when adding a token to PortfoBrigeSub.
    Native symbol is also added as a token with 0 address_

```solidity
function addToken(bytes32 _symbol, address _tokenAddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | Symbol of the token |
| _tokenAddress | address | Mainnet token address the symbol or zero address for AVAX |
| _srcChainId | uint32 | Source Chain id |
| _decimals | uint8 | Decimals of the token |
|  | enum ITradePairs.AuctionMode |  |


### removeToken

Remove the token from the tokenDetailsMapById and tokenDetailsMapBySymbol

**Dev notes:** _Make sure that there are no in-flight messages_

```solidity
function removeToken(bytes32 _symbol, uint32 _srcChainId) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | symbol of the token |
| _srcChainId | uint32 | Source Chain id |


### getTokenId

Retruns the symbolId used in the mainnet given the srcChainId

**Dev notes:** _PortfolioBridgeSub uses the defaultTargetChain instead of portfolio.getChainId()
When sending from Mainnet to Subnet we send out the symbolId of the sourceChain. USDC => USDC1337
When receiving messages back it expects the same symbolId if USDC1337 sent, USDC1337 to recieve
Because the subnet needs to know about different ids from different mainnets._

```solidity
function getTokenId(bytes32 _symbol) internal view virtual returns (bytes32)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | symbol of the token |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | bytes32  symbolId |

### getSymbolForId

Retruns the locally used symbol given the symbolId

**Dev notes:** _Mainnet receives the messages in the same format that it sent out, by symbolId_

```solidity
function getSymbolForId(bytes32 _id) internal view returns (bytes32)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | bytes32  symbolId |

### getTokenDetails

Returns the token details.

**Dev notes:** _Will always return here as actionMode.OFF as auctionMode is controlled in PortfolioSub.
Subnet does not have any ERC20s, hence the tokenAddress is token's mainnet address.
See the TokenDetails struct in IPortfolio for the full type information of the return variable._

```solidity
function getTokenDetails(bytes32 _symbolId) external view returns (struct IPortfolio.TokenDetails)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbolId | bytes32 | SymbolId of the token. |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct IPortfolio.TokenDetails | TokenDetails decimals (Identical to mainnet), tokenAddress (Token address at the mainnet) |

### setDefaultTargetChain

Sets the default target chain id. To be extended with multichain implementation

**Dev notes:** _Only admin can call this function_

```solidity
function setDefaultTargetChain(uint32 _chainId) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _chainId | uint32 | Default Chainid to use |


### getTokenList

Frontend function to get all the tokens in the portfolio


```solidity
function getTokenList() external view returns (bytes32[])
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | bytes32[]  Array of symbols of the tokens |

### packXferMessage

Maps symbol to symbolId and encodes XFER message


```solidity
function packXferMessage(struct IPortfolio.XFER _xfer) internal view returns (bytes message)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _xfer | struct IPortfolio.XFER | XFER message to encode |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| message | bytes | Encoded XFER message |

### unpackMessage

Decodes XChainMsgType from the message


```solidity
function unpackMessage(bytes _data) public pure returns (enum IPortfolioBridge.XChainMsgType _xchainMsgType, bytes msgdata)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _data | bytes | Encoded message that has the msg type + msg |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| _xchainMsgType | enum IPortfolioBridge.XChainMsgType | XChainMsgType |
| msgdata | bytes | Still encoded message data. XFER in our case. Other message type not supported yet. |

### getXFerMessage

Unpacks XFER message and replaces the symbol with the local symbol


```solidity
function getXFerMessage(bytes _data) external view returns (struct IPortfolio.XFER xfer)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _data | bytes | XFER message |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| xfer | struct IPortfolio.XFER | Unpacked XFER message |

### sendXChainMessage

Wrapper function to send message to destination chain via bridge

**Dev notes:** _Only PORTFOLIO_ROLE can call_

```solidity
function sendXChainMessage(enum IPortfolioBridge.BridgeProvider _bridge, struct IPortfolio.XFER _xfer) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bridge | enum IPortfolioBridge.BridgeProvider | Bridge to send message to |
| _xfer | struct IPortfolio.XFER | XFER message to send |


### sendXChainMessageInternal

Actual internal function that implements the message sending.


```solidity
function sendXChainMessageInternal(enum IPortfolioBridge.BridgeProvider _bridge, struct IPortfolio.XFER _xfer) internal
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bridge | enum IPortfolioBridge.BridgeProvider | Bridge to send message to |
| _xfer | struct IPortfolio.XFER | XFER message to send |


### checkTreshholds

Overriden by PortfolioBridgeSub

**Dev notes:** _Tresholds not checked in the Mainnet. Neither for Incoming nor outgoing.
But both are checked in the subnet._

```solidity
function checkTreshholds(struct IPortfolio.XFER) internal virtual returns (bool)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  True |

### lzReceive

Receive message from source chain via LayerZero

**Dev notes:** _Only trusted LZ endpoint can call_

```solidity
function lzReceive(uint16 _srcChainId, bytes _srcAddress, uint64, bytes _payload) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | Source chain ID |
| _srcAddress | bytes | Source address |
|  | uint64 |  |
| _payload | bytes | Payload received |


### refundNative

Refunds the native balance inside contract

**Dev notes:** _Only admin can call_

```solidity
function refundNative() external
```


### refundTokens

Refunds the ERC20 balance inside contract

**Dev notes:** _Only admin can call_

```solidity
function refundTokens(address[] _tokens) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tokens | address[] | Array of ERC20 tokens to refund |


### executeDelayedTransfer


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function executeDelayedTransfer(bytes32 _id) external virtual
```


### setDelayThresholds


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function setDelayThresholds(bytes32[] _tokens, uint256[] _thresholds) external virtual
```


### setDelayPeriod


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function setDelayPeriod(uint256 _period) external virtual
```


### setEpochLength


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function setEpochLength(uint256 _length) external virtual
```


### setEpochVolumeCaps


**Dev notes:** _Only valid for the subnet. Implemented with an empty block here._

```solidity
function setEpochVolumeCaps(bytes32[] _tokens, uint256[] _caps) external virtual
```


### receive



```solidity
receive() external payable
```


### fallback



```solidity
fallback() external payable
```



