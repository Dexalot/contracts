# TokenVestingCloneFactory

**Clone factory for TokenVestingCloneable**




## Variables

### VERSION

```solidity
bytes32 VERSION
```
### implementation

```solidity
address implementation
```
### clones

```solidity
mapping(uint256 => address) clones
```
### count

```solidity
uint256 count
```

## Events

### TokenVestingCloneFactoryInitialized



```solidity
event TokenVestingCloneFactoryInitialized(address implementation)
```
### NewClone



```solidity
event NewClone(address _clone)
```

## Methods

### constructor



```solidity
constructor() public
```


### createTokenVesting


**Dev notes:** _Create function for a new TokenVesting clone_

```solidity
function createTokenVesting(address __beneficiary, uint256 __start, uint256 __cliffDuration, uint256 __duration, uint256 __startPortfolioDeposits, bool __revocable, uint256 __firstReleasePercentage, uint256 __period, address __portfolio, address __owner) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| __beneficiary | address | address of the beneficiary to whom vested tokens are transferred |
| __start | uint256 | time (as Unix time) at which point vesting starts |
| __cliffDuration | uint256 | duration in seconds of the cliff in which tokens will begin to vest |
| __duration | uint256 | duration in seconds of the period in which the tokens will vest |
| __startPortfolioDeposits | uint256 | time (as Unix time) portfolio deposits start |
| __revocable | bool | whether the vesting is revocable or not |
| __firstReleasePercentage | uint256 | percentage to be released initially |
| __period | uint256 | length of claim period that allows one to withdraw in discrete periods. i.e. (60 x 60 x 24) x 30 will allow the beneficiary to claim every 30 days, 0 for no restrictions |
| __portfolio | address | address of portfolio |
| __owner | address |  |


### getClone


**Dev notes:** _Accessor method to get i-th clone_

```solidity
function getClone(uint256 index) external view returns (address)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| index | uint256 | clone index |



