// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./ITradePairs.sol";

/**
 * @title Interface of PortfolioBridgeSub
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolioBridgeSub {
    function addToken(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode
    ) external;

    function removeToken(bytes32 _symbol, uint32 _srcChainId) external;

    function executeDelayedTransfer(bytes32 _id) external;

    function setDelayThresholds(bytes32[] calldata _tokens, uint256[] calldata _thresholds) external;

    function setDelayPeriod(uint256 _period) external;

    function setEpochLength(uint256 _length) external;

    function setEpochVolumeCaps(bytes32[] calldata _tokens, uint256[] calldata _caps) external;
}
