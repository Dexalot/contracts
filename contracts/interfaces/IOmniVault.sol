// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

interface IOmniVault {
    struct VaultTransfers {
        bytes32 symbol;
        int256 amount;
    }

    struct DepositFufillment {
        bytes32 depositRequestId;
        uint256 depositShares; // if 0 then refund funds
        uint8[] indexes;
        bytes32[] symbols;
        uint256[] amounts;
    }

    struct WithdrawalFufillment {
        bytes32 withdrawalRequestId;
        uint8[] indexes;
        bytes32[] symbols;
        uint256[] amounts;
    }

    function bulkSettleState(
        DepositFufillment[] calldata _deposits,
        WithdrawalFufillment[] calldata _withdrawals
    ) external;

    function omniVaultExecutor() external view returns (address);

    function initialDeposit(bytes32[] calldata symbols, uint256[] calldata _amounts, uint208 _shares) external;

    struct AssetInfo {
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

    enum RequestStatus {
        DEPOSIT_REQUESTED,
        WITHDRAWAL_REQUESTED,
        DEPOSIT_FULFILLED,
        WITHDRAWAL_FULFILLED,
        DEPOSIT_CLAIMED,
        WITHDRAWAL_CLAIMED
    }

    enum AssetType {
        NONE,
        BASE,
        QUOTE,
        REWARD,
        OTHER
    }
}
