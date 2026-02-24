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

    struct VaultTransfers {
        bytes32 symbol;
        int256 amount;
    }

    struct BatchState {
        uint32 finalizedAt; // Timestamp of finalization
        BatchStatus status; // 0: None, 1: Finalized, 2: Settled
        bytes32 depositHash; // Finalized deposit batch hash
        bytes32 withdrawalHash; // Finalized withdrawal batch hash
    }

    struct DepositFufillment {
        bytes32 depositRequestId;
        uint256 depositShares; // if 0 then refund funds
        uint16[] tokenIds;
        uint256[] amounts;
    }

    struct WithdrawalFufillment {
        bytes32 withdrawalRequestId;
        bytes32[] symbols;
        uint256[] amounts;
    }

    function bulkSettleState(
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
