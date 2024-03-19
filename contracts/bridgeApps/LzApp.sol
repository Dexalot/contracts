// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "../interfaces/layerZero/ILayerZeroReceiver.sol";
import "../interfaces/layerZero/ILayerZeroUserApplicationConfig.sol";
import "../interfaces/layerZero/ILayerZeroEndpoint.sol";
import "../library/UtilsLibrary.sol";

/**
 * @title Abstract Layer Zero contract
 * @notice  It is extended by the PortfolioBridgeMain contract for Dexalot specific implementation
 * @dev  defaultLzRemoteChainId is the default destination chain. For PortfolioBridgeSub it is avalanche C-Chain
 * For other blockchains it is Dexalot Subnet
 */

abstract contract LzApp is AccessControlEnumerableUpgradeable, ILayerZeroReceiver, ILayerZeroUserApplicationConfig {
    ILayerZeroEndpoint internal lzEndpoint;
    //chainId ==> Remote contract address concatenated with the local contract address, 40 bytes
    mapping(uint16 => bytes) public lzTrustedRemoteLookup;
    mapping(uint16 => Destination) public remoteParams;

    uint16 internal defaultLzRemoteChainId; // Default remote chain id (LayerZero assigned chain id)

    // storage gap for upgradeability
    uint256[50] private __gap;

    event LzSetTrustedRemoteAddress(
        uint16 destinationLzChainId,
        bytes remoteAddress,
        uint32 chainListOrgChainId,
        uint256 gasForDestinationLzReceive,
        bool userPaysFee
    );

    /**
     * @notice  Sets the Layer Zero Endpoint address
     * @dev     Only admin can set the Layer Zero Endpoint address
     * @param   _endpoint  Address of the Layer Zero Endpoint
     */
    function setLzEndPoint(address _endpoint) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_endpoint != address(0), "LA-LIZA-01");
        lzEndpoint = ILayerZeroEndpoint(_endpoint);
    }

    /**
     * @notice  Receive message from Layer Zero
     * @dev     Implemented by the real application
     * @param   _srcChainId  Source chain id
     * @param   _srcAddress  Source contract address
     * @param   _nonce  Nonce received
     * @param   _payload  Payload received
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64 _nonce,
        bytes memory _payload
    ) external virtual override;

    /**
     * @notice  send a LayerZero message to the specified address at a LayerZero endpoint.
     * @param   _dstChainId the destination chain identifier
     * @param   _payload  a custom bytes payload to send to the destination contract
     * @param   _refundAddress  if the source transaction is cheaper than the amount of value passed, refund the
     * additional amount to this address
     * @return  uint256  Message fee
     */
    function lzSend(
        uint16 _dstChainId,
        bytes memory _payload,
        address payable _refundAddress
    ) internal virtual returns (uint256) {
        bytes memory trustedRemote = lzTrustedRemoteLookup[_dstChainId];
        require(trustedRemote.length != 0, "LA-DCNT-01");
        (uint256 nativeFee, bytes memory adapterParams) = lzEstimateFees(_dstChainId, _payload);
        if (_refundAddress != address(this)) {
            require(msg.value >= nativeFee, "LA-IUMF-01");
        }
        // solhint-disable-next-line check-send-result
        lzEndpoint.send{value: nativeFee}(
            _dstChainId, // destination LayerZero chainId
            trustedRemote, // trusted remote
            _payload, // bytes payload
            _refundAddress, // refund address
            address(0x0), // _zroPaymentAddress
            adapterParams
        );
        return nativeFee;
    }

    /**
     * @notice  Estimates message fees
     * @param   _dstChainId  Target chain id
     * @param   _payload  Message payload
     * @return  messageFee  Message fee
     * @return  adapterParams  Adapter parameters
     */
    function lzEstimateFees(
        uint16 _dstChainId,
        bytes memory _payload
    ) internal view returns (uint256 messageFee, bytes memory adapterParams) {
        // Dexalot sets a higher gasForDestinationLzReceive value for LayerZero in PortfolioBridgeMain extending LzApp
        // LayerZero needs v1 in adapterParams to specify a higher gas for the destination to receive transaction
        // For more details refer to LayerZero PingPong example at
        // https://github.com/LayerZero-Labs/solidity-examples/blob/main/contracts/examples/PingPong.sol
        uint16 version = 1;
        adapterParams = abi.encodePacked(version, remoteParams[_dstChainId].gasForDestination);
        (messageFee, ) = lzEndpoint.estimateFees(_dstChainId, address(this), _payload, false, adapterParams);
    }

    //---------------------------UserApplication config----------------------------------------

    /**
     * @dev     parameter for address is ignored as it is defaulted to the address of this contract
     * @param   _version  Version of the config
     * @param   _chainId  Chain id
     * @param   _configType  Config type
     * @return  bytes  Config details
     */
    function getConfig(
        uint16 _version,
        uint16 _chainId,
        address,
        uint256 _configType
    ) external view returns (bytes memory) {
        return lzEndpoint.getConfig(_version, _chainId, address(this), _configType);
    }

    /**
     * @notice  Sets generic config for LayerZero user Application
     * @param   _version  Version of the config
     * @param   _chainId  Chain id
     * @param   _configType  Config type
     * @param   _config  Config to set
     */
    function setConfig(
        uint16 _version,
        uint16 _chainId,
        uint256 _configType,
        bytes calldata _config
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        lzEndpoint.setConfig(_version, _chainId, _configType, _config);
    }

    /**
     * @notice  Sets send message version
     * @dev     Only admin can set the send message version
     * @param   _version  Version to set
     */
    function setSendVersion(uint16 _version) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        lzEndpoint.setSendVersion(_version);
    }

    /**
     * @notice  Sets receive message version
     * @dev     Only admin can set the receive message version
     * @param   _version  Version to set
     */
    function setReceiveVersion(uint16 _version) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        lzEndpoint.setReceiveVersion(_version);
    }

    /**
     * @notice  Force resumes the stuck bridge by destroying the message blocking it.
     * @dev     This action is destructive! Use this as the last resort!
     * Use this function directly only when portfolioBridge.lzDestroyAndRecoverFunds() fails
     * If this function is used directly, destroyed message's funds are processed in the originating chain
     * properly but they will not be processed in the target chain at all. The funds in storedPayload destroyed
     * have to be manually sent to the originator of the message.
     * For example, if the message is destroyed using this function the end state will be:
     * If sending from mainnet to subnet. Funds deposited/locked in the mainnet but they won't show in the subnet
     * If sending from subnet to mainnet. Funds are withdrawn from the subnet but they won't be deposited into
     * the user's wallet in the mainnet
     * `_srcAddress` is 40 bytes data with the remote contract address concatenated with
     * the local contract address via `abi.encodePacked(sourceAddress, localAddress)`
     * @param   _srcChainId  Source chain id
     * @param   _srcAddress  Remote contract address concatenated with the local contract address
     */
    function forceResumeReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress
    ) external virtual override(ILayerZeroUserApplicationConfig) onlyRole(DEFAULT_ADMIN_ROLE) {
        lzEndpoint.forceResumeReceive(_srcChainId, _srcAddress);
    }

    /**
     * @notice  Retries the stuck message in the bridge, if any
     * @dev     Only DEFAULT_ADMIN_ROLE can call this function
     * Reverts if there is no storedPayload in the bridge or the supplied payload doesn't match the storedPayload
     * `_srcAddress` is 40 bytes data with the remote contract address concatenated with
     * the local contract address via `abi.encodePacked(sourceAddress, localAddress)`
     * @param   _srcChainId  Source chain id
     * @param   _srcAddress  Remote contract address concatenated with the local contract address
     * @param   _payload  Payload to retry
     */
    function retryPayload(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        bytes calldata _payload
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        lzEndpoint.retryPayload(_srcChainId, _srcAddress, _payload);
    }

    //--------------------------- VIEW FUNCTIONS ----------------------------------------

    /**
     * @return  ILayerZeroEndpoint  Layer Zero Endpoint
     */
    function getLzEndPoint() external view returns (ILayerZeroEndpoint) {
        return lzEndpoint;
    }

    /**
     * @notice  Gets the Trusted Remote Address per given chainId
     * @param   _remoteChainId  Remote chain id
     * @return  bytes  Trusted Source Remote Address
     */
    function getTrustedRemoteAddress(uint16 _remoteChainId) external view returns (bytes memory) {
        bytes memory path = lzTrustedRemoteLookup[_remoteChainId];
        require(path.length != 0, "LA-DCNT-01");
        return UtilsLibrary.slice(path, 0, path.length - 20); // the last 20 bytes should be address(this)
    }

    /**
     * @dev     `_srcAddress` is 40 bytes data with the remote contract address concatenated with
     * the local contract address via `abi.encodePacked(sourceAddress, localAddress)`
     * @param   _srcChainId  Source chain id
     * @param   _srcAddress  Remote contract address concatenated with the local contract address
     * @return  bool  True if the bridge has stored payload, means it is stuck
     */
    function hasStoredPayload(uint16 _srcChainId, bytes calldata _srcAddress) external view returns (bool) {
        return lzEndpoint.hasStoredPayload(_srcChainId, _srcAddress);
    }

    /**
     * @return  bool  True if the bridge has stored payload with its default destination, means it is stuck
     */
    function hasStoredPayload() external view returns (bool) {
        return lzEndpoint.hasStoredPayload(defaultLzRemoteChainId, lzTrustedRemoteLookup[defaultLzRemoteChainId]);
    }

    /**
     * @dev  Get the inboundNonce of a lzApp from a source chain which could be EVM or non-EVM chain
     * @param  _srcChainId  the source chain identifier
     * @return  uint64  Inbound nonce
     */
    function getInboundNonce(uint16 _srcChainId) internal view returns (uint64) {
        return lzEndpoint.getInboundNonce(_srcChainId, lzTrustedRemoteLookup[_srcChainId]);
    }

    /**
     * @dev Get the outboundNonce of a lzApp for a destination chain which, consequently, is always an EVM
     * @param _dstChainId The destination chain identifier
     * @return  uint64  Outbound nonce
     */
    function getOutboundNonce(uint16 _dstChainId) internal view returns (uint64) {
        return lzEndpoint.getOutboundNonce(_dstChainId, address(this));
    }

    /**
     * @dev     `_srcAddress` is 40 bytes data with the remote contract address concatenated with
     * the local contract address via `abi.encodePacked(sourceAddress, localAddress)`
     * @param   _srcChainId  Source chain id
     * @param   _srcAddress  Remote contract address concatenated with the local contract address
     * @return  bool  True if the source address is trusted
     */
    function isLZTrustedRemote(uint16 _srcChainId, bytes calldata _srcAddress) external view returns (bool) {
        bytes memory trustedSource = lzTrustedRemoteLookup[_srcChainId];
        return keccak256(trustedSource) == keccak256(_srcAddress);
    }
}
