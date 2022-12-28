// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./IPortfolio.sol";
import "./ITradePairs.sol";

/**
 * @title Interface of PortfolioBridge
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolioBridge {
    function pause() external;

    function unpause() external;

    function sendXChainMessage(BridgeProvider _bridge, IPortfolio.XFER memory _xfer) external;

    function getXFerMessage(bytes calldata _data) external view returns (address, bytes32, uint256);

    function enableBridgeProvider(BridgeProvider _bridge, bool _enable) external;

    function isBridgeProviderEnabled(BridgeProvider _bridge) external view returns (bool);

    function getDefaultBridgeProvider() external view returns (BridgeProvider);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() external returns (bytes32);

    enum XChainMsgType {
        XFER
    }
    enum Direction {
        SENT,
        RECEIVED
    }

    event XChainXFerMessage(
        uint8 version,
        BridgeProvider indexed bridge,
        Direction indexed msgDirection,
        uint32 indexed remoteChainId,
        uint256 messageFee,
        IPortfolio.XFER xfer
    );

    // CELER Not used but keeping it to run tests for enabling/disabling bridge providers
    enum BridgeProvider {
        LZ,
        CELER
    }
}
