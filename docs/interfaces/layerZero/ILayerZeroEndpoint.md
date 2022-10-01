# ILayerZeroEndpoint







## Methods

### send



```solidity
function send(uint16 _dstChainId, bytes _destination, bytes _payload, address payable _refundAddress, address _zroPaymentAddress, bytes _adapterParams) external payable
```


### receivePayload



```solidity
function receivePayload(uint16 _srcChainId, bytes _srcAddress, address _dstAddress, uint64 _nonce, uint256 _gasLimit, bytes _payload) external
```


### getInboundNonce



```solidity
function getInboundNonce(uint16 _srcChainId, bytes _srcAddress) external view returns (uint64)
```


### getOutboundNonce



```solidity
function getOutboundNonce(uint16 _dstChainId, address _srcAddress) external view returns (uint64)
```


### estimateFees



```solidity
function estimateFees(uint16 _dstChainId, address _userApplication, bytes _payload, bool _payInZRO, bytes _adapterParam) external view returns (uint256 nativeFee, uint256 zroFee)
```


### getChainId



```solidity
function getChainId() external view returns (uint16)
```


### retryPayload



```solidity
function retryPayload(uint16 _srcChainId, bytes _srcAddress, bytes _payload) external
```


### hasStoredPayload



```solidity
function hasStoredPayload(uint16 _srcChainId, bytes _srcAddress) external view returns (bool)
```


### getSendLibraryAddress



```solidity
function getSendLibraryAddress(address _userApplication) external view returns (address)
```


### getReceiveLibraryAddress



```solidity
function getReceiveLibraryAddress(address _userApplication) external view returns (address)
```


### isSendingPayload



```solidity
function isSendingPayload() external view returns (bool)
```


### isReceivingPayload



```solidity
function isReceivingPayload() external view returns (bool)
```


### getConfig



```solidity
function getConfig(uint16 _version, uint16 _chainId, address _userApplication, uint256 _configType) external view returns (bytes)
```


### getSendVersion



```solidity
function getSendVersion(address _userApplication) external view returns (uint16)
```


### getReceiveVersion



```solidity
function getReceiveVersion(address _userApplication) external view returns (uint16)
```


### storedPayload



```solidity
function storedPayload(uint16 _srcChainId, bytes _srcAddress) external view returns (uint64, address, bytes32)
```



