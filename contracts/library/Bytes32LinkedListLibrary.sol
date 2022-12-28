// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * Title LinkedListLib
 * Author Darryl Morris (o0ragman0o) and Modular.network
 *
 * This utility library was forked from https://github.com/o0ragman0o/LibCLL
 * into the Modular-Network ethereum-libraries repo at https://github.com/Modular-Network/ethereum-libraries
 * It has been updated to add additional functionality and be more compatible with solidity 0.4.18
 * coding patterns.
 *
 * version 1.0.0
 * Copyright (c) 2017 Modular Inc.
 * The MIT License (MIT)
 * https://github.com/Modular-network/ethereum-libraries/blob/master/LICENSE
 *
 * The LinkedListLib provides functionality for implementing data indexing using
 * a circular linked list
 *
 * Modular provides smart contract services and security reviews for contract
 * deployments in addition to working on open source projects in the Ethereum
 * community. Our purpose is to test, document, and deploy reusable code onto the
 * blockchain and improve both security and usability. We also educate non-profits,
 * schools, and other community members about the application of blockchain
 * technology. For further information: modular.network
 *
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * @title Circular FIFO LinkedList library for bytes32 values.
 * @notice  Provides functionality for implementing data indexing using a circular linked list of bytes32 values.
 * @dev The original library was forked by Modular.network from
 * [github.com/o0ragman0o/LibCLL](https://github.com/o0ragman0o/LibCLL)
 * into the Modular-Network ethereum-libraries repo at
 * [github.com/Modular-Network/ethereum-libraries](https://github.com/Modular-Network/ethereum-libraries).
 * It has been updated to add additional functionality and be more compatible with solidity 0.4.18
 * coding patterns.
 * It has been further updated by Dexalot team to handle a FIFO LinkedList of bytes32 values and be more
 * compatible with solidity 0.8.x. Documentation has also been modified to align with project's style guide.
 */

library Bytes32LinkedListLibrary {
    bytes32 private constant NULL = "";
    bytes32 private constant HEAD = "";
    bool private constant PREV = false;
    bool private constant NEXT = true;

    struct LinkedList {
        mapping(bytes32 => mapping(bool => bytes32)) list;
    }

    /**
     * @dev   Returns true if the list exists
     * @param self stored linked list from contract
     */
    function listExists(LinkedList storage self) internal view returns (bool) {
        // if the head nodes previous or next pointers both point to itself, then there are no items in the list
        return self.list[HEAD][PREV] != HEAD || self.list[HEAD][NEXT] != HEAD;
    }

    /**
     * @dev    Returns true if the node exists
     * @param  self stored linked list from contract
     * @param  _node a node to search for
     */
    function nodeExists(LinkedList storage self, bytes32 _node) internal view returns (bool) {
        if (self.list[_node][PREV] == HEAD && self.list[_node][NEXT] == HEAD) {
            return self.list[HEAD][NEXT] == _node;
        } else {
            return true;
        }
    }

    /**
     * @dev    Returns the number of elements in the list
     * @param  self stored linked list from contract
     */
    function sizeOf(LinkedList storage self) internal view returns (uint256 numElements) {
        bool exists;
        bytes32 i;
        (exists, i) = getAdjacent(self, HEAD, NEXT);
        while (i != HEAD) {
            (exists, i) = getAdjacent(self, i, NEXT);
            numElements++;
        }
        return numElements;
    }

    /**
     * @dev    Returns the links of a node as a tuple
     * @param  self stored linked list from contract
     * @param  _node id of the node to get
     */
    function getNode(LinkedList storage self, bytes32 _node) internal view returns (bool, bytes32, bytes32) {
        if (!nodeExists(self, _node)) {
            return (false, "", "");
        } else {
            return (true, self.list[_node][PREV], self.list[_node][NEXT]);
        }
    }

    /**
     * @dev Returns the link of a node `_node` in direction `_direction`.
     * @param self stored linked list from contract
     * @param _node id of the node to step from
     * @param _direction direction to step in
     */
    function getAdjacent(
        LinkedList storage self,
        bytes32 _node,
        bool _direction
    ) internal view returns (bool, bytes32) {
        if (!nodeExists(self, _node)) {
            return (false, "");
        } else {
            return (true, self.list[_node][_direction]);
        }
    }

    /**
     * @dev Creates a bidirectional link between two nodes on direction `_direction`
     * @param self stored linked list from contract
     * @param _node first node for linking
     * @param _link  node to link to in the _direction
     */
    function createLink(LinkedList storage self, bytes32 _node, bytes32 _link, bool _direction) internal {
        self.list[_link][!_direction] = _node;
        self.list[_node][_direction] = _link;
    }

    /**
     * @dev Inserts node `_new` beside existing node `_node` in direction `_direction`.
     * @param self stored linked list from contract
     * @param _node existing node
     * @param _new  new node to insert
     * @param _direction direction to insert node in
     */
    function insert(LinkedList storage self, bytes32 _node, bytes32 _new, bool _direction) internal returns (bool) {
        if (!nodeExists(self, _new) && nodeExists(self, _node)) {
            bytes32 c = self.list[_node][_direction];
            createLink(self, _node, _new, _direction);
            createLink(self, _new, c, _direction);
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Removes an entry from the linked list
     * @param self stored linked list from contract
     * @param _node node to remove from the list
     */
    function remove(LinkedList storage self, bytes32 _node) internal returns (bytes32) {
        if ((_node == NULL) || (!nodeExists(self, _node))) {
            return "";
        }
        createLink(self, self.list[_node][PREV], self.list[_node][NEXT], NEXT);
        delete self.list[_node][PREV];
        delete self.list[_node][NEXT];
        return _node;
    }

    /**
     * @dev Pushes an entry to the head of the linked list
     * @param self stored linked list from contract
     * @param _node new entry to push to the head
     * @param _direction push to the head (NEXT) or tail (PREV)
     */
    function push(LinkedList storage self, bytes32 _node, bool _direction) internal {
        insert(self, HEAD, _node, _direction);
    }

    /**
     * @dev Pops the first entry from the linked list
     * @param self stored linked list from contract
     * @param _direction pop from the head (NEXT) or the tail (PREV)
     */
    function pop(LinkedList storage self, bool _direction) internal returns (bytes32) {
        bool exists;
        bytes32 adj;

        (exists, adj) = getAdjacent(self, HEAD, _direction);

        return remove(self, adj);
    }
}
