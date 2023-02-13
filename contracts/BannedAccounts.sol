// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "./interfaces/IBannedAccounts.sol";

/**
 * @title   Banned accounts storage contract
 * @notice  This contract is used to manage a list of banned accounts. A banned account
 * is not allowed to deposit into Dexalot portfolio to engage in any activity on
 * Dexalot subnet.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract BannedAccounts is Initializable, AccessControlEnumerableUpgradeable, IBannedAccounts {
    // admin role that manages banned accounts
    bytes32 public constant BAN_ADMIN_ROLE = keccak256("BAN_ADMIN_ROLE");
    // version
    bytes32 public constant VERSION = bytes32("2.2.1");

    // data structure to represent a banned account
    struct BannedAccount {
        BanReason reason;
        bool banned;
    }

    // mapping of banned accounts
    mapping(address => BannedAccount) public bannedAccounts;

    // event for bans and unban actions
    event BanStatusChanged(address indexed account, BanReason reason, bool banned);

    /**
     * @notice  Initialize the upgradeable contract
     * @param   _banAdmin  Address of the EOA that is allowed to update banned accounts
     */
    function initialize(address _banAdmin) public initializer {
        __AccessControl_init();
        // admin account that can call inherited grantRole and revokeRole functions from OpenZeppelin AccessControl
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // admin account that maintains the banned accounts
        _setupRole(BAN_ADMIN_ROLE, _banAdmin);
    }

    /**
     * @notice  Ban an account
     * @param   _account  Address to be added to the banned accounts
     * @param   _reason  Reason for the ban, e.g. BanReason.OFAC
     */
    function banAccount(address _account, BanReason _reason) external onlyRole(BAN_ADMIN_ROLE) {
        emit BanStatusChanged(_account, _reason, true);
        bannedAccounts[_account] = BannedAccount(_reason, true);
    }

    /**
     * @notice  Ban an array of accounts
     * @param   _accounts  Array of addresses to be added to the banned accounts
     * @param   _reasons  Array of reasons for the ban
     */
    function banAccounts(
        address[] calldata _accounts,
        BanReason[] calldata _reasons
    ) external onlyRole(BAN_ADMIN_ROLE) {
        require(_accounts.length == _reasons.length, "BA-LENM-01");
        for (uint256 i = 0; i < _accounts.length; ++i) {
            bannedAccounts[_accounts[i]] = BannedAccount(_reasons[i], true);
        }
    }

    /**
     * @notice  Unban an account
     * @param   _account  Address to be removed from banned accounts
     */
    function unbanAccount(address _account) external onlyRole(BAN_ADMIN_ROLE) {
        emit BanStatusChanged(_account, BanReason.NOTBANNED, false);
        bannedAccounts[_account] = BannedAccount(BanReason.NOTBANNED, false);
    }

    /**
     * @notice  Unban an array of accounts
     * @param   _accounts  Array of addresses to be removed from the banned accounts
     */
    function unbanAccounts(address[] calldata _accounts) external onlyRole(BAN_ADMIN_ROLE) {
        for (uint256 i = 0; i < _accounts.length; ++i) {
            bannedAccounts[_accounts[i]] = BannedAccount(BanReason.NOTBANNED, false);
        }
    }

    /**
     * @notice  Returns the ban status of an address
     * @param   _account  Address to be checked for its ban status
     * @return  bool Ban status - true = banned or false = not banned
     */
    function isBanned(address _account) external view override returns (bool) {
        return bannedAccounts[_account].banned;
    }

    /**
     * @notice  Returns the ban reason of an address
     * @param   _account  Address to be checked for its ban status
     * @return  BanReason Ban reason = [NOTBANNED, OFAC, ABUSE, TERMS]
     */
    function getBanReason(address _account) external view override returns (BanReason) {
        return bannedAccounts[_account].reason;
    }
}
