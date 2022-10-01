# PortfolioBridgeSub

**Bridge aggregator and message relayer for subnet**

This contracts checks volume and threshold limits for withdrawals.

**Dev notes:** _It implements delayedTransfers as well as volume caps per epoch per token_


## Variables

### delayPeriod

```solidity
uint256 delayPeriod
```
### epochLength

```solidity
uint256 epochLength
```
### delayedTransfers

```solidity
mapping(bytes32 => struct IPortfolio.XFER) delayedTransfers
```
### delayThresholds

```solidity
mapping(bytes32 => uint256) delayThresholds
```
### epochVolumes

```solidity
mapping(bytes32 => uint256) epochVolumes
```
### epochVolumeCaps

```solidity
mapping(bytes32 => uint256) epochVolumeCaps
```
### lastOpTimestamps

```solidity
mapping(bytes32 => uint256) lastOpTimestamps
```

## Events

### DelayedTransferAdded



```solidity
event DelayedTransferAdded(bytes32 id)
```
### DelayedTransferExecuted



```solidity
event DelayedTransferExecuted(bytes32 id, struct IPortfolio.XFER xfer)
```
### DelayPeriodUpdated



```solidity
event DelayPeriodUpdated(uint256 period)
```
### DelayThresholdUpdated



```solidity
event DelayThresholdUpdated(bytes32 symbol, uint256 threshold)
```
### EpochLengthUpdated



```solidity
event EpochLengthUpdated(uint256 length)
```
### EpochVolumeUpdated



```solidity
event EpochVolumeUpdated(bytes32 token, uint256 cap)
```

## Methods

### VERSION



```solidity
function VERSION() public pure returns (bytes32)
```


### sendXChainMessage

Sends XFER message to the destination chain

**Dev notes:** _This is a wrapper to check volume and threshold while withdrawing_

```solidity
function sendXChainMessage(enum IPortfolioBridge.BridgeProvider _bridge, struct IPortfolio.XFER _xfer) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bridge | enum IPortfolioBridge.BridgeProvider | Bridge type to send over |
| _xfer | struct IPortfolio.XFER | XFER message to send |


### checkTreshholds

Checks the volume and thresholds to delay or execute immediately

**Dev notes:** _This function is called both in processPayload (deposits coming from mainnet)
as well as sendXChainMessage (withdrawals from the subnet)
Not bridge specific! Delayed messages will be processed by the defaultBridge_

```solidity
function checkTreshholds(struct IPortfolio.XFER _xfer) internal returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _xfer | struct IPortfolio.XFER | XFER message |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  True if the transfer can be executed immediately, false if it is delayed |

### getTokenId

Retruns the symbolId used the subnet given the targetChainId

**Dev notes:** _it uses the defaultTargetChain instead of instead of portfolio.getChainId() that PortfolioBridge uses.
When sending from Mainnet to Subnet we send out the symbolId of the sourceChain. USDC => USDC1337
Because the subnet needs to know about different ids from different mainnets.
When sending messages Subnet to Mainnet, it resolves it back to the symbolId the target chain expects_

```solidity
function getTokenId(bytes32 _symbol) internal view returns (bytes32)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | symbol of the token |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | bytes32  symbolId |

### setDelayThresholds

Sets delay thresholds for tokens

**Dev notes:** _Only admin can call this function_

```solidity
function setDelayThresholds(bytes32[] _tokens, uint256[] _thresholds) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tokens | bytes32[] | Array of tokens |
| _thresholds | uint256[] | Array of thresholds |


### setDelayPeriod

Sets delay period for delayed transfers

**Dev notes:** _Only admin can call this function_

```solidity
function setDelayPeriod(uint256 _period) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _period | uint256 | Delay period in seconds |


### executeDelayedTransfer

Executes delayed transfer if the delay period has passed

**Dev notes:** _Only admin can call this function_

```solidity
function executeDelayedTransfer(bytes32 _id) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _id | bytes32 | Transfer ID |


### setEpochLength

Sets epoch length for volume control

**Dev notes:** _Only admin can call this function_

```solidity
function setEpochLength(uint256 _length) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _length | uint256 | Epoch length in seconds |


### setEpochVolumeCaps

Sets volume cap for tokens

**Dev notes:** _Only admin can call this function_

```solidity
function setEpochVolumeCaps(bytes32[] _tokens, uint256[] _caps) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tokens | bytes32[] | Array of tokens |
| _caps | uint256[] | Array of caps |



