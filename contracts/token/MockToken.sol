// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Mock ERC20 Token contract used for testing
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract MockToken is ERC20, AccessControlEnumerable {
    using SafeERC20 for IERC20;

    // version
    bytes32 public constant VERSION = bytes32("1.0.1");

    // create a role for minters
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 private __decimals;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) ERC20(_name, _symbol) {
        __decimals = _decimals;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
    }

    function decimals() public view override returns (uint8) {
        return __decimals;
    }

    function addAdmin(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "M-OACC-01");
        require(_address != address(0), "M-ZANA-01");
        grantRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function removeAdmin(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "M-OACC-02");
        require(getRoleMemberCount(DEFAULT_ADMIN_ROLE) > 1, "M-ALOA-01");
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function isAdmin(address _address) public view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function addMinter(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "M-OACC-03");
        require(_address != address(0), "M-ZANA-02");
        grantRole(MINTER_ROLE, _address);
    }

    function removeMinter(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "M-OACC-04");
        require(getRoleMemberCount(MINTER_ROLE) > 1, "M-ALOA-02");
        revokeRole(MINTER_ROLE, _address);
    }

    function mint(address _owner, uint256 _quantity) public onlyRole(MINTER_ROLE) {
        super._mint(_owner, _quantity);
    }
}
