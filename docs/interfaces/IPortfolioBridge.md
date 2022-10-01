# IPortfolioBridge

**Interface of PortfolioBridge**



## Types

### XChainMsgType



```solidity
enum XChainMsgType {
  XFER
}
```
### Direction



```solidity
enum Direction {
  SENT,
  RECEIVED
}
```
### BridgeProvider



```solidity
enum BridgeProvider {
  LZ,
  CELER
}
```


## Events

### XChainXFerMessage



```solidity
event XChainXFerMessage(uint8 version, enum IPortfolioBridge.BridgeProvider bridge, enum IPortfolioBridge.Direction msgDirection, uint32 remoteChainId, uint256 messageFee, struct IPortfolio.XFER xfer)
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


### sendXChainMessage



```solidity
function sendXChainMessage(enum IPortfolioBridge.BridgeProvider _bridge, struct IPortfolio.XFER _xfer) external
```


### executeDelayedTransfer



```solidity
function executeDelayedTransfer(bytes32 _id) external
```


### setDelayThresholds



```solidity
function setDelayThresholds(bytes32[] _tokens, uint256[] _thresholds) external
```


### setDelayPeriod



```solidity
function setDelayPeriod(uint256 _period) external
```


### setEpochLength



```solidity
function setEpochLength(uint256 _length) external
```


### setEpochVolumeCaps



```solidity
function setEpochVolumeCaps(bytes32[] _tokens, uint256[] _caps) external
```


### unpackMessage



```solidity
function unpackMessage(bytes _data) external pure returns (enum IPortfolioBridge.XChainMsgType _xchainMsgType, bytes msgdata)
```


### getXFerMessage



```solidity
function getXFerMessage(bytes _data) external view returns (struct IPortfolio.XFER xfer)
```


### enableBridgeProvider



```solidity
function enableBridgeProvider(enum IPortfolioBridge.BridgeProvider _bridge, bool _enable) external
```


### isBridgeProviderEnabled



```solidity
function isBridgeProviderEnabled(enum IPortfolioBridge.BridgeProvider _bridge) external view returns (bool)
```


### getDefaultBridgeProvider



```solidity
function getDefaultBridgeProvider() external view returns (enum IPortfolioBridge.BridgeProvider)
```


### addToken



```solidity
function addToken(bytes32 _symbol, address _tokenaddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode _mode) external
```


### removeToken



```solidity
function removeToken(bytes32 _symbol, uint32 _srcChainId) external
```


### VERSION



```solidity
function VERSION() external returns (bytes32)
```



