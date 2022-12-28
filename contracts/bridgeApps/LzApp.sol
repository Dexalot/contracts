// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "../interfaces/layerZero/ILayerZeroReceiver.sol";
import "../interfaces/layerZero/ILayerZeroUserApplicationConfig.sol";
import "../interfaces/layerZero/ILayerZeroEndpoint.sol";
import "../library/UtilsLibrary.sol";

/**
 * @title Abstract Layer Zero contract
 * @notice  It is extended by the PortfolioBridge contract for Dexalot specific implementation
 * @dev  This doesn't support multi mainnet Chain as many functions depend on lzRemoteChainId
 * Remove lzRemoteChainId and adjust the functions for multichain support.
 */

abstract contract LzApp is AccessControlEnumerableUpgradeable, ILayerZeroReceiver, ILayerZeroUserApplicationConfig {
    ILayerZeroEndpoint internal lzEndpoint;

    //chainId ==> Remote contract address concatenated with the local contract address, 40 bytes
    mapping(uint16 => bytes) public lzTrustedRemoteLookup;

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
    function lzEstimateFees(
        bytes memory _payload
    ) internal view returns (uint256 messageFee, bytes memory adapterParams) {
        // Dexalot sets a higher gasForDestinationLzReceive value for LayerZero in PortfolioBridge extending LzApp
        // LayerZero needs v1 in adapterParams to specify a higher gas for the destination to receive transaction
        // For more details refer to LayerZero PingPong example at
        // https://github.com/LayerZero-Labs/solidity-examples/blob/main/contracts/examples/PingPong.sol
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
     * @notice  Sets trusted remote address for the cross-chain communication
     * @dev     Allow DEFAULT_ADMIN to set it multiple times.
     * @param   _srcChainId  Source(Remote) chain id
     * @param   _srcAddress  Source(Remote) contract address
     */
    function setLZTrustedRemoteAddress(
        uint16 _srcChainId,
        bytes calldata _srcAddress
    ) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        lzTrustedRemoteLookup[_srcChainId] = abi.encodePacked(_srcAddress, address(this));
        lzRemoteChainId = _srcChainId;
        emit LzSetTrustedRemoteAddress(_srcChainId, _srcAddress);
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
     * @return  bool  True if the bridge has stored payload, means it is stuck
     */
    function hasStoredPayload() external view returns (bool) {
        return lzEndpoint.hasStoredPayload(lzRemoteChainId, lzTrustedRemoteLookup[lzRemoteChainId]);
    }

    /**
     * @dev  Inbound nonce assigned by LZ
     * @return  uint64  Inbound nonce
     */
    function getInboundNonce() internal view returns (uint64) {
        return lzEndpoint.getInboundNonce(lzRemoteChainId, lzTrustedRemoteLookup[lzRemoteChainId]);
    }

    /**
     * @dev  Outbound nonce assigned by LZ
     * @return  uint64  Outbound nonce
     */
    function getOutboundNonce() internal view returns (uint64) {
        return lzEndpoint.getOutboundNonce(lzRemoteChainId, address(this));
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
