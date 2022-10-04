// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title Mock contract to simulate Ava-Labs NativeMinter Precompile
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract NativeMinterMock {
    function mintNativeCoin(address _addr, uint256 _amount) external {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = payable(_addr).call{value: _amount}("");
        require(success, "Mint Failed");
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
