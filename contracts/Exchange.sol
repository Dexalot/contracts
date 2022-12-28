// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "./library/UtilsLibrary.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/ITradePairs.sol";

/**
 * @title Abstract contract to be inherited in ExchangeMain and ExchangeSub
 * @notice Exchange is an administrative wrapper contract that provides different access levels
 * using [OpenZeppelin](https://www.openzeppelin.com) AccessControl roles.
 * Currently it has DEFAULT_ADMIN_ROLE and AUCTION_ADMIN_ROLE.
 * @dev Exchange is DEFAULT_ADMIN to all Portfolio implementation contracts and TradePairs contract.
 * Exchange is also the AuctionManager using AUCTION_ADMIN_ROLE.
 * Auction Admin Functions can only be invoked from the Exchange contracts.
 * All the functions pertaining to Auction can also be called directly in
 * TradePairs and Portfolio using DEFAULT_ADMIN_ROLE but not recommended because certain
 * actions require a synchronized update to both Portfolio and TradePairs contracts.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

abstract contract Exchange is Initializable, AccessControlEnumerableUpgradeable {
    // portfolio reference
    IPortfolio internal portfolio;

    // auction admin role
    bytes32 public constant AUCTION_ADMIN_ROLE = keccak256("AUCTION_ADMIN_ROLE");

    event PortfolioSet(IPortfolio _oldPortfolio, IPortfolio _newPortfolio);
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Grants admin role to the deployer.
     */
    function initialize() public virtual initializer {
        __AccessControlEnumerable_init();
        // initialize deployment account to have DEFAULT_ADMIN_ROLE
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice  Adds Default Admin role to the address
     * @param   _address  address to add role to
     */
    function addAdmin(address _address) public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RoleUpdated("EXCHANGE", "ADD-ROLE", DEFAULT_ADMIN_ROLE, _address);
        grantRole(DEFAULT_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Removes Default Admin role from the address
     * @param   _address  address to remove role from
     */
    function removeAdmin(address _address) public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        require(getRoleMemberCount(DEFAULT_ADMIN_ROLE) > 1, "E-ALOA-01");
        emit RoleUpdated("EXCHANGE", "REMOVE-ROLE", DEFAULT_ADMIN_ROLE, _address);
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
    }

    /**
     * @param   _address  address to check
     * @return  bool    true if address has Default Admin role
     */
    function isAdmin(address _address) public view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Adds Auction Admin role to the address
     * @param   _address  address to add role to
     */
    function addAuctionAdmin(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RoleUpdated("EXCHANGE", "ADD-ROLE", AUCTION_ADMIN_ROLE, _address);
        grantRole(AUCTION_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Removes Auction Admin role from the address
     * @param   _address  address to remove role from
     */
    function removeAuctionAdmin(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RoleUpdated("EXCHANGE", "REMOVE-ROLE", AUCTION_ADMIN_ROLE, _address);
        revokeRole(AUCTION_ADMIN_ROLE, _address);
    }

    /**
     * @param   _address  address to check
     * @return  bool  true if address has Auction Admin role
     */
    function isAuctionAdmin(address _address) external view returns (bool) {
        return hasRole(AUCTION_ADMIN_ROLE, _address);
    }

    /**
     * @notice  Set portfolio address
     * @param   _portfolio  address of portfolio contract
     */
    function setPortfolio(IPortfolio _portfolio) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit PortfolioSet(portfolio, _portfolio);
        portfolio = _portfolio;
    }

    /**
     * @return  IPortfolio  portfolio contract
     */
    function getPortfolio() external view returns (IPortfolio) {
        return portfolio;
    }

    /**
     * @notice  (Un)pause portfolio operations
     * @dev     This also includes deposit/withdraw processes
     * @param   _pause  true to pause, false to unpause
     */
    function pausePortfolio(bool _pause) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_pause) {
            portfolio.pause();
        } else {
            portfolio.unpause();
        }
    }

    /**
     * @notice  Implemented in the child contract, as the logic differs.
     * @param   _pause  true to pause, false to unpause
     */
    function pauseForUpgrade(bool _pause) external virtual;

    // solhint-disable-next-line payable-fallback
    fallback() external {
        revert("E-NFUN-01");
    }

    /**
     * @dev     utility function to convert string to bytes32
     * @param   _string  string to convert
     * @return  result  bytes32 representation of the string
     */
    function stringToBytes32(string memory _string) public pure returns (bytes32 result) {
        return UtilsLibrary.stringToBytes32(_string);
    }

    /**
     * @dev     utility function to convert bytes32 to string
     * @param   _bytes32  bytes32 to convert
     * @return  string  string representation of the bytes32
     */
    function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
        return UtilsLibrary.bytes32ToString(_bytes32);
    }

    //========== AUCTION ADMIN FUNCTIONS ==================

    /**
     * @notice  Add new token to portfolio
     * @dev     Exchange needs to be DEFAULT_ADMIN on the Portfolio
     * @param   _symbol  symbol of the token
     * @param   _tokenaddress  address of the token
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  decimals of the token
     * @param   _mode  starting auction mode
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT
     */
    function addToken(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode,
        uint256 _fee,
        uint256 _gasSwapRatio
    ) external onlyRole(AUCTION_ADMIN_ROLE) {
        portfolio.addToken(_symbol, _tokenaddress, _srcChainId, _decimals, _mode, _fee, _gasSwapRatio);
    }
}
