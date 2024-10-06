// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.25;

interface IBridgeProvider {
    function sendMessage(
        uint32 dstChainID,
        bytes memory message,
        CrossChainMessageType msgType,
        address feeRefundAddress
    ) external payable;

    function setRemoteChain(uint32 chainID, bytes32 blockchainID, bytes32 remoteContract) external;

    // defaults to Deposit type
    function getBridgeFee(uint32 dstChainID) external view returns (uint256);

    function getBridgeFee(uint32 dstChainID, CrossChainMessageType msgType) external view returns (uint256);

    struct RemoteChain {
        uint32 chainID;
        bytes32 blockchainID;
        bytes32 remoteContract;
    }

    enum CrossChainMessageType {
        WITHDRAW,
        DEPOSIT,
        CCTRADE
    }
}
