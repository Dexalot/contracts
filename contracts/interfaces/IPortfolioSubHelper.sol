// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

/**
 * @title Interface of RebateAccounts
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolioSubHelper {
    /**
     * @notice  Rates for fees.
     * @param   makerRate fee rate for a maker order for the trading pair
     * @param   takerRate fee rate for taker order for the trading pair
     */
    struct Rates {
        bytes32 tradePairId;
        uint8 makerRate;
        uint8 takerRate;
    }

    function getRates(
        address _makerAddr,
        address _takerAddr,
        bytes32 _tradePairId,
        uint256 _makerRate,
        uint256 _takerRate
    ) external view returns (uint256 maker, uint256 taker);

    function isAdminAccountForRates(address _account) external view returns (bool);

    struct Rebates {
        uint8 maker;
        uint8 taker;
    }
}
