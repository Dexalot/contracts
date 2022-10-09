// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "../interfaces/layerZero/ILayerZeroReceiver.sol";
import "../interfaces/layerZero/ILayerZeroUserApplicationConfig.sol";
import "../interfaces/layerZero/ILayerZeroEndpoint.sol";
import "../library/UtilsLibrary.sol";

/**
 * @title Generic Layer Zero Application Implementation
 * @dev https://github.com/LayerZero-Labs/solidity-examples/blob/main/contracts/lzApp/LzApp.sol
 */

abstract contract LzApp is AccessControlEnumerableUpgradeable, ILayerZeroReceiver, ILayerZeroUserApplicationConfig {
    ILayerZeroEndpoint internal lzEndpoint;

    uint64 internal lzOutNonce;
    uint64 internal lzInNonce;

    //chainId ==> Remote contract address concatenated with the local contract address, 40 bytes
    mapping(uint16 => bytes) public lzTrustedRemoteLookup;

    event LzSetTrustedRemote(uint16 remoteChainId, bytes path);
    event LzSetTrustedRemoteAddress(uint16 remoteChainId, bytes remoteAddress);
    uint16 internal lzRemoteChainId;
    uint256 public gasForDestinationLzReceive;

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
     * @return  ILayerZeroEndpoint  Layer Zero Endpoint
     */
    function getLzEndPoint() external view returns (ILayerZeroEndpoint) {
        return lzEndpoint;
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
     * @notice  Sends message
     * @param   _payload  Payload to send
     * @param   _refundAddress  Refund address
     * @return  uint256  Message fee
     */
    function lzSend(bytes memory _payload, address payable _refundAddress) internal virtual returns (uint256) {
        bytes memory trustedRemote = lzTrustedRemoteLookup[lzRemoteChainId];
        require(trustedRemote.length != 0, "LA-DCNT-01");
        (uint256 messageFee, bytes memory adapterParams) = lzEstimateFees(_payload);
        // solhint-disable-next-line check-send-result
        lzEndpoint.send{value: messageFee}(
            lzRemoteChainId, // destination LayerZero chainId
            trustedRemote, // trusted remote
            _payload, // bytes payload
            _refundAddress, // refund address
            address(0x0), // _zroPaymentAddress
            adapterParams
        );
        return messageFee;
    }

    /**
     * @notice  Estimates message fees
     * @param   _payload  Message payload
     * @return  messageFee  Message fee
     * @return  adapterParams  Adapter parameters
     */
    function lzEstimateFees(bytes memory _payload)
        internal
        view
        returns (uint256 messageFee, bytes memory adapterParams)
    {
        uint16 version = 1;
        adapterParams = abi.encodePacked(version, gasForDestinationLzReceive);
        (messageFee, ) = lzEndpoint.estimateFees(lzRemoteChainId, address(this), _payload, false, adapterParams);
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
     * @notice  Set the trusted path for the cross-chain communication
     * @dev     `_path` is 40 bytes data with the remote contract address concatenated with
     * the local contract address via `abi.encodePacked(sourceAddress, localAddress)`
     * @param   _srcChainId Source(Remote) chain id
     * @param   _path  Remote contract address concatenated with the local contract address
     *
     */
    function setLZTrustedRemote(uint16 _srcChainId, bytes calldata _path) external onlyRole(DEFAULT_ADMIN_ROLE) {
        lzTrustedRemoteLookup[_srcChainId] = _path;
        lzRemoteChainId = _srcChainId;
        emit LzSetTrustedRemote(_srcChainId, _path);
    }

    /**
     * @notice  Sets trusted remote address for the cross-chain communication
     * @dev     Allow DEFAULT_ADMIN to set it multiple times.
     * @param   _srcChainId  Source(Remote) chain id
     * @param   _srcAddress  Source(Remote) contract address
     */
    function setLZTrustedRemoteAddress(uint16 _srcChainId, bytes calldata _srcAddress)
        external
        virtual
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        lzTrustedRemoteLookup[_srcChainId] = abi.encodePacked(_srcAddress, address(this));
        lzRemoteChainId = _srcChainId;
        emit LzSetTrustedRemoteAddress(_srcChainId, _srcAddress);
    }

    /**
     * @notice  Force resumes the stucked bridge
     * @dev     This action is destructive! Please use it only if you know what you are doing.
     * Only admin can call this function. \
     * `_srcAddress` is 40 bytes data with the remote contract address concatenated with
     * the local contract address via `abi.encodePacked(sourceAddress, localAddress)`
     * @param   _srcChainId  Source chain id
     * @param   _srcAddress  Remote contract address concatenated with the local contract address
     */
    function forceResumeReceive(uint16 _srcChainId, bytes calldata _srcAddress)
        external
        virtual
        override(ILayerZeroUserApplicationConfig)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        lzEndpoint.forceResumeReceive(_srcChainId, _srcAddress);
    }

    /**
     * @notice  Retries the stucked message in the bridge, if any
     * @dev     Only admin can call this function \
     * `_srcAddress` is 40 bytes data with the remote contract address concatenated with
     * the local contract address via `abi.encodePacked(sourceAddress, localAddress)`
     * @param   _srcChainId  Source chain id
     * @param   _srcAddress  Remote contract address concatenated with the local contract addres
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
     * @notice  Gets the Trusted Remote Address per given chainId
     * @param   _srcChainId  Source chain id
     * @return  bytes  Trusted Source Remote Address
     */
    function getTrustedRemoteAddress(uint16 _srcChainId) external view returns (bytes memory) {
        bytes memory path = lzTrustedRemoteLookup[_srcChainId];
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
     * @param   _srcChainId  Source chain id
     * @param   _srcAddress  Source contract address
     * @return  uint64  Inbound nonce
     */
    function getInboundNonce(uint16 _srcChainId, bytes calldata _srcAddress) external view returns (uint64) {
        return lzEndpoint.getInboundNonce(_srcChainId, _srcAddress);
    }

    /**
     * @param   _dstChainId  Destination chain id
     * @param   _srcAddress  Source contract address
     * @return  uint64  Outbound nonce
     */
    function getOutboundNonce(uint16 _dstChainId, address _srcAddress) external view returns (uint64) {
        return lzEndpoint.getOutboundNonce(_dstChainId, _srcAddress);
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
