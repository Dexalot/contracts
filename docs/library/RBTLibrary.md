# RBTLibrary

**BokkyPooBah&#x27;s Red-Black Tree Library**

A Solidity Red-Black Tree binary search library to store and access a sorted
list of unsigned integer data. The Red-Black algorithm rebalances the binary
search tree, resulting in O(log n) insert, remove and search time (and ~gas).

**Dev notes:** _For more details please refer to the Github repo
[BokkyPooBahsRedBlackTreeLibrary](https://github.com/bokkypoobah/BokkyPooBahsRedBlackTreeLibrary).
The library was modified with code optimization as per a PR submitted by user nremond.
The variable names for function arguments are updated to start with an underscore char.
Documenention has been added._

## Types

### Node



```solidity
struct Node {
  uint256 parent;
  uint256 left;
  uint256 right;
  bool red;
}
```
### Tree



```solidity
struct Tree {
  uint256 root;
  mapping(uint256 => struct RBTLibrary.Node) nodes;
}
```



## Methods

### first

Returns the first node in the tree


```solidity
function first(struct RBTLibrary.Tree self) internal view returns (uint256 _key)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct RBTLibrary.Tree | stored tree from contract |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| _key | uint256 | key for a node |

### last

Returns the last node in the tree


```solidity
function last(struct RBTLibrary.Tree self) internal view returns (uint256 _key)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct RBTLibrary.Tree | stored tree from contract |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| _key | uint256 | key for a node |

### next

Returns the next node in the tree


```solidity
function next(struct RBTLibrary.Tree self, uint256 _target) internal view returns (uint256 _cursor)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct RBTLibrary.Tree | stored tree from contract |
| _target | uint256 | the node for which the next node is returned |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| _cursor | uint256 | the next node with respect to target node |

### prev

Returns the previous node in the tree


```solidity
function prev(struct RBTLibrary.Tree self, uint256 _target) internal view returns (uint256 cursor)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct RBTLibrary.Tree | stored tree from contract |
| _target | uint256 | the node for which the previous node is returned |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| cursor | uint256 | the previous node with respect to target node |

### exists

Checks if node with a key exists


```solidity
function exists(struct RBTLibrary.Tree self, uint256 _key) internal view returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct RBTLibrary.Tree | stored tree from contract |
| _key | uint256 | key for a node |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  the previous node with respect to target node |

### isEmpty

Checks if key is empty


```solidity
function isEmpty(uint256 _key) internal pure returns (bool)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _key | uint256 | key for a node |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | bool  returns true if key is empty |

### getEmpty

Returns the definition of empty


```solidity
function getEmpty() internal pure returns (uint256)
```


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | bool  returns the constant EMPTY |

### getNode

Returns the node struct for a key


```solidity
function getNode(struct RBTLibrary.Tree self, uint256 _key) internal view returns (uint256 _returnKey, uint256 _parent, uint256 _left, uint256 _right, bool _red)
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct RBTLibrary.Tree | stored tree from contract |
| _key | uint256 | key for a node |


#### returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| _returnKey | uint256 | key for the node being returned |
| _parent | uint256 | parent of the node being returned |
| _left | uint256 | left node for the node being returned |
| _right | uint256 | right node for the node being returned |
| _red | bool | red/black state (true/false) for the node being returned |

### insert

Inserts a new node to the tree with a key


```solidity
function insert(struct RBTLibrary.Tree self, uint256 _key) internal
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct RBTLibrary.Tree |  |
| _key | uint256 | key for the node being inserted |


### remove

Removes a new node from the tree with a key


```solidity
function remove(struct RBTLibrary.Tree self, uint256 _key) internal
```

#### parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| self | struct RBTLibrary.Tree | stored tree from contract |
| _key | uint256 | key for the node being removed |



