# Multicall2

**Multicall2 - Aggregate results from multiple read-only function calls**



## Types

### Call



```solidity
struct Call {
  address target;
  bytes callData;
}
```
### Result



```solidity
struct Result {
  bool success;
  bytes returnData;
}
```



## Methods

### aggregate



```solidity
function aggregate(struct Multicall2.Call[] calls) public returns (uint256 blockNumber, bytes[] returnData)
```


### blockAndAggregate



```solidity
function blockAndAggregate(struct Multicall2.Call[] calls) public returns (uint256 blockNumber, bytes32 blockHash, struct Multicall2.Result[] returnData)
```


### getBlockHash



```solidity
function getBlockHash(uint256 blockNumber) public view returns (bytes32 blockHash)
```


### getBlockNumber



```solidity
function getBlockNumber() public view returns (uint256 blockNumber)
```


### getCurrentBlockCoinbase



```solidity
function getCurrentBlockCoinbase() public view returns (address coinbase)
```


### getCurrentBlockDifficulty



```solidity
function getCurrentBlockDifficulty() public view returns (uint256 difficulty)
```


### getCurrentBlockGasLimit



```solidity
function getCurrentBlockGasLimit() public view returns (uint256 gaslimit)
```


### getCurrentBlockTimestamp



```solidity
function getCurrentBlockTimestamp() public view returns (uint256 timestamp)
```


### getEthBalance



```solidity
function getEthBalance(address addr) public view returns (uint256 balance)
```


### getLastBlockHash



```solidity
function getLastBlockHash() public view returns (bytes32 blockHash)
```


### tryAggregate



```solidity
function tryAggregate(bool requireSuccess, struct Multicall2.Call[] calls) public returns (struct Multicall2.Result[] returnData)
```


### tryBlockAndAggregate



```solidity
function tryBlockAndAggregate(bool requireSuccess, struct Multicall2.Call[] calls) public returns (uint256 blockNumber, bytes32 blockHash, struct Multicall2.Result[] returnData)
```



