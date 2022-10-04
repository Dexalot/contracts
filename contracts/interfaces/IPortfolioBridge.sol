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

    function executeDelayedTransfer(bytes32 _id) external;

    function setDelayThresholds(bytes32[] calldata _tokens, uint256[] calldata _thresholds) external;

    function setDelayPeriod(uint256 _period) external;

    function setEpochLength(uint256 _length) external;

    function setEpochVolumeCaps(bytes32[] calldata _tokens, uint256[] calldata _caps) external;

    function unpackMessage(bytes calldata _data)
        external
        pure
        returns (XChainMsgType _xchainMsgType, bytes memory msgdata);

    function getXFerMessage(bytes memory _data) external view returns (IPortfolio.XFER memory xfer);

    function enableBridgeProvider(BridgeProvider _bridge, bool _enable) external;

    function isBridgeProviderEnabled(BridgeProvider _bridge) external view returns (bool);

    function getDefaultBridgeProvider() external view returns (BridgeProvider);

    function addToken(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode
    ) external;

    function removeToken(bytes32 _symbol, uint32 _srcChainId) external;

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

    enum BridgeProvider {
        LZ,
        CELER
    }
}
