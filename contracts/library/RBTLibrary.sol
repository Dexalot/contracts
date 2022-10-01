// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

// ----------------------------------------------------------------------------
// BokkyPooBah's Red-Black Tree Library v1.0-pre-release-a
//
// A Solidity Red-Black Tree binary search library to store and access a sorted
// list of unsigned integer data. The Red-Black algorithm rebalances the binary
// search tree, resulting in O(log n) insert, remove and search time (and ~gas)
//
// https://github.com/bokkypoobah/BokkyPooBahsRedBlackTreeLibrary
//
//
// Enjoy. (c) BokkyPooBah / Bok Consulting Pty Ltd 2020. The MIT Licence.
// ----------------------------------------------------------------------------

/**
 * @title BokkyPooBah's Red-Black Tree Library
 * @notice A Solidity Red-Black Tree binary search library to store and access a sorted
 * list of unsigned integer data. The Red-Black algorithm rebalances the binary
 * search tree, resulting in O(log n) insert, remove and search time (and ~gas).
 * @dev For more details please refer to the Github repo
 * [BokkyPooBahsRedBlackTreeLibrary](https://github.com/bokkypoobah/BokkyPooBahsRedBlackTreeLibrary).
 * The library was modified with code optimization as per a PR submitted by user nremond.
 * The variable names for function arguments are updated to start with an underscore char.
 * Documenention has been added.
 */

