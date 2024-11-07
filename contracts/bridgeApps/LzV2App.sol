// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";

import "./DefaultBridgeApp.sol";
import "../interfaces/IBridgeProvider.sol";
import "../interfaces/IBridgeAggregator.sol";
import "../interfaces/IPortfolioBridge.sol";

/**
 * @title LzV2App
 * @notice This contract sends and receives generic messages between different chains via LayerZero v2 Endpoints
 * @dev It is designed to be used in conjunction with the PortfolioBridge contract.
 */
contract LzV2App is Ownable, OApp, OAppOptionsType3, DefaultBridgeApp {
    // Default payload size for IPortfolio.XFER messages
    bytes private constant DEFAULT_PAYLOAD =
        "0x90f79bf6eb2c4f870365e785982e1f101e93b906000000000000000100000000414c4f543433313133000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000029a2241af62c00000000000000000000000000000000000000000000000000000000000065c5098c";

    // version
    bytes32 public constant VERSION = bytes32("1.0.1");

    constructor(address _endpoint, address _owner) OApp(_endpoint, _owner) {
        _transferOwnership(_owner);
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
     * @notice Get the bridge fee for a given chain ID in terms of the native token
     * @dev Defaults to the DEPOSIT message type
     * @param _chainID The chainlist chain ID to get a bridge fee for
     * @return The bridge fee in terms of the native token
     */
    function getBridgeFee(uint32 _chainID) external view override returns (uint256) {
        return getBridgeFee(_chainID, IBridgeProvider.CrossChainMessageType.DEPOSIT);
    }

    /**
     * @notice Get the bridge fee for a given chain ID and message type in terms of the native token
     * @param _chainID The chainlist chain ID to get a bridge fee for
     * @param _msgType The message type to get a bridge fee for
     * @return The bridge fee in terms of the native token
     */
    function getBridgeFee(uint32 _chainID, CrossChainMessageType _msgType) public view override returns (uint256) {
        RemoteChain memory destination = _verifyDestination(_chainID);
        uint32 dstEid = uint32(uint256(destination.blockchainID));
        return _quote(dstEid, DEFAULT_PAYLOAD, enforcedOptions[dstEid][uint16(_msgType)], false).nativeFee;
    }

    /**
     * @notice Get the bridge provider enum
     * @return The bridge provider enum
     */
    function getBridgeProvider() public pure virtual override returns (IPortfolioBridge.BridgeProvider) {
        return IPortfolioBridge.BridgeProvider.LZ;
    }

    /**
     * @notice Receives a message from a remote chain via the LZEndpointV2
     * @param _origin Details of the origin chain and sender
     * @param _payload Bytes payload of the message
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _payload,
        address, // Executor address as specified by the OApp.
        bytes calldata // Any extra data or options to trigger on receipt.
    ) internal override {
        _receiveMessage(bytes32(uint256(_origin.srcEid)), _origin.sender, _payload);
    }

    /**
     * @notice Send a message to a remote chain via the LZEndpointV2
     * @param _destination Details of the destination chain and contract
     * @param _message Bytes payload of the message
     * @param _msgType CrossChainMessageType
     * @param _feeRefundAddress Address to refund the bridge fee (if any)
     */
    function _sendMessage(
        RemoteChain memory _destination,
        bytes memory _message,
        CrossChainMessageType _msgType,
        address _feeRefundAddress
    ) internal override {
        uint32 dstEid = uint32(uint256(_destination.blockchainID));
        bytes memory options = enforcedOptions[dstEid][uint16(_msgType)];
        require(options.length > 0, "LZ-EONS-01");
        _lzSend(dstEid, _message, options, MessagingFee(msg.value, 0), _feeRefundAddress);
    }
}
