// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

/**
 * @title Interface of ERC1271
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2023 Dexalot.

interface IERC1271 {
    function isValidSignature(bytes32 _hash, bytes memory _signature) external view returns (bytes4 magicValue);
}