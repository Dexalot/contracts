// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../library/RBTLibrary.sol";

// ----------------------------------------------------------------------------
// BokkyPooBah's Red-Black Tree Library v1.0-pre-release-a - Contract for testing
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
 * @title Mock contract to test RBTLibrary.sol
 */

contract RBTLibraryMock {
    using RBTLibrary for RBTLibrary.Tree;

    RBTLibrary.Tree private tree;
    mapping(uint256 => uint256) private values;

    event Log(string where, uint256 key, uint256 value);

    function root() public view returns (uint256 _key) {
        _key = tree.root;
    }

    function first() public view returns (uint256 _key) {
        _key = tree.first();
    }

    function last() public view returns (uint256 _key) {
        _key = tree.last();
    }

    function next(uint256 key) public view returns (uint256 _key) {
        _key = tree.next(key);
    }

    function prev(uint256 key) public view returns (uint256 _key) {
        _key = tree.prev(key);
    }

    function exists(uint256 key) public view returns (bool doesExist) {
        doesExist = tree.exists(key);
    }

    function isEmpty(uint256 key) public pure returns (bool) {
        return RBTLibrary.isEmpty(key);
    }

    function getEmpty() public pure returns (uint256) {
        return RBTLibrary.getEmpty();
    }

    function getNode(uint256 _key)
        public
        view
        returns (
            uint256 key,
            uint256 parent,
            uint256 left,
            uint256 right,
            bool red,
            uint256 value
        )
    {
        (key, parent, left, right, red) = tree.getNode(_key);
        value = values[_key];
    }

    function insert(uint256 _key, uint256 _value) public {
        tree.insert(_key);
        values[_key] = _value;
        emit Log("insert", _key, _value);
    }

    function remove(uint256 _key) public {
        tree.remove(_key);
        emit Log("remove", _key, values[_key]);
        delete values[_key];
    }
}
