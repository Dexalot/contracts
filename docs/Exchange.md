# Exchange

**Abstract contract to be inherited in ExchangeMain and ExchangeSub**

Exchange is an administrative wrapper contract that provides different access levels
using [OpenZeppelin](https://www.openzeppelin.com) AccessControl roles.
Currently it has DEFAULT_ADMIN_ROLE and AUCTION_ADMIN_ROLE.

**Dev notes:** _Exchange is DEFAULT_ADMIN to all Portfolio implementation contracts and TradePairs contract.
Exchange is also the AuctionManager using AUCTION_ADMIN_ROLE.
Auction Admin Functions can only be invoked from the Exchange contracts.
All the functions pertaining to Auction can also be called directly in
TradePairs and Portfolio using DEFAULT_ADMIN_ROLE but not recommended because certain
actions require a synchronized update to both Portfolio and TradePairs contracts._


## Variables

### portfolio

```solidity
contract IPortfolio portfolio
```
### AUCTION_ADMIN_ROLE

```solidity
bytes32 AUCTION_ADMIN_ROLE
```

## Events

### PortfolioSet



```solidity
event PortfolioSet(contract IPortfolio _oldPortfolio, contract IPortfolio _newPortfolio)
```
### RoleUpdated



```solidity
event RoleUpdated(string name, string actionName, bytes32 updatedRole, address updatedAddress)
```

## Methods

### initialize

Initializer for upgradeable contract.

**Dev notes:** _Grants admin role to the deployer._

```solidity
function initialize() public virtual
```


### addAdmin

Adds Default Admin role to the address


```solidity
function addAdmin(address _address) public virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | address to add role to |


### removeAdmin

Removes Default Admin role from the address


```solidity
function removeAdmin(address _address) public virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | address to remove role from |


### isAdmin



```solidity
function isAdmin(address _address) public view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | address to check |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool    true if address has Default Admin role |

### addAuctionAdmin

Adds Auction Admin role to the address


```solidity
function addAuctionAdmin(address _address) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | address to add role to |


### removeAuctionAdmin

Removes Auction Admin role from the address


```solidity
function removeAuctionAdmin(address _address) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | address to remove role from |


### isAuctionAdmin



```solidity
function isAuctionAdmin(address _address) external view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | address to check |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  true if address has Auction Admin role |

### setPortfolio

Set portfolio address


```solidity
function setPortfolio(contract IPortfolio _portfolio) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _portfolio | contract IPortfolio | address of portfolio contract |


### getPortfolio



```solidity
function getPortfolio() external view returns (contract IPortfolio)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | contract IPortfolio | IPortfolio  portfolio contract |

### pausePortfolio

(Un)pause portfolio operations

**Dev notes:** _This also includes deposit/withdraw processes_

```solidity
function pausePortfolio(bool _pause) public
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pause | bool | true to pause, false to unpause |


### pauseForUpgrade

Implemented in the child contract, as the logic differs.


```solidity
function pauseForUpgrade(bool _pause) external virtual
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pause | bool | true to pause, false to unpause |


### fallback



```solidity
fallback() external
```


### stringToBytes32


**Dev notes:** _utility function to convert string to bytes32_

```solidity
function stringToBytes32(string _string) public pure returns (bytes32 result)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _string | string | string to convert |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| result | bytes32 | bytes32 representation of the string |

### bytes32ToString


**Dev notes:** _utility function to convert bytes32 to string_

```solidity
function bytes32ToString(bytes32 _bytes32) public pure returns (string)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytes32 | bytes32 | bytes32 to convert |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | string  string representation of the bytes32 |

### addTrustedContract

Adds trusted contract to portfolio

**Dev notes:** _Exchange needs to be DEFAULT_ADMIN on the Portfolio_

```solidity
function addTrustedContract(address _contract, string _name) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contract | address | address of trusted contract |
| _name | string | name of trusted contract |


### isTrustedContract


**Dev notes:** _Exchange needs to be DEFAULT_ADMIN on the Portfolio_

```solidity
function isTrustedContract(address _contract) external view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contract | address | address to check |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  true if contract is trusted |

### removeTrustedContract

Removes trusted contract from portfolio

**Dev notes:** _Exchange needs to be DEFAULT_ADMIN on the Portfolio_

```solidity
function removeTrustedContract(address _contract) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contract | address | address of trusted contract |


### addToken

Add new token to portfolio

**Dev notes:** _Exchange needs to be DEFAULT_ADMIN on the Portfolio_

```solidity
function addToken(bytes32 _symbol, address _tokenaddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode _mode) external
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _symbol | bytes32 | symbol of the token |
| _tokenaddress | address | address of the token |
| _srcChainId | uint32 | Source Chain id |
| _decimals | uint8 | decimals of the token |
| _mode | enum ITradePairs.AuctionMode | starting auction mode |



