// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

interface IOmniVaultCreator {
    enum VaultRequestStatus {
        NONE,
        PENDING,
        REJECTED,
        RECLAIMED,
        ACCEPTED
    }

    struct VaultRequest {
        address proposer;
        uint32 timestamp;
        VaultRequestStatus status; // Current status of the request
        uint64 feeCollected;
        address[] tokens; // The ERC20 token address
        uint208[] amounts; // The amount of the token sent
    }

    // Emitted when a new vault creation request is made
    event VaultCreationRequest(
        bytes32 indexed requestId,
        address indexed creator,
        VaultRequestStatus status,
        address feeToken,
        uint256 feeCollected,
        address[] tokens,
        uint208[] amounts
    );

    // Emitted when a vault request is accepted, rejected, or reclaimed
    event VaultCreationUpdate(bytes32 indexed requestId, VaultRequestStatus status);
    // Emitted when a new pair vault creation is requested
    event PairVault(bytes32 indexed requestId, address[] baseTokens, address[] quoteTokens, uint32[] chainIds);
    event RiskAcknowledged(address indexed proposer);
    event FeeUpdated(uint256 newFee, uint256 oldFee);
    event FeeTokenUpdated(address newFeeToken, address oldFeeToken);
    event ReclaimDelayUpdated(uint256 newDelay, uint256 oldDelay);
}
