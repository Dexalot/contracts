# PortfolioMinter

**Intermediate contract to mint native tokens via NativeTokenMinter precompile.**


**Dev notes:** _Only this contract is used to mint native tokens via NativeTokenMinter precompile._


## Variables

### VERSION

```solidity
bytes32 VERSION
```
### PAUSER_ROLE

```solidity
bytes32 PAUSER_ROLE
```
### MINTER_ROLE

```solidity
bytes32 MINTER_ROLE
```
### totalNativeMinted

```solidity
uint256 totalNativeMinted
```

## Events

### Mint



```solidity
event Mint(address to, uint256 amount)
```

## Methods

### initialize

Initializer for upgradeable contract.

**Dev notes:** _Grant admin and pauser role to the sender. Grant minter role to portfolio and set precompile address_

```solidity
function initialize(address _portfolio, address _nativeMinter) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _portfolio | address | Address of the portfolioSub |
| _nativeMinter | address | Address of the NativeMinter precompile |


### pause

Pauses minting

**Dev notes:** _Only pauser can pause_

```solidity
function pause() external
```


### unpause

Unpauses minting

**Dev notes:** _Only pauser can unpause_

```solidity
function unpause() external
```


### getNativeMinter



```solidity
function getNativeMinter() external view returns (address)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | address  Address of the NativeMinter precompile |

### mint

Mints native tokens by calling precompile

**Dev notes:** _Only minter (portfolio) can mint_

```solidity
function mint(address _to, uint256 _amount) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | Address to mint to |
| _amount | uint256 | Amount to mint |


### fallback



```solidity
fallback() external
```



