// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.25;

import "../interfaces/IBridgeProvider.sol";
import "../interfaces/IPortfolioBridge.sol";
import "../interfaces/IBridgeAggregator.sol";

/**
 * @title DefaultBridgeApp
 * @notice Default implementation of the IBridgeProvider interface
 */
abstract contract DefaultBridgeApp is IBridgeProvider {
    // maps blockchainID defined by the bridge type to remote contract details
    mapping(bytes32 => RemoteChain) public remoteBlockchains;
    // maps chainlist.org chainID to remote contract details
    mapping(uint32 => RemoteChain) public remoteChainIDs;
    address public portfolioBridge;

    event PortfolioBridgeUpdated(address portfolioBridgeAddr);
    event RemoteChainUpdated(uint32 chainID, bytes32 blockchainID, bytes32 remoteContract);

    /**
     * @notice Reverts if function sender is not portfolio bridge.
     */
    modifier onlyPortfolioBridge() {
        require(msg.sender == portfolioBridge, "DB-OPBA-01");
        _;
    }

    /**
     * @notice Get the bridge fee for a destination chain and message type
     * @return Default of zero fee
     */
    function getBridgeFee(uint32, CrossChainMessageType) external view virtual returns (uint256) {
        return 0;
    }

    /**
     * @notice Get the bridge fee for a destination chain
     * @return Default of zero fee
     */
    function getBridgeFee(uint32) external view virtual returns (uint256) {
        return 0;
    }

    /**
     * @notice Sends a message to a remote chain
     * @dev Only callable by the PortfolioBridge contract
     * @param _dstChainID Chain ID of the destination chain
     * @param _message Bytes payload of the message
     * @param _msgType CrossChainMessageType
     * @param _feeRefundAddress Address to refund the bridge fee (if any)
     */
    function sendMessage(
        uint32 _dstChainID,
        bytes memory _message,
        CrossChainMessageType _msgType,
        address _feeRefundAddress
    ) external payable onlyPortfolioBridge {
        RemoteChain memory destination = remoteChainIDs[_dstChainID];
        require(destination.chainID != 0, "DB-RCNS-01");
        _sendMessage(destination, _message, _msgType, _feeRefundAddress);
    }

    /**
     * @notice Set the remote chain details
     * @param _chainID The chainlist chain ID
     * @param _blockchainID The blockchain ID of the remote chain
     * @param _remoteContract The address of the remote contract in bytes32 format
     */
    function setRemoteChain(
        uint32 _chainID,
        bytes32 _blockchainID,
        bytes32 _remoteContract
    ) external onlyPortfolioBridge {
        RemoteChain memory remoteChain = RemoteChain({
            chainID: _chainID,
            blockchainID: _blockchainID,
            remoteContract: _remoteContract
        });
        remoteBlockchains[_blockchainID] = remoteChain;
        remoteChainIDs[_chainID] = remoteChain;
        emit RemoteChainUpdated(_chainID, _blockchainID, _remoteContract);
    }

    function setPortfolioBridge(address _portfolioBridgeAddr) external virtual;

    function getBridgeProvider() public pure virtual returns (IPortfolioBridge.BridgeProvider);

    /**
     * @notice Set the PortfolioBridge contract address
     * @dev Reverts if the address is zero
     * @param _portfolioBridgeAddr The address of the PortfolioBridge contract
     */
    function _setPortfolioBridge(address _portfolioBridgeAddr) internal {
        require(_portfolioBridgeAddr != address(0), "DB-PBNZ-01");
        portfolioBridge = _portfolioBridgeAddr;
        emit PortfolioBridgeUpdated(_portfolioBridgeAddr);
    }

    /**
     * @notice Internal function to process a message from a remote chain and call portfolio bridge
     * @param _blockchainID The blockchain ID of the source chain
     * @param _sourceContract The address of the source contract
     * @param _payload The message payload
     */
    function _receiveMessage(bytes32 _blockchainID, bytes32 _sourceContract, bytes memory _payload) internal {
        RemoteChain memory source = remoteBlockchains[_blockchainID];
        require(source.chainID != 0, "DB-RCNS-02");
        require(source.remoteContract == _sourceContract, "DB-RCNM-01");
        IBridgeAggregator(portfolioBridge).processPayload(getBridgeProvider(), source.chainID, _payload);
    }

    function _sendMessage(
        RemoteChain memory _destination,
        bytes memory _message,
        CrossChainMessageType _msgType,
        address _feeRefundAddress
    ) internal virtual;
}
