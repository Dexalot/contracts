// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

interface IOmniVaultExecutor {
    enum ContractAccess {
        NONE,
        TRUSTED,
        NATIVE,
        ERC20,
        NATIVE_AND_ERC20
    }
}
