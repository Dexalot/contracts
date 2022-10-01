# IncentiveDistributor

**Distributor for Dexalot Incentive Program (DIP) rewards**

IncentiveDistributor distributes 200,000 $ALOT tokens monthly for up to 2 years and
potential other tokens to traders based on their trading activity. Token rewards per
trader are calculated off-chain and finalized at month&#x27;s end. To validate, we sign a
message containing the trader address, ids and amounts of reward tokens earned to date.
This signature is input to the claim function to verify and allow traders to withdraw
their earned Dexalot Incentive Program (DIP) rewards.



## Variables

### VERSION

```solidity
bytes32 VERSION
```
### allTokens

```solidity
uint32 allTokens
```
### tokens

```solidity
mapping(uint32 => contract IERC20Upgradeable) tokens
```
### claimedRewards

```solidity
mapping(address => mapping(uint32 => uint128)) claimedRewards
```

## Events

### Claimed



```solidity
event Claimed(address claimer, uint32 tokenIds, uint128[] amounts, uint256 timestamp)
```
### AddRewardToken



```solidity
event AddRewardToken(contract IERC20Upgradeable token, uint32 tokenId, uint256 timestamp)
```

## Methods

### initialize

Initializer of the IncentiveDistributor

**Dev notes:** _Adds ALOT token as the first reward token and defines the signer of claim messages._

```solidity
function initialize(contract IERC20Upgradeable _alotToken, address __signer) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _alotToken | contract IERC20Upgradeable | The address of the ALOT token |
| __signer | address | The public address of the signer of claim messages |


### claim

Claim DIP token rewards for a given trader


```solidity
function claim(uint128[] _amounts, uint32 _tokenIds, bytes _signature) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amounts | uint128[] | An array of total earned amount for each reward token |
| _tokenIds | uint32 | A bitmap representing which tokens to claim |
| _signature | bytes | A signed claim message to be verified |


### _checkClaim

Verifies claim message (_user, _tokenIds, _amount) has been signed by signer


```solidity
function _checkClaim(address _user, uint32 _tokenIds, uint128[] _amounts, bytes _signature) internal view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _user | address | The trader making a claim |
| _tokenIds | uint32 | A bitmap representing which tokens to claim |
| _amounts | uint128[] | An array of total earned amount for each reward token |
| _signature | bytes | A signed claim message to be verified |


### addRewardToken

Add new claimable reward token


```solidity
function addRewardToken(contract IERC20Upgradeable _rewardToken) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _rewardToken | contract IERC20Upgradeable | The address of the new reward token |


### retrieveRewardToken

Retrieve reward token when DIP ends


```solidity
function retrieveRewardToken(uint32 _tokenId) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tokenId | uint32 | The id of the reward token to retrieve |


### retrieveAllRewardTokens

Retrieve all reward tokens when DIP ends


```solidity
function retrieveAllRewardTokens() external
```


### pause

Pause to perform admin functions


```solidity
function pause() external
```


### unpause

Unpause to allow claiming to resume


```solidity
function unpause() external
```



