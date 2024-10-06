// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.25;

interface ITeleporterMessengerNonce {
    /**
     * @notice A monotonically incremented integer tracking the total number of messages sent by this TeleporterMessenger contract.
     * @dev Used to provide uniqueness when generating message IDs for new messages. The first message sent will use a
     * messageNonce of 1 such that the nonce value can be used to provide replay protection for a given message ID.
     */
    function messageNonce() external view returns (uint256);
}
