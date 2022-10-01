# IPortfolio

**Interface of Portfolio**



## Types

### Tx



```solidity
enum Tx {
  WITHDRAW,
  DEPOSIT,
  EXECUTION,
  INCREASEAVAIL,
  DECREASEAVAIL,
  IXFERSENT,
  IXFERREC,
  RECOVER
}
```
### XFER



```solidity
struct XFER {
  uint64 nonce;
  enum IPortfolio.Tx transaction;
  address trader;
  bytes32 symbol;
  uint256 quantity;
  uint256 timestamp;
}
```
### TokenDetails



```solidity
struct TokenDetails {
  uint8 decimals;
  address tokenAddress;
  enum ITradePairs.AuctionMode auctionMode;
  uint32 srcChainId;
  bytes32 symbol;
  bytes32 symbolId;
}
```


## Events

### PortfolioUpdated



```solidity
event PortfolioUpdated(enum IPortfolio.Tx transaction, address wallet, bytes32 symbol, uint256 quantity, uint256 feeCharged, uint256 total, uint256 available)
```

## Methods

### pause



```solidity
function pause() external
```


### unpause



```solidity
function unpause() external
```


### pauseDeposit



```solidity
function pauseDeposit(bool _pause) external
```


### updateTransferFeeRate



```solidity
function updateTransferFeeRate(uint256 _rate, enum IPortfolio.Tx _rateType) external
```


### addToken



```solidity
function addToken(bytes32 _symbol, address _tokenaddress, uint32 _srcChainId, uint8 _decimals, enum ITradePairs.AuctionMode _mode) external
```


### removeToken



```solidity
function removeToken(bytes32 _symbol) external
```


### adjustAvailable



```solidity
function adjustAvailable(enum IPortfolio.Tx _transaction, address _trader, bytes32 _symbol, uint256 _amount) external
```


### addExecution



```solidity
function addExecution(enum ITradePairs.Side _makerSide, address _makerAddr, address _taker, bytes32 _baseSymbol, bytes32 _quoteSymbol, uint256 _baseAmount, uint256 _quoteAmount, uint256 _makerfeeCharged, uint256 _takerfeeCharged) external
```


### depositNative



```solidity
function depositNative(address payable _from, enum IPortfolioBridge.BridgeProvider _bridge) external payable
```


### withdrawNative



```solidity
function withdrawNative(address payable _to, uint256 _quantity) external
```


### depositToken



```solidity
function depositToken(address _from, bytes32 _symbol, uint256 _quantity, enum IPortfolioBridge.BridgeProvider _bridge) external
```


### withdrawToken



```solidity
function withdrawToken(address _to, bytes32 _symbol, uint256 _quantity, enum IPortfolioBridge.BridgeProvider _bridge) external
```


### depositTokenFromContract



```solidity
function depositTokenFromContract(address _from, bytes32 _symbol, uint256 _quantity) external
```


### addTrustedContract



```solidity
function addTrustedContract(address _contract, string _organization) external
```


### isTrustedContract



```solidity
function isTrustedContract(address _contract) external view returns (bool)
```


### removeTrustedContract



```solidity
function removeTrustedContract(address _contract) external
```


### setAuctionMode



```solidity
function setAuctionMode(bytes32 _symbol, enum ITradePairs.AuctionMode _mode) external
```


### processXFerPayload



```solidity
function processXFerPayload(address _trader, bytes32 _symbol, uint256 _quantity, enum IPortfolio.Tx _transaction) external
```


### getNative



```solidity
function getNative() external view returns (bytes32)
```


### getChainId



```solidity
function getChainId() external view returns (uint32)
```


### getTokenDetails



```solidity
function getTokenDetails(bytes32 _symbol) external view returns (struct IPortfolio.TokenDetails)
```


### lzForceResumeReceive



```solidity
function lzForceResumeReceive(uint16 _srcChainId, bytes _srcAddress) external
```


### lzRetryPayload



```solidity
function lzRetryPayload(uint16 _srcChainId, bytes _srcAddress, bytes _payload) external
```



