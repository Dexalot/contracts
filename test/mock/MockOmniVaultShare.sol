// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IOmniVaultShare} from "contracts/interfaces/IOmniVaultShare.sol";
import {ERC20} from "@openzeppelin-v5/token/ERC20/ERC20.sol";

contract MockOmniVaultShare is IOmniVaultShare, ERC20 {
    mapping(address => uint256) private balances;
    uint256 public vaultId;

    constructor() ERC20("Mock OmniVault Share", "MOVS") {}

    function setVaultId(uint256 _vaultId) external {
        vaultId = _vaultId;
    }

    function mint(uint256 _vaultId, address to, uint256 amount) external override {
        require(vaultId == _vaultId, "INVALID_VAULT_ID");
        _mint(to, amount);
    }

    function burn(uint256 _vaultId, uint256 amount) external override {
        require(vaultId == _vaultId, "INVALID_VAULT_ID");
        _burn(msg.sender, amount);
    }
}
