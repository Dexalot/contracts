// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

interface IOmniVaultRegistry {
    struct VaultDetails {
        string name;
        address creator;
        address omniVault;
        address omniTrader;
        address omniVaultShare;
        address dexalotRFQ;
        uint32[] chainIds;
    }
}
