// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.25;

import "@teleporter/registry/TeleporterRegistryOwnableAppUpgradeable.sol";
import "@teleporter/ITeleporterMessenger.sol";

import "./DefaultBridgeApp.sol";

import "../interfaces/IPortfolioBridge.sol";
import "../interfaces/IBridgeAggregator.sol";
import "../interfaces/IBridgeProvider.sol";

/**
 * @title ICMApp
 * @notice This contract sends and receives generic messages between different chains via Avalanche's Inter-Chain Messaging (ICM)
 * @dev It is designed to be used in conjunction with the PortfolioBridge contract.
 */
contract ICMApp is TeleporterRegistryOwnableAppUpgradeable, DefaultBridgeApp {
    // Relayers allowed to execute cross-chain messages
    address[] public allowedRelayers;
    // Maximum gas limit for each message type
    mapping(CrossChainMessageType => uint256) public gasLimits;

    uint256[50] private __gap;

    event AddRelayer(address relayer);
    event ClearRelayers();
    event SetGasLimit(CrossChainMessageType msgType, uint256 gasLimit);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure virtual returns (bytes32) {
        return bytes32("1.0.3");
    }

    function initialize(
        address _teleporterRegistryAddress,
        uint256 _minTeleporterVersion,
        address _owner
    ) external initializer {
        __TeleporterRegistryOwnableApp_init(_teleporterRegistryAddress, _owner, _minTeleporterVersion);
    }

    /**
     * @notice Set the PortfolioBridge contract address
     * @dev Called on deployment
     * @param _portfolioBridgeAddr The address of the PortfolioBridge contract
     */
    function setPortfolioBridge(address _portfolioBridgeAddr) external override onlyOwner {
        _setPortfolioBridge(_portfolioBridgeAddr);
    }

    /**
     * @notice Add an allowed relayer address
     * @param _relayer The address of the relayer
     */
    function addRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "IC-ARNZ-01");
        allowedRelayers.push(_relayer);
        emit AddRelayer(_relayer);
    }

    /**
     * @notice Clear all allowed relayer addresses
     */
    function clearRelayers() external onlyOwner {
        delete allowedRelayers;
        emit ClearRelayers();
    }

    /**
     * @notice Set the max gas limit for a given message type
     * @param _msgType The cross chain message type
     * @param _gasLimit The max gas limit
     */
    function setGasLimit(CrossChainMessageType _msgType, uint256 _gasLimit) external onlyOwner {
        gasLimits[_msgType] = _gasLimit;
        emit SetGasLimit(_msgType, _gasLimit);
    }

    /**
     * @notice Get the bridge provider enum
     * @return The bridge provider enum
     */
    function getBridgeProvider() public pure override returns (IPortfolioBridge.BridgeProvider) {
        return IPortfolioBridge.BridgeProvider.ICM;
    }

    /**
     * @notice Receives a message from a remote chain via the ICMMessenger
     * @param _sourceBlockchainID Blockchain ID of the source chain
     * @param _originSenderAddress Address of the sender contract
     * @param _message Bytes payload of the message
     */
    function _receiveTeleporterMessage(
        bytes32 _sourceBlockchainID,
        address _originSenderAddress,
        bytes memory _message
    ) internal virtual override {
        _receiveMessage(_sourceBlockchainID, bytes32(uint256(uint160(_originSenderAddress))), _message);
    }

    /**
     * @notice Send a message to a remote chain
     * @dev ICM does not support native token fees so 0 fee is always used
     * @param _destination The remote chain details
     * @param _message The message payload
     * @param _msgType The cross chain message type
     */
    function _sendMessage(
        RemoteChain memory _destination,
        bytes memory _message,
        CrossChainMessageType _msgType,
        address
    ) internal override {
        uint256 gasLimit = gasLimits[_msgType];
        require(gasLimit != 0, "IC-GLNS-01");
        _sendTeleporterMessage(
            TeleporterMessageInput({
                destinationBlockchainID: _destination.blockchainID,
                destinationAddress: address(uint160(uint256(_destination.remoteContract))),
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: gasLimit,
                allowedRelayerAddresses: allowedRelayers,
                message: _message
            })
        );
    }
}
