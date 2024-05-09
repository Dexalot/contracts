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
    // Preset preferential rates regardless of the trade volumes. Used for contracted market makers
    mapping(address => mapping(bytes32 => Rates)) public rateOverrides;
    mapping(bytes32 => bytes32) private convertableTokens; // obsolete
    // version
    bytes32 public constant VERSION = bytes32("2.5.4");
    uint256 public minTakerRate;
    // Holds volume based rebates for everyone
    mapping(address => Rebates) public rebates;
    // storage gap for upgradeability
    uint256[48] __gap; //unnecessary

    event RateChanged(
        string indexed name,
        string actionName,
        address addressAdded,
        bytes32 customData,
        uint8 maker,
        uint8 taker
    );

    /**
     * @notice  Initialize the upgradeable contract
     */
    function initialize() external initializer {
        __AccessControl_init();
        // admin account that can call inherited grantRole and revokeRole functions from OpenZeppelin AccessControl
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        minTakerRate = 5;
    }

    /**
     * @notice  Sets the minimum Taker rate that is possible after the volume rebates
     * @dev     Only callable by admin.
     * @param   _rate  Minimum Taker rate after volume rebates
     */
    function setMinTakerRate(uint256 _rate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_rate > 0, "P-MTNZ-01");
        minTakerRate = _rate;
        emit RateChanged("MIN_TAKER_RATE", "UPDATE", address(0), bytes32(0), 0, uint8(_rate));
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
        emit RateChanged("ADMIN_RATES", "ADD", _account, bytes32(0), 0, 0);
    }

    /**
     * @notice  Removes the given address from adminAccountsForRates
     * @dev     Only callable by admin
     * @param   _account  Address of the admin account
     */
    function removeAdminAccountForRates(address _account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        delete adminAccountsForRates[_account];
        delete organizations[_account];
        emit RateChanged("ADMIN_RATES", "REMOVE", _account, bytes32(0), 0, 0);
    }

    /**
     * @notice  Checks if an address is in adminAccountsForRates
     * @param   _account  Address of the admin account
     */
    function isAdminAccountForRates(address _account) external view returns (bool) {
        return adminAccountsForRates[_account];
    }

    /**
     * @notice  Adds the given address to rebates mapping that keeps track of volume based rebates.
     * @dev     Only callable by admin. Rebates are set for each address. An offchain application
     * checks the 30 days rolling volume and calculates the discount the address is eligible for.
     * Pass 0 & 0 maker taker rebates to delete the rebate address from the mapping.
     * @param   _rebateAddress Array of rebate accounts
     * @param   _makerRebates Array of maker rebates
     * @param   _takerRebates Array of taker rebates
     */
    function addVolumeBasedRebates(
        address[] calldata _rebateAddress,
        uint8[] calldata _makerRebates,
        uint8[] calldata _takerRebates
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            _rebateAddress.length == _makerRebates.length && _makerRebates.length == _takerRebates.length,
            "P-LENM-01"
        );
        // This is an admin function that will be called a lot.
        // No requires to save gas
        for (uint256 i = 0; i < _rebateAddress.length; ++i) {
            // Ignore address(0) & more than 100% rebate
            if (_rebateAddress[i] == address(0) || _makerRebates[i] > 100 || _takerRebates[i] > 99) {
                continue;
            }
            // 0 Rebates for the address, remove it from the state.
            if (_makerRebates[i] == 0 && _takerRebates[i] == 0) {
                delete rebates[_rebateAddress[i]];
            } else {
                Rebates storage rebate = rebates[_rebateAddress[i]];
                rebate.maker = _makerRebates[i];
                rebate.taker = _takerRebates[i];
            }
            emit RateChanged("REBATES", "UPDATED", _rebateAddress[i], bytes32(0), _makerRebates[i], _takerRebates[i]);
        }
    }

    /**
     * @notice  Adds the given set of tradepairs for a given address to rateOverrides. Usually used
     * for contracted market makers. (0.20% = 20 bps = 20/10000)
     * Use 255 for logical deletion of one leg and keep the other leg. If both need to be deleted,
     * use removeTradePairsFromRateOverrides function
     * @dev     Only callable by admin. Overrides are set for each tradepair for a given address.
     * if you pass the max uint8 value 255 to either maker or taker rate, it will use the default maker/taker
     * this is for situations where you want to have a preferential rate on the maker and also wanting to make
     * use of volume rebates on the taker side or visa versa
     * @param   _account  Address for the override to be applied
     * @param   _organization Organization / reason
     * @param   _tradePairIds Array of TradePairIds
     * @param   _makerRates Array of maker rates
     * @param   _takerRates Array of taker rates
     */
    function addToRateOverrides(
        address _account,
        string calldata _organization,
        bytes32[] calldata _tradePairIds,
        uint8[] calldata _makerRates,
        uint8[] calldata _takerRates
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_account != address(0), "P-ZADDR-01");
        organizations[_account] = _organization;
        for (uint256 i = 0; i < _tradePairIds.length; ++i) {
            Rates storage rate = rateOverrides[_account][_tradePairIds[i]];
            rate.tradePairId = _tradePairIds[i];
            rate.makerRate = _makerRates[i];
            rate.takerRate = _takerRates[i];
            emit RateChanged("RATE_OVERRIDE", "ADD", _account, _tradePairIds[i], _makerRates[i], _takerRates[i]);
        }
    }

    /**
     * @notice  Removes the a list of tradepairs of an address from rateOverrides
     * @dev     Only callable by admin
     * @param   _account  Address of the admin account
     * @param   _tradePairIds Array of TradePairIds to remove
     */
    function removeTradePairsFromRateOverrides(
        address _account,
        bytes32[] calldata _tradePairIds
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _tradePairIds.length; ++i) {
            delete rateOverrides[_account][_tradePairIds[i]];
            emit RateChanged("RATE_OVERRIDE", "REMOVE-TRADEPAIR", _account, _tradePairIds[i], 0, 0);
        }
    }

    /**
     * @notice  Gets the preferential rates of maker and the taker if any
     * @dev     255 is used for logical deletion of one leg of preferential rates pair.
     * Priority 1- check admin rates, 2- preferential rates, 3- Volume Rebates 4- Default rate
     * Default rates are multiplied by 10 for an additional precision when dealing with default rates
     * of 1 or 2 bps. Without this, we can't have any rates in between 1 and 2 bps. But with it, we can
     * have 10(1 bps)-11(1.1 bps)... 19-20(2 bps)
     * Portfolio.TENK denominator has been multipled by 10 and was changed to 100000 to level the increase.
     * @param   _makerAddr  Maker address of the trade
     * @param   _takerAddr  Taker address of the trade
     * @param   _tradePairId  TradePair Id
     * @param   _makerRate  tradepair's default maker rate uint8 and < 100
     * @param   _takerRate  tradepair's default taker rate uint8 and < 100
     * @return   maker tradepair's default maker rate or discounted rate if any
     * @return   taker tradepair's default taker rate or discounted rate if any
     */
    function getRates(
        address _makerAddr,
        address _takerAddr,
        bytes32 _tradePairId,
        uint256 _makerRate,
        uint256 _takerRate
    ) external view override returns (uint256 maker, uint256 taker) {
        if (adminAccountsForRates[_makerAddr] || _makerRate == 0) {
            maker = 0;
        } else {
            Rates storage rates = rateOverrides[_makerAddr][_tradePairId];
            if (rates.tradePairId != bytes32(0) && rates.makerRate != 255) {
                maker = uint256(rates.makerRate) * 10;
            } else {
                Rebates storage rebate = rebates[_makerAddr];
                if (rebate.maker > 0) {
                    maker = (_makerRate * (100 - rebate.maker)) / 10; // max value is going to be 3 digits
                } else {
                    maker = _makerRate * 10;
                }
            }
        }

        if (adminAccountsForRates[_takerAddr] || _takerRate == 0) {
            taker = 0;
        } else {
            Rates storage rates = rateOverrides[_takerAddr][_tradePairId];
            if (rates.tradePairId != bytes32(0) && rates.takerRate != 255) {
                taker = uint256(rates.takerRate) * 10;
            } else {
                Rebates storage rebate = rebates[_takerAddr];
                if (rebate.taker > 0) {
                    taker = (_takerRate * (100 - rebate.taker)) / 10;
                    if (taker < minTakerRate) {
                        taker = minTakerRate; // taker rate can't be less than 0.005%
                    }
                } else {
                    taker = _takerRate * 10;
                }
            }
        }
    }
}
