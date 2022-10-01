# Staking

**Flexible staking contract**




## Variables

### VERSION

```solidity
bytes32 VERSION
```
### rewardsToken

```solidity
contract IERC20Upgradeable rewardsToken
```
### stakingToken

```solidity
contract IERC20Upgradeable stakingToken
```
### periodFinish

```solidity
uint256 periodFinish
```
### rewardsDuration

```solidity
uint256 rewardsDuration
```
### rewardRate

```solidity
uint256 rewardRate
```
### lastUpdateTime

```solidity
uint256 lastUpdateTime
```
### rewardPerTokenStored

```solidity
uint256 rewardPerTokenStored
```
### isStakingPaused

```solidity
bool isStakingPaused
```
### userRewardPerTokenPaid

```solidity
mapping(address => uint256) userRewardPerTokenPaid
```
### rewards

```solidity
mapping(address => uint256) rewards
```

## Events

### Staked



```solidity
event Staked(address user, uint256 amount)
```
### Withdrawn



```solidity
event Withdrawn(address user, uint256 amount)
```
### Restaked



```solidity
event Restaked(address user, uint256 reward)
```
### RewardPaid



```solidity
event RewardPaid(address user, uint256 reward)
```
### RewardRateUpdated



```solidity
event RewardRateUpdated(uint256 rate)
```
### RewardsDurationUpdated



```solidity
event RewardsDurationUpdated(uint256 rewardsDuration)
```
### FundsRecovered



```solidity
event FundsRecovered(uint256 amount, address token)
```

## Methods

### initialize



```solidity
function initialize(address _stakingToken, address _rewardsToken, uint256 _rewardRate, uint256 _rewardsDuration) public
```


### totalStake



```solidity
function totalStake() external view returns (uint256)
```


### stakeOf



```solidity
function stakeOf(address account) external view returns (uint256)
```


### lastTimeRewardApplicable



```solidity
function lastTimeRewardApplicable() public view returns (uint256)
```


### rewardPerToken



```solidity
function rewardPerToken() public view returns (uint256)
```


### earned



```solidity
function earned(address account) public view returns (uint256)
```


### stake



```solidity
function stake(uint256 amount) external
```


### unstake



```solidity
function unstake(uint256 amount) public
```


### restake



```solidity
function restake() public
```


### claim



```solidity
function claim() public
```


### exit



```solidity
function exit(uint256 amount) external
```


### pause



```solidity
function pause() external
```


### unpause



```solidity
function unpause() external
```


### pauseStaking



```solidity
function pauseStaking() external
```


### unpauseStaking



```solidity
function unpauseStaking() external
```


### setRewardRate



```solidity
function setRewardRate(uint256 _rewardRate) external
```


### setRewardsDuration



```solidity
function setRewardsDuration(uint256 _rewardsDuration) external
```


### recoverFunds



```solidity
function recoverFunds() external
```



## Modifiers

### updateReward



```solidity
modifier updateReward(address account)
```


