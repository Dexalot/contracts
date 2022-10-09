// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./PortfolioBridge.sol";

/**
 * @title Bridge aggregator and message relayer for subnet
 * @notice This contracts checks volume and threshold limits for withdrawals.
 * @dev It implements delayedTransfers as well as volume caps per epoch per token
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioBridgeSub is PortfolioBridge {
    uint256 public delayPeriod; // in seconds
    uint256 public epochLength; // in seconds

    mapping(bytes32 => IPortfolio.XFER) public delayedTransfers;
    mapping(bytes32 => uint256) public delayThresholds; // key is token
    mapping(bytes32 => uint256) public epochVolumes; // key is token
    mapping(bytes32 => uint256) public epochVolumeCaps; // key is token
    mapping(bytes32 => uint256) public lastOpTimestamps; // key is token

    event DelayedTransferAdded(bytes32 id);
    event DelayedTransferExecuted(bytes32 id, IPortfolio.XFER xfer);
    event DelayPeriodUpdated(uint256 period);
    event DelayThresholdUpdated(bytes32 symbol, uint256 threshold);
    event EpochLengthUpdated(uint256 length);
    event EpochVolumeUpdated(bytes32 token, uint256 cap);

    // solhint-disable-next-line func-name-mixedcase
    function VERSION() public pure override returns (bytes32) {
        return bytes32("2.1.2");
    }

    /**
     * @notice  Sends XFER message to the destination chain
     * @dev     This is a wrapper to check volume and threshold while withdrawing
     * @param   _bridge  Bridge type to send over
     * @param   _xfer  XFER message to send
     */
    function sendXChainMessage(BridgeProvider _bridge, IPortfolio.XFER memory _xfer)
        external
        override
        onlyRole(PORTFOLIO_ROLE)
    {
        // Volume treshold check for multiple small transfers within a given amount of time
        // Used only for withdrawals from the subnet.
        updateVolume(_xfer.symbol, _xfer.quantity); // Reverts if breached. Does not add to delayTranfer.

        //Check individual treasholds again for withdrawals. And set them in delayed transfer if necessary.
        if (checkTreshholds(_xfer)) {
            sendXChainMessageInternal(_bridge, _xfer);
        }
    }

    /**
     * @notice  Checks the volume and thresholds to delay or execute immediately
     * @dev     This function is called both in processPayload (deposits coming from mainnet)
     * as well as sendXChainMessage (withdrawals from the subnet)
     * Not bridge specific! Delayed messages will be processed by the defaultBridge
     * @param   _xfer  XFER message
     * @return  bool  True if the transfer can be executed immediately, false if it is delayed
     */
    function checkTreshholds(IPortfolio.XFER memory _xfer) internal override returns (bool) {
        uint256 delayThreshold = delayThresholds[_xfer.symbol];
        if (delayThreshold > 0 && _xfer.quantity > delayThreshold) {
            bytes32 id = keccak256(
                abi.encodePacked(_xfer.nonce, _xfer.transaction, _xfer.trader, _xfer.symbol, _xfer.quantity)
            );
            addDelayedTransfer(id, _xfer);
            return false;
        } else {
            return true;
        }
    }

    /**
     * @notice  Returns the symbolId used the subnet given the targetChainId
     * @dev     it uses the defaultTargetChain instead of instead of portfolio.getChainId() that PortfolioBridge uses.
     * When sending from Mainnet to Subnet we send out the symbolId of the sourceChain. USDC => USDC1337
     * Because the subnet needs to know about different ids from different mainnets.
     * When sending messages Subnet to Mainnet, it resolves it back to the symbolId the target chain expects
     * @param   _symbol  symbol of the token
     * @return  bytes32  symbolId
     */

    function getTokenId(bytes32 _symbol) internal view override returns (bytes32) {
        return tokenDetailsMapBySymbol[_symbol][defaultTargetChainId];
    }

    /**
     * @notice  Sets delay thresholds for tokens
     * @dev     Only admin can call this function
     * @param   _tokens  Array of tokens
     * @param   _thresholds  Array of thresholds
     */
    function setDelayThresholds(bytes32[] calldata _tokens, uint256[] calldata _thresholds)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_tokens.length == _thresholds.length, "PB-LENM-01");
        for (uint256 i = 0; i < _tokens.length; i++) {
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
     */
    function addDelayedTransfer(bytes32 _id, IPortfolio.XFER memory _xfer) private {
        require(delayedTransfers[_id].timestamp == 0, "PB-DTAE-01");
        delayedTransfers[_id] = _xfer;
        emit DelayedTransferAdded(_id);
    }

    /**
     * @notice  Executes delayed transfer if the delay period has passed
     * @dev     Only admin can call this function
     * @param   _id  Transfer ID
     */
    function executeDelayedTransfer(bytes32 _id) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        IPortfolio.XFER storage xfer = delayedTransfers[_id];
        require(xfer.timestamp > 0, "PB-DTNE-01");
        require(block.timestamp > xfer.timestamp + delayPeriod, "PB-DTSL-01");

        if (xfer.transaction == IPortfolio.Tx.DEPOSIT) {
            portfolio.processXFerPayload(xfer.trader, xfer.symbol, xfer.quantity, xfer.transaction);
        } else if (xfer.transaction == IPortfolio.Tx.WITHDRAW) {
            sendXChainMessageInternal(defaultBridgeProvider, xfer);
        }

        emit DelayedTransferExecuted(_id, xfer);
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
    function setEpochVolumeCaps(bytes32[] calldata _tokens, uint256[] calldata _caps)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_tokens.length == _caps.length, "PB-LENM-02");
        for (uint256 i = 0; i < _tokens.length; i++) {
            epochVolumeCaps[_tokens[i]] = _caps[i];
            emit EpochVolumeUpdated(_tokens[i], _caps[i]);
        }
    }

    /**
     * @notice  Updates volume for token. Used only for withdrawals from the subnet.
     * @dev     Does nothing if there is no cap/limit for the token
     * Volume treshold check for multiple small transfers within a epoch.
     * @param   _token  Token symbol
     * @param   _amount  Amount to add to volume
     */
    function updateVolume(bytes32 _token, uint256 _amount) private {
        if (epochLength == 0) {
            return;
        }
        uint256 cap = epochVolumeCaps[_token];
        if (cap == 0) {
            // Default behaviour no cap on any tokens
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
