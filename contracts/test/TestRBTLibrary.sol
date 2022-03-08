// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

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
contract TestRBTLibrary {
    using RBTLibrary for RBTLibrary.Tree;

    RBTLibrary.Tree tree;
    mapping(uint => uint) values;

    event Log(string where, uint key, uint value);

    constructor() {
    }
    function root() public view returns (uint _key) {
        _key = tree.root;
    }
    function first() public view returns (uint _key) {
        _key = tree.first();
    }
    function last() public view returns (uint _key) {
        _key = tree.last();
    }
    function next(uint key) public view returns (uint _key) {
        _key = tree.next(key);
    }
    function prev(uint key) public view returns (uint _key) {
        _key = tree.prev(key);
    }
    function exists(uint key) public view returns (bool _exists) {
        _exists = tree.exists(key);
    }
    function isEmpty(uint key) public pure returns (bool) {
        return RBTLibrary.isEmpty(key);
    }
    function getEmpty() public pure returns (uint) {
        return RBTLibrary.getEmpty();
    }
    function getNode(uint _key) public view returns (uint key, uint parent, uint left, uint right, bool red, uint value) {
        (key, parent, left, right, red) = tree.getNode(_key);
        value = values[_key];
    }
    function insert(uint _key, uint _value) public {
        tree.insert(_key);
        values[_key] = _value;
        emit Log("insert", _key, _value);
    }
    function remove(uint _key) public {
        tree.remove(_key);
        emit Log("remove", _key, values[_key]);
        delete values[_key];
    }
}
