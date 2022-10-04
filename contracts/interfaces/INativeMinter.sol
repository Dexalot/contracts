// (c) 2022-2023, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title Interface of NativeMinter
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface NativeMinterInterface {
    // Set `addr` to have the admin role over the minter list
    function setAdmin(address _addr) external;

    // Set `addr` to be enabled on the minter list
    function setEnabled(address _addr) external;

    // Set `addr` to have no role over the minter list
    function setNone(address _addr) external;

    // Read the status of `_addr`
    function readAllowList(address _addr) external view returns (uint256);

    // Mint `_amount` number of native coins and send to `_addr`
    function mintNativeCoin(address _addr, uint256 _amount) external;
}
