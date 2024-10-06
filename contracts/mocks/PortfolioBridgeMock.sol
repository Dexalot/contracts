// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import "../interfaces/IBridgeAggregator.sol";
import "../interfaces/IBridgeProvider.sol";

contract PortfolioBridgeMock is IBridgeAggregator {
    event ProcessPayload(IPortfolioBridge.BridgeProvider _bridge, uint32 _srcChainListOrgChainId, bytes _payload);

    IBridgeProvider public teleporterApp;

    constructor(address _teleporterApp) {
        teleporterApp = IBridgeProvider(_teleporterApp);
    }

    function setTeleporterApp(address _teleporterApp) external {
        teleporterApp = IBridgeProvider(_teleporterApp);
    }

    function processPayload(
        IPortfolioBridge.BridgeProvider _bridge,
        uint32 _srcChainListOrgChainId,
        bytes calldata _payload
    ) external override {
        emit ProcessPayload(_bridge, _srcChainListOrgChainId, _payload);
    }

    function sendMessage(uint32 chainID, bytes memory payload, IBridgeProvider.CrossChainMessageType msgType) external {
        teleporterApp.sendMessage(chainID, payload, msgType, address(this));
    }
}
