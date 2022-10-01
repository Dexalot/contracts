# LzApp

**Generic Layer Zero Application Implementation**




## Variables

### lzEndpoint

```solidity
contract ILayerZeroEndpoint lzEndpoint
```
### lzOutNonce

```solidity
uint64 lzOutNonce
```
### lzInNonce

```solidity
uint64 lzInNonce
```
### lzTrustedRemoteLookup

```solidity
mapping(uint16 => bytes) lzTrustedRemoteLookup
```
### lzRemoteChainId

```solidity
uint16 lzRemoteChainId
```
### gasForDestinationLzReceive

```solidity
uint256 gasForDestinationLzReceive
```

## Events

### LZTrustedRemoteSet



```solidity
event LZTrustedRemoteSet(uint16 remoteChainId, bytes remoteAddress)
```

## Methods

### setLzEndPoint

Sets the Layer Zero Endpoint address

**Dev notes:** _Only admin can set the Layer Zero Endpoint address_

```solidity
function setLzEndPoint(address _endpoint) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _endpoint | address | Address of the Layer Zero Endpoint |


### getLzEndPoint



```solidity
function getLzEndPoint() external view returns (contract ILayerZeroEndpoint)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract ILayerZeroEndpoint | ILayerZeroEndpoint  Layer Zero Endpoint |

### lzReceive

Receive message from Layer Zero

**Dev notes:** _Implemented by the real application_

```solidity
function lzReceive(uint16 _srcChainId, bytes _srcAddress, uint64 _nonce, bytes _payload) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | Source chain id |
| _srcAddress | bytes | Source contract address |
| _nonce | uint64 | Nonce received |
| _payload | bytes | Payload received |


### lzSend

Sends message


```solidity
function lzSend(bytes _payload, address payable _refundAddress) internal virtual returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _payload | bytes | Payload to send |
| _refundAddress | address payable | Refund address |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | uint256  Message fee |

### lzEstimateFees

Estimates message fees


```solidity
function lzEstimateFees(bytes _payload) internal view returns (uint256 messageFee, bytes adapterParams)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _payload | bytes | Message payload |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| messageFee | uint256 | Message fee |
| adapterParams | bytes | Adapter parameters |

### getConfig


**Dev notes:** _parameter for address is ignored as it is defaulted to the address of this contract_

```solidity
function getConfig(uint16 _version, uint16 _chainId, address, uint256 _configType) external view returns (bytes)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | uint16 | Version of the config |
| _chainId | uint16 | Chain id |
|  | address |  |
| _configType | uint256 | Config type |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | bytes  Config details |

### setConfig

Sets generic config for LayerZero user Application


```solidity
function setConfig(uint16 _version, uint16 _chainId, uint256 _configType, bytes _config) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | uint16 | Version of the config |
| _chainId | uint16 | Chain id |
| _configType | uint256 | Config type |
| _config | bytes | Config to set |


### setSendVersion

Sets send message version

**Dev notes:** _Only admin can set the send message version_

```solidity
function setSendVersion(uint16 _version) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | uint16 | Version to set |


### setReceiveVersion

Sets receive message version

**Dev notes:** _Only admin can set the receive message version_

```solidity
function setReceiveVersion(uint16 _version) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | uint16 | Version to set |


### setLZTrustedRemote

Sets trusted remote address

**Dev notes:** _Allow owner to set it multiple times._

```solidity
function setLZTrustedRemote(uint16 _srcChainId, bytes _srcAddress) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | Source chain id |
| _srcAddress | bytes | Source contract address |


### forceResumeReceive

Force resumes the stucked bridge

**Dev notes:** _This action is destructive! Please use it only if you know what you are doing.
    Only admin can call this_

```solidity
function forceResumeReceive(uint16 _srcChainId, bytes _srcAddress) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | Source chain id |
| _srcAddress | bytes | Source contract address |


### retryPayload

Retries the stucked message in the bridge, if any

**Dev notes:** _Only admin can call this_

```solidity
function retryPayload(uint16 _srcChainId, bytes _srcAddress, bytes _payload) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | Source chain id |
| _srcAddress | bytes | Source contract address |
| _payload | bytes | Payload to retry |


### hasStoredPayload



```solidity
function hasStoredPayload(uint16 _srcChainId, bytes _srcAddress) external view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | Source chain id |
| _srcAddress | bytes | Source contract address |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  True if the bridge has stored payload, means it is stuck |

### getInboundNonce



```solidity
function getInboundNonce(uint16 _srcChainId, bytes _srcAddress) external view returns (uint64)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | Source chain id |
| _srcAddress | bytes | Source contract address |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint64 | uint64  Inbound nonce |

### getOutboundNonce



```solidity
function getOutboundNonce(uint16 _dstChainId, address _srcAddress) external view returns (uint64)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _dstChainId | uint16 | Destination chain id |
| _srcAddress | address | Source contract address |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint64 | uint64  Outbound nonce |

### isLZTrustedRemote



```solidity
function isLZTrustedRemote(uint16 _srcChainId, bytes _srcAddress) external view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _srcChainId | uint16 | Source chain id |
| _srcAddress | bytes | Source contract address |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  True if the source address is trusted |


