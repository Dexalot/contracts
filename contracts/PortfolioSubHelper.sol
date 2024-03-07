// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "./interfaces/IPortfolioSubHelper.sol";

/**
 * @title   PortfolioSubHelper Contract to support PortfolioSub's additional functions
 * @notice  This contract is used to manage a list of rebate accounts. A rebate account
 * can have a preferential rate.
 * It also keeps a mapping for token convertion after the March 2024 upgrade to support
 * multichain
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioSubHelper is Initializable, AccessControlEnumerableUpgradeable, IPortfolioSubHelper {
    mapping(address => bool) public adminAccountsForRates;
    mapping(address => string) public organizations;
    mapping(address => mapping(bytes32 => Rates)) private rateOverrides;
    mapping(bytes32 => bytes32) private convertableTokens;

    // version
    bytes32 public constant VERSION = bytes32("2.5.0");

    // storage gap for upgradeability
    uint256[50] __gap;

    event AddressSet(string indexed name, string actionName, address addressAdded, bytes32 customData);

    /**
     * @notice  Initialize the upgradeable contract
     */
    function initialize() external initializer {
        __AccessControl_init();
        // admin account that can call inherited grantRole and revokeRole functions from OpenZeppelin AccessControl
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice  Adds the given address to adminAccountsForRates
     * @dev     Only callable by admin. Admin accounts like treasury pays no fees for any trades
     * on any pairs
     * @param   _account  Address of admin account
     * @param   _organization  Organization of the contract to be added
     */
    function addAdminAccountForRates(
        address _account,
        string calldata _organization
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_account != address(0), "P-ZADDR-01");
        adminAccountsForRates[_account] = true;
        organizations[_account] = _organization;
        emit AddressSet("ADMIN_RATES", "ADD", _account, bytes32(0));
    }

    /**
     * @notice  Removes the given address from adminAccountsForRates
     * @dev     Only callable by admin
     * @param   _account  Address of the admin account
     */
    function removeAdminAccountForRates(address _account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        delete adminAccountsForRates[_account];
        delete organizations[_account];
        emit AddressSet("ADMIN_RATES", "REMOVE", _account, bytes32(0));
    }

    /**
     * @notice  Checks if an address is in adminAccountsForRates
     * @param   _account  Address of the admin account
     */
    function isAdminAccountForRates(address _account) external view returns (bool) {
        return adminAccountsForRates[_account];
    }

    /**
     * @notice  Adds the given set of tradepair ids for a given address to rebateAccountsForRates
     * @dev     Only callable by admin. Rebates are set for each tradepair for a given address
     * @param   _rebateAddress  Address of rebate account
     * @param   _organization Organization / reason
     * @param   _tradePairIds Array of TradePairIds
     * @param   _makerRates Array of maker rates
     * @param   _takerRates Array of taker rates
     */
    function addRebateAccountForRates(
        address _rebateAddress,
        string calldata _organization,
        bytes32[] calldata _tradePairIds,
        uint8[] calldata _makerRates,
        uint8[] calldata _takerRates
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_rebateAddress != address(0), "P-ZADDR-01");
        organizations[_rebateAddress] = _organization;
        for (uint256 i = 0; i < _tradePairIds.length; ++i) {
            Rates storage rate = rateOverrides[_rebateAddress][_tradePairIds[i]];
            rate.tradePairId = _tradePairIds[i];
            rate.makerRate = _makerRates[i];
            rate.takerRate = _takerRates[i];
            emit AddressSet("REBATE_RATES", "ADD", _rebateAddress, _tradePairIds[i]);
        }
    }

    /**
     * @notice  Removes the a list of tradepairs of an address from rebateAccountsForRates
     * @dev     Only callable by admin
     * @param   _rebateAddress  Address of the admin account
     * @param   _tradePairIds Array of TradePairIds to remove
     */
    function removeTradePairsFromRebateAccount(
        address _rebateAddress,
        bytes32[] calldata _tradePairIds
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _tradePairIds.length; ++i) {
            delete rateOverrides[_rebateAddress][_tradePairIds[i]];
            emit AddressSet("REBATE_RATES", "REMOVE-TRADEPAIR", _rebateAddress, _tradePairIds[i]);
        }
    }

    /**
     * @notice  Gets the preferential rates of maker and the taker if any
     * @param   _makerAddr  Maker address of the trade
     * @param   _takerAddr  Taker address of the trade
     * @param   _tradePairId  TradePair Id
     * @param   _makerRate  tradepair's default maker rate
     * @param   _takerRate  tradepair's default taker rate
     * @return   makerRate tradepair's default maker rate or preferential maker rate if any
     * @return   takerRate tradepair's default taker rate or preferential taker rate if any
     */
    function getRates(
        address _makerAddr,
        address _takerAddr,
        bytes32 _tradePairId,
        uint8 _makerRate,
        uint8 _takerRate
    ) external view override returns (uint256 makerRate, uint256 takerRate) {
        if (adminAccountsForRates[_makerAddr]) {
            makerRate = 0;
        } else {
            Rates memory rates = rateOverrides[_makerAddr][_tradePairId];
            if (rates.tradePairId != bytes32(0)) {
                makerRate = uint256(rates.makerRate);
            } else {
                makerRate = uint256(_makerRate);
            }
        }

        if (adminAccountsForRates[_takerAddr]) {
            takerRate = 0;
        } else {
            Rates memory rates = rateOverrides[_takerAddr][_tradePairId];
            if (rates.tradePairId != bytes32(0)) {
                takerRate = uint256(rates.takerRate);
            } else {
                takerRate = uint256(_takerRate);
            }
        }
    }

    /**
     * @notice  Adds a symbol to the convertible symbol mapping
     * @dev     Only admin can call this function. After the March 2024 upgrade we need to rename
     * 3 current subnet symbols BTC.b, WETH.e and USDt to BTC, ETH, USDT to support multichain trading.
     * Tokens to convert to is controlled by the PortfolioSubHelper
     * All 3 following functions can technically be removed after the March 24 upgrade.
     * @param   _fromSymbol  Token to be converted from.
     * @param   _toSymbol   trader address
     */
    function addConvertibleToken(bytes32 _fromSymbol, bytes32 _toSymbol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_fromSymbol != bytes32(0) && _toSymbol != bytes32(0), "P-ZADDR-01");
        convertableTokens[_fromSymbol] = _toSymbol;
    }

    /**
     * @notice  Removes a symbol to the convertible symbol mapping
     * @dev     Only callable by admin
     * @param   _fromSymbol  Symbol to remove
     */
    function removeConvertibleToken(bytes32 _fromSymbol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        delete convertableTokens[_fromSymbol];
    }

    /**
     * @notice  Gets  a symbol to the convertible symbol mapping
     * @param   _fromSymbol  From Symbol to be converted
     * @return  _toSymbol To Symbol
     */
    function getSymbolToConvert(bytes32 _fromSymbol) external view override returns (bytes32) {
        return convertableTokens[_fromSymbol];
    }
}
