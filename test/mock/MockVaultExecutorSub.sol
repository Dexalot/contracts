// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MockVaultExecutorSub {
    event DispatchAssets(address recipient, bytes32[] tokens, uint256[] amounts);

    function dispatchAssets(address recipient, bytes32[] calldata tokens, uint256[] calldata amounts) external {
        emit DispatchAssets(recipient, tokens, amounts);
    }
}
