// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import "../interfaces/IBridgeAggregator.sol";
import "../interfaces/IBridgeProvider.sol";
import "../interfaces/IPortfolioBridge.sol";
import "../interfaces/IPortfolio.sol";

contract SolPortfolioBridgeMock is IBridgeAggregator {
    event ProcessPayload(
        IPortfolioBridge.BridgeProvider _bridge,
        uint32 _srcChainListOrgChainId,
        IPortfolio.XFERSolana _xfer
    );

    IBridgeProvider public mockBridge;

    constructor(address _bridgeApp) {
        mockBridge = IBridgeProvider(_bridgeApp);
    }

    function setBridgeApp(address _bridgeApp) external {
        mockBridge = IBridgeProvider(_bridgeApp);
    }

    function unpackXFerSolanaMessage(bytes calldata _payload) private pure returns (IPortfolio.XFERSolana memory xfer) {
        bytes32[3] memory msgData = abi.decode(_payload, (bytes32[3]));
        uint256 slot0 = uint256(msgData[0]);
        IPortfolioBridge.XChainMsgType(uint8(slot0));
        slot0 >>= 8;
        xfer.transaction = IPortfolio.Tx(uint8(slot0));
        slot0 >>= 8;
        xfer.nonce = uint64(slot0);
        slot0 >>= 64;
        xfer.timestamp = uint32(slot0);
        xfer.customdata = bytes18(uint144(uint256(slot0) >> 32));
        xfer.trader = msgData[1];
        xfer.tokenAddress = msgData[2];
        xfer.quantity = uint64(bytes8(bytes32(_payload[96:104])));
    }

    function processPayload(
        IPortfolioBridge.BridgeProvider _bridge,
        uint32 _srcChainListOrgChainId,
        bytes calldata _payload
    ) external override {
        IPortfolio.XFERSolana memory _xfer = unpackXFerSolanaMessage(_payload);
        emit ProcessPayload(_bridge, _srcChainListOrgChainId, _xfer);
    }

    function setTrustedRemoteAddress(
        IPortfolioBridge.BridgeProvider _bridge,
        uint32 _chainListOrgChainId,
        bytes32 _dstChainIdBridgeAssigned,
        bytes32 _remoteAddress,
        bool _userPaysFee
    ) external {}

    function sendMessage(uint32 chainID, bytes memory payload, IBridgeProvider.CrossChainMessageType msgType) external {
        mockBridge.sendMessage(chainID, payload, msgType, address(this));
    }
}
