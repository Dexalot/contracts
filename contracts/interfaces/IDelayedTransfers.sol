// SPDX-License-Identifier: BUSL-1.1
import "./IPortfolio.sol";
pragma solidity 0.8.17;

/**
 * @title Interface of DelayedTransfers
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IDelayedTransfers {
    function checkThresholds(IPortfolio.XFER calldata _xfer, uint32 _dstChainListOrgChainId) external returns (bool);

    function updateVolume(bytes32 _token, uint256 _amount) external;

    function executeDelayedTransfer(
        bytes32 _id
    ) external returns (IPortfolio.XFER calldata xfer, uint32 dstChainListOrgChainId);

    function setDelayThresholds(bytes32[] calldata _tokens, uint256[] calldata _thresholds) external;

    function setDelayPeriod(uint256 _period) external;

    function setEpochLength(uint256 _length) external;

    function setEpochVolumeCaps(bytes32[] calldata _tokens, uint256[] calldata _caps) external;
}
