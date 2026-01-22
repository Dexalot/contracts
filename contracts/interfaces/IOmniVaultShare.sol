// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

interface IOmniVaultShare {
    function mint(uint256 _vaultId, address _to, uint256 _amount) external;

    function burn(uint256 _vaultId, uint256 _amount) external;
}
