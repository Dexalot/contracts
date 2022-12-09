// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../library/Bytes32LinkedListLibrary.sol";

/**
 * @title Mock contract to test Bytes32LinkedListLibrary.sol
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract Bytes32LinkedListLibraryMock {
    using Bytes32LinkedListLibrary for Bytes32LinkedListLibrary.LinkedList;

    Bytes32LinkedListLibrary.LinkedList private list;

    function listExists() public view returns (bool) {
        return list.listExists();
    }

    function nodeExists(bytes32 _node) public view returns (bool) {
        return list.nodeExists(_node);
    }

    function sizeOf() public view returns (uint256) {
        return list.sizeOf();
    }

    function getNode(bytes32 _node) public view returns (bool, bytes32, bytes32) {
        return list.getNode(_node);
    }

    function getAdjacent(bytes32 _node, bool _direction) public view returns (bool, bytes32) {
        return list.getAdjacent(_node, _direction);
    }

    function insert(bytes32 _node, bytes32 _new, bool _direction) public returns (bool) {
        return list.insert(_node, _new, _direction);
    }

    function remove(bytes32 _node) public returns (bytes32) {
        return list.remove(_node);
    }

    function push(bytes32 _node, bool _direction) public {
        list.push(_node, _direction);
    }

    function pop(bool _direction) public returns (bytes32) {
        return list.pop(_direction);
    }
}
