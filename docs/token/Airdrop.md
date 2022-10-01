# Airdrop

**Flexible airdrop contract**




## Variables

### VERSION

```solidity
bytes32 VERSION
```
### token

```solidity
contract IERC20 token
```
### root

```solidity
bytes32 root
```

## Events

### Claimed



```solidity
event Claimed(address claimer, uint256 amount, uint256 timestamp)
```

## Methods

### constructor



```solidity
constructor(contract IERC20 _token, bytes32 _root, uint256 __start, uint256 __cliffDuration, uint256 __duration, uint256 __firstReleasePercentage) public
```


### cliff



```solidity
function cliff() external view returns (uint256)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the cliff time of the airdrop vesting |

### start



```solidity
function start() external view returns (uint256)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the start time of the airdrop vesting |

### duration



```solidity
function duration() external view returns (uint256)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the duration of the airdrop vesting |

### getPercentage



```solidity
function getPercentage() external view returns (uint256)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the initial release percentage. |

### claim


**Dev notes:** _Claims tokens to user's wallet_

```solidity
function claim(uint256 index, uint256 amount, bytes32[] merkleProof) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index | uint256 | value of the position in the list |
| amount | uint256 | total value to airdrop, Percentage and Vesting calculated by it |
| merkleProof | bytes32[] | the proof of merkle |


### released



```solidity
function released(uint256 index) external view returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index | uint256 | value of the position in the list |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | released amount for the index |

### releasableAmount



```solidity
function releasableAmount(uint256 index, uint256 amount, bytes32[] merkleProof) external view returns (uint256)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index | uint256 | value of the position in the list |
| amount | uint256 | total value to airdrop, Percentage and Vesting calculated by it |
| merkleProof | bytes32[] | the proof of merkle |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | releasableAmount for the index |

### retrieveProjectToken


**Dev notes:** _retrieves project tokens from the contract sending to the owner_

```solidity
function retrieveProjectToken() external
```


### retrieveOtherToken


**Dev notes:** _retrieves other tokens from the contract sending to the owner_

```solidity
function retrieveOtherToken(address tok) external
```


### pause


**Dev notes:** _pauses the contract_

```solidity
function pause() external
```


### unpause


**Dev notes:** _unpauses the contract_

```solidity
function unpause() external
```



