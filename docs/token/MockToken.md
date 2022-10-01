# MockToken

**Mock ERC20 Token contract used for testing**




## Variables

### VERSION

```solidity
bytes32 VERSION
```
### MINTER_ROLE

```solidity
bytes32 MINTER_ROLE
```


## Methods

### constructor



```solidity
constructor(string _name, string _symbol, uint8 _decimals) public
```


### decimals


**Dev notes:** _Returns the number of decimals used to get its user representation.
For example, if `decimals` equals `2`, a balance of `505` tokens should
be displayed to a user as `5.05` (`505 / 10 ** 2`).

Tokens usually opt for a value of 18, imitating the relationship between
Ether and Wei. This is the value {ERC20} uses, unless this function is
overridden;

NOTE: This information is only used for _display_ purposes: it in
no way affects any of the arithmetic of the contract, including
{IERC20-balanceOf} and {IERC20-transfer}._

```solidity
function decimals() public view returns (uint8)
```


### addAdmin



```solidity
function addAdmin(address _address) public
```


### removeAdmin



```solidity
function removeAdmin(address _address) public
```


### isAdmin



```solidity
function isAdmin(address _address) public view returns (bool)
```


### addMinter



```solidity
function addMinter(address _address) public
```


### removeMinter



```solidity
function removeMinter(address _address) public
```


### mint



```solidity
function mint(address _owner, uint256 _quantity) public
```



