// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

interface IOmniVaultExecutorSub {
    event GasTopup(uint256 timestamp, uint256 amount);
    event SwapFeesCollected(bytes32 indexed symbol, uint256[] swapIds, uint256[] fees);

    function dispatchAssets(address recipient, bytes32[] calldata tokens, uint256[] calldata amounts) external;
}
