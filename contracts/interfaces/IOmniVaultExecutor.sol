// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

interface IOmniVaultExecutor {
    enum ContractAccess {
        NONE, // Not trusted, cannot call any functions or send/receive funds
        TRUSTED, // Trusted contract, can call whitelisted functions that don't send/receive funds
        NATIVE, // Trusted contract, can call whitelisted functions that send/receive native currency
        ERC20, // Trusted contract, can call whitelisted functions that send/receive ERC20 tokens
        NATIVE_AND_ERC20 // Trusted contract, can call whitelisted functions that send/receive both native currency and ERC20 tokens
    }
}
