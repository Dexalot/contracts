// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "./interfaces/IRebateAccounts.sol";

/**
 * @title   Rebate accounts storage contract
 * @notice  This contract is used to manage a list of rebate accounts. A rebate account
 * can have a preferential rate.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract RebateAccounts is Initializable, AccessControlEnumerableUpgradeable, IRebateAccounts {
    mapping(address => bool) public adminAccountsForRates;
    mapping(address => bool) public rebateAccountsForRates;
    mapping(address => mapping(bytes32 => Rates)) public rateOverrides;
    mapping(address => string) public organizations;
    // version
    bytes32 public constant VERSION = bytes32("2.5.0");

    // event for bans and unban actions
    //event RatesChanged(address indexed account, BanReason reason, bool banned);

    /**
     * @notice  Initialize the upgradeable contract
     */
    function initialize() public initializer {
        __AccessControl_init();
        // admin account that can call inherited grantRole and revokeRole functions from OpenZeppelin AccessControl
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice  Adds the given address to adminAccountsForRates
     * @dev     Only callable by admin
     * @param   _account  Address of admin account
     * @param   _organization  Organization of the contract to be added
     */
    function addAdminAccountForRates(
        address _account,
        string calldata _organization
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        adminAccountsForRates[_account] = true;
        organizations[_account] = _organization;
        // emit AddressSet("ADMIN_RATES", "ADD", _account, _account);
    }

    /**
     * @notice  Removes the given address to adminAccountsForRates
     * @dev     Only callable by admin
     * @param   _account  Address of the admin account
     */
    function removeAdminAccountForRates(address _account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        adminAccountsForRates[_account] = false;
        //emit AddressSet("ADMIN_RATES", "REMOVE", _account, _account);
    }

    /**
     * @notice  Adds the given address to rebateAccountsForRates
     * @dev     Only callable by admin
     * @param   _rebateAddress  Address of rebate account
     */
    function addRebateAccountForRates(
        address _rebateAddress,
        string calldata _organization,
        bytes32[] calldata tradePairIds,
        uint8[] calldata _makerFees,
        uint8[] calldata _takerFees
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rebateAccountsForRates[_rebateAddress] = true;
        organizations[_rebateAddress] = _organization;
        for (uint256 i = 0; i < tradePairIds.length; ++i) {
            Rates storage rate = rateOverrides[_rebateAddress][tradePairIds[i]];
            rate.makerRate = _makerFees[i];
            rate.takerRate = _takerFees[i];
        }
        //emit AddressSet("REBATE_RATES", "ADD", _rebateAddress, _rebateAddress);
    }

    /**
     * @notice  Removes the given address to adminAccountsForRates
     * @dev     Only callable by admin
     * @param   _rebateAddress  Address of the admin account
     */
    function removeTradePairsFromRebateAccount(
        address _rebateAddress,
        bytes32[] calldata tradePairIds
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rebateAccountsForRates[_rebateAddress] = false;
        for (uint256 i = 0; i < tradePairIds.length; ++i) {
            delete rateOverrides[_rebateAddress][tradePairIds[i]];
        }
        //emit AddressSet("REBATE_RATES", "REMOVE-TRADEPAIR", _rebateAddress, _rebateAddress);
    }

    /**
     * @notice  Removes the given address to rebateAccountsForRates
     * @dev     Only callable by admin
     * @param   _rebateAddress  Address of the rebates account
     */
    function removeRebateAccountForRates(
        address _rebateAddress,
        bytes32[] calldata tradePairIds
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rebateAccountsForRates[_rebateAddress] = false;
        delete organizations[_rebateAddress];
        for (uint256 i = 0; i < tradePairIds.length; ++i) {
            delete rateOverrides[_rebateAddress][tradePairIds[i]];
        }
        //emit AddressSet("REBATE_RATES", "REMOVE-ACCOUNT", _rebateAddress, _rebateAddress);
    }

    // /**
    //  * @notice  Returns the ban reason of an address
    //  * @param   _account  Address to be checked for its ban status
    //  * @return  BanReason Ban reason = [NOTBANNED, OFAC, ABUSE, TERMS]
    //  */
    function getRates(
        address _makerAddr,
        address _takerAddr,
        bytes32 _tradePairId,
        uint8 _makerRate,
        uint8 _takerRate
    ) external view override returns (uint8 makerRate, uint8 takerRate) {
        if (adminAccountsForRates[_makerAddr]) {
            makerRate = 0;
        } else {
            Rates memory rates = rateOverrides[_makerAddr][_tradePairId];
            if (rates.tradePairId != bytes32(0)) {
                makerRate = rates.makerRate;
            } else {
                makerRate = _makerRate;
            }
        }

        if (adminAccountsForRates[_takerAddr]) {
            makerRate = 0;
        } else {
            Rates memory rates = rateOverrides[_takerAddr][_tradePairId];
            if (rates.tradePairId != bytes32(0)) {
                takerRate = rates.takerRate;
            } else {
                takerRate = _takerRate;
            }
        }
    }
}
