// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./IPortfolio.sol";
import "./ITradePairs.sol";
import "./IMainnetRFQ.sol";

/**
 * @title Interface of PortfolioBridge
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolioBridge {
    function pause() external;

    function unpause() external;

    function sendXChainMessage(
        uint32 _dstChainListOrgChainId,
        BridgeProvider _bridge,
        IPortfolio.XFER memory _xfer,
        address _userFeePayer
    ) external payable;

    function unpackXFerMessage(bytes calldata _data) external view returns (IPortfolio.XFER memory xfer);

    function enableBridgeProvider(BridgeProvider _bridge, bool _enable) external;

    function isBridgeProviderEnabled(BridgeProvider _bridge) external view returns (bool);

    function getDefaultBridgeProvider() external view returns (BridgeProvider);

    function getDefaultDestinationChain() external view returns (uint32);

    function getPortfolio() external view returns (IPortfolio);

    function getMainnetRfq() external view returns (IMainnetRFQ);

    function getTokenList() external view returns (bytes32[] memory);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() external returns (bytes32);

    function getBridgeFee(
        BridgeProvider _bridge,
        uint32 _dstChainListOrgChainId,
        bytes32 _symbol,
        uint256 _quantity
    ) external view returns (uint256 bridgeFee);

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