library RBTLibrary {
    // struct that represent a node in the tree
    struct Node {
        uint256 parent;
        uint256 left;
        uint256 right;
        bool red;
    }

    // struct to represent a tree of nodes
    struct Tree {
        uint256 root;
        mapping(uint256 => Node) nodes;
    }

    uint256 private constant EMPTY = 0;

    /**
     * @notice  Returns the first node in the tree
     * @param   self stored tree from contract
     * @return  _key  key for a node
     */
    function first(Tree storage self) internal view returns (uint256 _key) {
        _key = self.root;
        if (_key != EMPTY) {
            while (self.nodes[_key].left != EMPTY) {
                _key = self.nodes[_key].left;
            }
        }
    }

    /**
     * @notice  Returns the last node in the tree
     * @param   self stored tree from contract
     * @return  _key  key for a node
     */
    function last(Tree storage self) internal view returns (uint256 _key) {
        _key = self.root;
        if (_key != EMPTY) {
            while (self.nodes[_key].right != EMPTY) {
                _key = self.nodes[_key].right;
            }
        }
    }

    /**
     * @notice  Returns the next node in the tree
     * @param   self stored tree from contract
     * @param   _target  the node for which the next node is returned
     * @return  _cursor  the next node with respect to target node
     */
    function next(Tree storage self, uint256 _target) internal view returns (uint256 _cursor) {
        require(_target != EMPTY, "R-TIEM-01");
        if (self.nodes[_target].right != EMPTY) {
            _cursor = treeMinimum(self, self.nodes[_target].right);
        } else {
            _cursor = self.nodes[_target].parent;
            while (_cursor != EMPTY && _target == self.nodes[_cursor].right) {
                _target = _cursor;
                _cursor = self.nodes[_cursor].parent;
            }
        }
    }

    /**
     * @notice  Returns the previous node in the tree
     * @param   self stored tree from contract
     * @param   _target  the node for which the previous node is returned
     * @return  cursor  the previous node with respect to target node
     */
    function prev(Tree storage self, uint256 _target) internal view returns (uint256 cursor) {
        require(_target != EMPTY, "R-TIEM-02");
        if (self.nodes[_target].left != EMPTY) {
            cursor = treeMaximum(self, self.nodes[_target].left);
        } else {
            cursor = self.nodes[_target].parent;
            while (cursor != EMPTY && _target == self.nodes[cursor].left) {
                _target = cursor;
                cursor = self.nodes[cursor].parent;
            }
        }
    }

    /**
     * @notice  Checks if node with a key exists
     * @param   self stored tree from contract
     * @param   _key   key for a node
     * @return  bool  the previous node with respect to target node
     */
    function exists(Tree storage self, uint256 _key) internal view returns (bool) {
        return (_key != EMPTY) && ((_key == self.root) || (self.nodes[_key].parent != EMPTY));
    }

    /**
     * @notice  Checks if key is empty
     * @param   _key   key for a node
     * @return  bool  returns true if key is empty
     */
    function isEmpty(uint256 _key) internal pure returns (bool) {
        return _key == EMPTY;
    }

    /**
     * @notice  Returns the definition of empty
     * @return  bool  returns the constant EMPTY
     */
    function getEmpty() internal pure returns (uint256) {
        return EMPTY;
    }

    /**
     * @notice  Returns the node struct for a key
     * @param   self stored tree from contract
     * @param   _key   key for a node
     * @return  _returnKey  key for the node being returned
     * @return  _parent  parent of the node being returned
     * @return  _left  left node for the node being returned
     * @return  _right  right node for the node being returned
     * @return  _red  red/black state (true/false) for the node being returned
     */
    function getNode(Tree storage self, uint256 _key)
        internal
        view
        returns (
            uint256 _returnKey,
            uint256 _parent,
            uint256 _left,
            uint256 _right,
            bool _red
        )
    {
        require(exists(self, _key), "R-KDNE-01");
        return (_key, self.nodes[_key].parent, self.nodes[_key].left, self.nodes[_key].right, self.nodes[_key].red);
    }

    /**
     * @notice  Inserts a new node to the tree with a key
     * @param   _key  key for the node being inserted
     */
    function insert(Tree storage self, uint256 _key) internal {
        require(_key != EMPTY, "R-KIEM-01");
        require(!exists(self, _key), "R-KEXI-01");
        uint256 cursor = EMPTY;
        uint256 probe = self.root;
        while (probe != EMPTY) {
            cursor = probe;
            if (_key < probe) {
                probe = self.nodes[probe].left;
            } else {
                probe = self.nodes[probe].right;
            }
        }
        self.nodes[_key] = Node({parent: cursor, left: EMPTY, right: EMPTY, red: true});
        if (cursor == EMPTY) {
            self.root = _key;
        } else if (_key < cursor) {
            self.nodes[cursor].left = _key;
        } else {
            self.nodes[cursor].right = _key;
        }
        insertFixup(self, _key);
    }

    /**
     * @notice  Removes a new node from the tree with a key
     * @param   self stored tree from contract
     * @param   _key  key for the node being removed
     */
    function remove(Tree storage self, uint256 _key) internal {
        require(_key != EMPTY, "R-KIEM-02");
        require(exists(self, _key), "R-KDNE-02");
        uint256 probe;
        uint256 cursor;
        if (self.nodes[_key].left == EMPTY || self.nodes[_key].right == EMPTY) {
            cursor = _key;
        } else {
            cursor = self.nodes[_key].right;
            while (self.nodes[cursor].left != EMPTY) {
                cursor = self.nodes[cursor].left;
            }
        }
        if (self.nodes[cursor].left != EMPTY) {
            probe = self.nodes[cursor].left;
        } else {
            probe = self.nodes[cursor].right;
        }
        uint256 yParent = self.nodes[cursor].parent;
        self.nodes[probe].parent = yParent;
        if (yParent != EMPTY) {
            if (cursor == self.nodes[yParent].left) {
                self.nodes[yParent].left = probe;
            } else {
                self.nodes[yParent].right = probe;
            }
        } else {
            self.root = probe;
        }
        bool doFixup = !self.nodes[cursor].red;
        if (cursor != _key) {
            replaceParent(self, cursor, _key);
            self.nodes[cursor].left = self.nodes[_key].left;
            self.nodes[self.nodes[cursor].left].parent = cursor;
            self.nodes[cursor].right = self.nodes[_key].right;
            self.nodes[self.nodes[cursor].right].parent = cursor;
            self.nodes[cursor].red = self.nodes[_key].red;
            (cursor, _key) = (_key, cursor);
        }
        if (doFixup) {
            removeFixup(self, probe);
        }
        delete self.nodes[cursor];
    }

    /**
     * @notice  Returns the key for the minimum node in the tree
     * @param   self stored tree from contract
     * @return  _key  key of the node being returned
     */
    function treeMinimum(Tree storage self, uint256 _key) private view returns (uint256) {
        while (self.nodes[_key].left != EMPTY) {
            _key = self.nodes[_key].left;
        }
        return _key;
    }

    /**
     * @notice  Returns the key for the maximum node in the tree
     * @param   self stored tree from contract
     * @return  _key  key of the node being returned
     */
    function treeMaximum(Tree storage self, uint256 _key) private view returns (uint256) {
        while (self.nodes[_key].right != EMPTY) {
            _key = self.nodes[_key].right;
        }
        return _key;
    }

    /**
     * @notice Do a left rotation for the key in the tree
     * @param   self stored tree from contract
     * @param  _key  key of the node being returned
     */
    function rotateLeft(Tree storage self, uint256 _key) private {
        uint256 cursor = self.nodes[_key].right;
        uint256 keyParent = self.nodes[_key].parent;
        uint256 cursorLeft = self.nodes[cursor].left;
        self.nodes[_key].right = cursorLeft;
        if (cursorLeft != EMPTY) {
            self.nodes[cursorLeft].parent = _key;
        }
        self.nodes[cursor].parent = keyParent;
        if (keyParent == EMPTY) {
            self.root = cursor;
        } else if (_key == self.nodes[keyParent].left) {
            self.nodes[keyParent].left = cursor;
        } else {
            self.nodes[keyParent].right = cursor;
        }
        self.nodes[cursor].left = _key;
        self.nodes[_key].parent = cursor;
    }

    /**
     * @notice Do a right rotation for the key in the tree
     * @param   self stored tree from contract
     * @param  _key  key of the node being returned
     */
    function rotateRight(Tree storage self, uint256 _key) private {
        uint256 cursor = self.nodes[_key].left;
        uint256 keyParent = self.nodes[_key].parent;
        uint256 cursorRight = self.nodes[cursor].right;
        self.nodes[_key].left = cursorRight;
        if (cursorRight != EMPTY) {
            self.nodes[cursorRight].parent = _key;
        }
        self.nodes[cursor].parent = keyParent;
        if (keyParent == EMPTY) {
            self.root = cursor;
        } else if (_key == self.nodes[keyParent].right) {
            self.nodes[keyParent].right = cursor;
        } else {
            self.nodes[keyParent].left = cursor;
        }
        self.nodes[cursor].right = _key;
        self.nodes[_key].parent = cursor;
    }

    /**
     * @notice Insert fixup during insertion of a node with the key in the tree
     * @param   self stored tree from contract
     * @param  _key  key of the node being inserted
     */
    function insertFixup(Tree storage self, uint256 _key) private {
        uint256 cursor;
        while (_key != self.root && self.nodes[self.nodes[_key].parent].red) {
            uint256 keyParent = self.nodes[_key].parent;
            if (keyParent == self.nodes[self.nodes[keyParent].parent].left) {
                cursor = self.nodes[self.nodes[keyParent].parent].right;
                if (self.nodes[cursor].red) {
                    self.nodes[keyParent].red = false;
                    self.nodes[cursor].red = false;
                    self.nodes[self.nodes[keyParent].parent].red = true;
                    _key = self.nodes[keyParent].parent;
                } else {
                    if (_key == self.nodes[keyParent].right) {
                        _key = keyParent;
                        rotateLeft(self, _key);
                    }
                    keyParent = self.nodes[_key].parent;
                    self.nodes[keyParent].red = false;
                    self.nodes[self.nodes[keyParent].parent].red = true;
                    rotateRight(self, self.nodes[keyParent].parent);
                }
            } else {
                cursor = self.nodes[self.nodes[keyParent].parent].left;
                if (self.nodes[cursor].red) {
                    self.nodes[keyParent].red = false;
                    self.nodes[cursor].red = false;
                    self.nodes[self.nodes[keyParent].parent].red = true;
                    _key = self.nodes[keyParent].parent;
                } else {
                    if (_key == self.nodes[keyParent].left) {
                        _key = keyParent;
                        rotateRight(self, _key);
                    }
                    keyParent = self.nodes[_key].parent;
                    self.nodes[keyParent].red = false;
                    self.nodes[self.nodes[keyParent].parent].red = true;
                    rotateLeft(self, self.nodes[keyParent].parent);
                }
            }
        }
        self.nodes[self.root].red = false;
    }

    /**
     * @notice  Replaces two parent nodes in the tree
     * @param   a  node in the tree
     * @param   b  mode in the tree
     */
    function replaceParent(
        Tree storage self,
        uint256 a,
        uint256 b
    ) private {
        uint256 bParent = self.nodes[b].parent;
        self.nodes[a].parent = bParent;
        if (bParent == EMPTY) {
            self.root = a;
        } else {
            if (b == self.nodes[bParent].left) {
                self.nodes[bParent].left = a;
            } else {
                self.nodes[bParent].right = a;
            }
        }
    }

    /**
     * @notice Remove fixup during removal of a node with the key in the tree
     * @param   self stored tree from contract
     * @param  _key  key of the node being removed
     */
    function removeFixup(Tree storage self, uint256 _key) private {
        uint256 cursor;
        while (_key != self.root && !self.nodes[_key].red) {
            uint256 keyParent = self.nodes[_key].parent;
            if (_key == self.nodes[keyParent].left) {
                cursor = self.nodes[keyParent].right;
                if (self.nodes[cursor].red) {
                    self.nodes[cursor].red = false;
                    self.nodes[keyParent].red = true;
                    rotateLeft(self, keyParent);
                    cursor = self.nodes[keyParent].right;
                }
                if (!self.nodes[self.nodes[cursor].left].red && !self.nodes[self.nodes[cursor].right].red) {
                    self.nodes[cursor].red = true;
                    _key = keyParent;
                } else {
                    if (!self.nodes[self.nodes[cursor].right].red) {
                        self.nodes[self.nodes[cursor].left].red = false;
                        self.nodes[cursor].red = true;
                        rotateRight(self, cursor);
                        cursor = self.nodes[keyParent].right;
                    }
                    self.nodes[cursor].red = self.nodes[keyParent].red;
                    self.nodes[keyParent].red = false;
                    self.nodes[self.nodes[cursor].right].red = false;
                    rotateLeft(self, keyParent);
                    _key = self.root;
                }
            } else {
                cursor = self.nodes[keyParent].left;
                if (self.nodes[cursor].red) {
                    self.nodes[cursor].red = false;
                    self.nodes[keyParent].red = true;
                    rotateRight(self, keyParent);
                    cursor = self.nodes[keyParent].left;
                }
                if (!self.nodes[self.nodes[cursor].right].red && !self.nodes[self.nodes[cursor].left].red) {
                    self.nodes[cursor].red = true;
                    _key = keyParent;
                } else {
                    if (!self.nodes[self.nodes[cursor].left].red) {
                        self.nodes[self.nodes[cursor].right].red = false;
                        self.nodes[cursor].red = true;
                        rotateLeft(self, cursor);
                        cursor = self.nodes[keyParent].left;
                    }
                    self.nodes[cursor].red = self.nodes[keyParent].red;
                    self.nodes[keyParent].red = false;
                    self.nodes[self.nodes[cursor].left].red = false;
                    rotateRight(self, keyParent);
                    _key = self.root;
                }
            }
        }
        self.nodes[_key].red = false;
    }
}
// ----------------------------------------------------------------------------
// End - BokkyPooBah's Red-Black Tree Library
// ----------------------------------------------------------------------------
