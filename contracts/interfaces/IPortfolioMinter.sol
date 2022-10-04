// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

/**
 * @title Interface of PortfolioMinter
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolioMinter {
    function pause() external;

    function unpause() external;

    function mint(address _to, uint256 _amount) external;

    receive() external payable;

    fallback() external payable;
}
