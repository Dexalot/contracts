// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

/**
 * @title Interface of GasStation
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IGasStation {
    function gasAmount() external view returns (uint256);

    function requestGas(address _to, uint256 _amount) external;

    function pause() external;

    function unpause() external;

    function setGasAmount(uint256 _gasAmount) external;

    function withdrawNative(uint256 _amount) external;

    receive() external payable;

    fallback() external payable;
}
