// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "./interfaces/IDelayedTransfers.sol";
import "./PortfolioBridgeMain.sol";

/**
 * @title DelayedTransfers on withdrawals used by PortfolioBridgeSub
 * @notice This contracts checks volume and threshold limits for withdrawals if they are enabled
 * @dev It implements delayedTransfers as well as volume caps per epoch per token
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract DelayedTransfers is Initializable, AccessControlEnumerableUpgradeable, IDelayedTransfers {
    uint256 public delayPeriod; // in seconds
    uint256 public epochLength; // in seconds

    mapping(bytes32 => IPortfolio.XFER) public delayedTransfers;
    mapping(bytes32 => uint256) public delayThresholds; // key is token
    mapping(bytes32 => uint256) public epochVolumes; // key is token
    mapping(bytes32 => uint256) public epochVolumeCaps; // key is token
    mapping(bytes32 => uint256) public lastOpTimestamps; // key is token

    bytes32 public constant VERSION = bytes32("3.0.1");

    event DelayedTransfer(string action, bytes32 id, IPortfolio.XFER xfer);
    event DelayPeriodUpdated(uint256 period);
    event DelayThresholdUpdated(bytes32 symbol, uint256 threshold);
    event EpochLengthUpdated(uint256 length);
    event EpochVolumeUpdated(bytes32 token, uint256 cap);

    /**
     * @notice  Initialize the upgradeable contract
     * @param   _portfolioBridgeSub  Address of the portfolioSub
     */
    function initialize(address _portfolioBridgeSub) public initializer {
        __AccessControl_init();
        // admin account that can call inherited grantRole and revokeRole functions from OpenZeppelin AccessControl
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DEFAULT_ADMIN_ROLE, _portfolioBridgeSub);
    }

    /**
     * @notice  Checks the volume and thresholds to delay or execute immediately
     * @dev     This function is only called from sendXChainMessage (withdrawals from the subnet)
     * No checks on Deposits!!
     * Not bridge specific! Delayed messages will be processed by the defaultBridge
     * symbolId has already been mapped to symbol for the portfolio to properly process it
     * @param   _xfer  XFER message
     * @param   _dstChainListOrgChainId  Destination chain ID
     * @return  bool  True if the transfer can be executed immediately, false if it is delayed
     */
    function checkThresholds(
        IPortfolio.XFER calldata _xfer,
        uint32 _dstChainListOrgChainId
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
        uint256 delayThreshold = delayThresholds[_xfer.symbol];
        if (_xfer.transaction == IPortfolio.Tx.WITHDRAW && delayThreshold > 0 && _xfer.quantity > delayThreshold) {
            bytes32 id = keccak256(
                abi.encodePacked(
                    _xfer.nonce,
                    _xfer.transaction,
                    _xfer.trader,
                    _xfer.symbol,
                    _xfer.quantity,
                    _dstChainListOrgChainId
                )
            );
            addDelayedTransfer(id, _xfer, _dstChainListOrgChainId);
            return false;
        } else {
            return true;
        }
    }

    /**
     * @notice  Sets delay thresholds for tokens
     * @dev     Only admin can call this function
     * @param   _tokens  Array of tokens
     * @param   _thresholds  Array of thresholds
     */
    function setDelayThresholds(
        bytes32[] calldata _tokens,
        uint256[] calldata _thresholds
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokens.length == _thresholds.length, "PB-LENM-01");
        for (uint256 i = 0; i < _tokens.length; ++i) {
            delayThresholds[_tokens[i]] = _thresholds[i];
            emit DelayThresholdUpdated(_tokens[i], _thresholds[i]);
        }
    }

    /**
     * @notice  Sets delay period for delayed transfers
     * @dev   Only admin can call this function
     * @param   _period  Delay period in seconds
     */
    function setDelayPeriod(uint256 _period) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        delayPeriod = _period;
        emit DelayPeriodUpdated(_period);
    }

    /**
     * @notice  Adds transfer to delayed queue
     * @param   _id  Transfer ID
     * @param   _xfer  XFER message
     * @param   _dstChainListOrgChainId  Destination chain ID
     */
    function addDelayedTransfer(bytes32 _id, IPortfolio.XFER memory _xfer, uint32 _dstChainListOrgChainId) private {
        require(delayedTransfers[_id].timestamp == 0, "PB-DTAE-01");
        _xfer.customdata = bytes28(uint224(_dstChainListOrgChainId));
        delayedTransfers[_id] = _xfer;
        emit DelayedTransfer("ADDED", _id, _xfer);
    }

    /**
     * @notice  Executes delayed transfer if the delay period has passed
     * @dev     Only admin can call this function
     * @param   _id  Transfer ID
     */
    function executeDelayedTransfer(
        bytes32 _id
    )
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (IPortfolio.XFER memory xfer, uint32 dstChainListOrgChainId)
    {
        xfer = delayedTransfers[_id];
        dstChainListOrgChainId = uint32(uint224(xfer.customdata));
        xfer.customdata = bytes28(0);
        require(xfer.timestamp > 0, "PB-DTNE-01");
        require(block.timestamp > xfer.timestamp + delayPeriod, "PB-DTSL-01");
        emit DelayedTransfer("EXECUTED", _id, xfer);
        delete delayedTransfers[_id];
    }

    /**
     * @notice  Sets epoch length for volume control
     * @dev    Only admin can call this function
     * @param   _length  Epoch length in seconds
     */
    function setEpochLength(uint256 _length) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        epochLength = _length;
        emit EpochLengthUpdated(_length);
    }

    /**
     * @notice  Sets volume cap for tokens
     * @dev     Only admin can call this function
     * @param   _tokens  Array of tokens
     * @param   _caps  Array of caps
     */
    function setEpochVolumeCaps(
        bytes32[] calldata _tokens,
        uint256[] calldata _caps
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_tokens.length == _caps.length, "PB-LENM-01");
        for (uint256 i = 0; i < _tokens.length; ++i) {
            epochVolumeCaps[_tokens[i]] = _caps[i];
            emit EpochVolumeUpdated(_tokens[i], _caps[i]);
        }
    }

    /**
     * @notice  Updates volume for token. Used only for withdrawals from the subnet.
     * @dev     Does nothing if there is no cap/limit for the token
     * Volume threshold check for multiple small transfers within a epoch.
     * @param   _token  Token symbol
     * @param   _amount  Amount to add to volume
     */
    function updateVolume(bytes32 _token, uint256 _amount) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        if (epochLength == 0) {
            return;
        }
        uint256 cap = epochVolumeCaps[_token];
        if (cap == 0) {
            // Default behavior no cap on any tokens
            return;
        }
        uint256 volume = epochVolumes[_token];
        uint256 timestamp = block.timestamp;
        uint256 epochStartTime = (timestamp / epochLength) * epochLength;
        if (lastOpTimestamps[_token] < epochStartTime) {
            volume = _amount;
        } else {
            volume += _amount;
        }
        require(volume <= cap, "PB-VCAP-01");
        epochVolumes[_token] = volume;
        lastOpTimestamps[_token] = timestamp;
    }
}
