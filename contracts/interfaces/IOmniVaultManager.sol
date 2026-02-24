// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

interface IOmniVaultManager {
    struct VaultDetails {
        string name;
        address proposer;
        address omniTrader;
        VaultStatus status;
        address executor;
        address shareToken;
        address dexalotRFQ;
        uint32[] chainIds;
        uint16[] tokens;
    }

    struct BatchState {
        uint32 finalizedAt; // Timestamp of finalization
        BatchStatus status; // 0: None, 1: Finalized, 2: Settled
        bytes32 depositHash; // Finalized deposit batch hash
        bytes32 withdrawalHash; // Finalized withdrawal batch hash
        bytes32 stateHash; // Hash of the state after applying the batch (used for settlement verification)
    }

    struct VaultState {
        uint256 vaultId;
        uint16[] tokenIds;
        uint256[] balances;
    }

    struct DepositFufillment {
        bytes32 depositRequestId;
        bool process;
        uint16[] tokenIds;
        uint256[] amounts;
    }

    struct WithdrawalFufillment {
        bytes32 withdrawalRequestId;
        bool process;
    }

    function bulkSettleState(
        uint256[] calldata _prices,
        VaultState[] calldata _vaults,
        DepositFufillment[] calldata _deposits,
        WithdrawalFufillment[] calldata _withdrawals
    ) external;

    struct AssetInfo {
        bytes32 symbol;
        AssetType tokenType;
        uint8 precision;
        uint32 minPerDeposit;
        uint32 maxPerDeposit;
    }

    struct TransferRequest {
        RequestStatus status;
        uint32 timestamp;
        uint208 shares;
        // space for something uint8
    }

    struct RequestLimit {
        uint248 lastBatchId;
        uint8 pendingCount;
    }

    enum VaultStatus {
        NONE,
        ACTIVE,
        PAUSED,
        DEPRECATED
    }

    enum BatchStatus {
        NONE,
        FINALIZED,
        SETTLED
    }

    enum RequestStatus {
        DEPOSIT_REQUESTED,
        WITHDRAWAL_REQUESTED,
        DEPOSIT_SUCCESS,
        WITHDRAWAL_SUCCESS,
        DEPOSIT_FAILED,
        WITHDRAWAL_FAILED
    }

    enum AssetType {
        BASE,
        QUOTE,
        REWARD,
        OTHER
    }
}
