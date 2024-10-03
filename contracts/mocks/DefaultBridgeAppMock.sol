// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.25;

import "../bridgeApps/DefaultBridgeApp.sol";

contract DefaultBridgeAppMock is DefaultBridgeApp {
    function getOutboundNonce(uint32) external pure override returns (uint64) {
        return 0;
    }

    function setPortfolioBridge(address portfolioBridgeAddr) external virtual override {
        _setPortfolioBridge(portfolioBridgeAddr);
    }

    function recieveMessage(bytes32 blockchainID, bytes32 sourceContract, bytes memory payload) external {
        _recieveMessage(blockchainID, sourceContract, payload);
    }

    function getBridgeProvider() public pure virtual override returns (IPortfolioBridge.BridgeProvider) {}

    function _sendMessage(
        RemoteChain memory destination,
        bytes memory message,
        CrossChainMessageType msgType,
        address feeRefundAddress
    ) internal virtual override {}
}
