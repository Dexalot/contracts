# DexalotToken

**Dexalot Token (ALOT) contract**






## Methods

### constructor



```solidity
constructor() public
```


### pause



```solidity
function pause() public
```


### unpause



```solidity
function unpause() public
```


### _beforeTokenTransfer


**Dev notes:** _Hook that is called before any transfer of tokens. This includes
minting and burning.

Calling conditions:

- when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
will be transferred to `to`.
- when `from` is zero, `amount` tokens will be minted for `to`.
- when `to` is zero, `amount` of ``from``'s tokens will be burned.
- `from` and `to` are never both zero.

To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks]._

```solidity
function _beforeTokenTransfer(address from, address to, uint256 amount) internal
```


### _afterTokenTransfer



```solidity
function _afterTokenTransfer(address from, address to, uint256 amount) internal
```


### _mint



```solidity
function _mint(address to, uint256 amount) internal
```


### _burn



```solidity
function _burn(address account, uint256 amount) internal
```



