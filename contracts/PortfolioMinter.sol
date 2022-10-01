// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./interfaces/INativeMinter.sol";

/**
 * @title Intermediate contract to mint native tokens via NativeTokenMinter precompile.
 * @dev Only this contract is used to mint native tokens via NativeTokenMinter precompile.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioMinter is
    Initializable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant VERSION = bytes32("2.1.0");

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // keep track of the minted native tokens
    uint256 public totalNativeMinted;

    NativeMinterInterface private nativeMinter;

    event Mint(address indexed to, uint256 amount);

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Grant admin and pauser role to the sender. Grant minter role to portfolio and set precompile address
     * @param   _portfolio  Address of the portfolioSub
     * @param   _nativeMinter  Address of the NativeMinter precompile
     */
    function initialize(address _portfolio, address _nativeMinter) public initializer {
        require(_portfolio != address(0), "PM-ZADD-01");
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, _portfolio);

        nativeMinter = NativeMinterInterface(_nativeMinter);
    }

    /**
     * @notice  Pauses minting
     * @dev     Only pauser can pause
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice  Unpauses minting
     * @dev     Only pauser can unpause
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @return  address  Address of the NativeMinter precompile
     */
    function getNativeMinter() external view returns (address) {
        return address(nativeMinter);
    }

    /**
     * @notice  Mints native tokens by calling precompile
     * @dev     Only minter (portfolio) can mint
     * @param   _to  Address to mint to
     * @param   _amount  Amount to mint
     */
    function mint(address _to, uint256 _amount) external virtual onlyRole(MINTER_ROLE) nonReentrant whenNotPaused {
        require(_amount > 0, "PM-ZAMT-01");
        emit Mint(_to, _amount);
        totalNativeMinted += _amount;
        nativeMinter.mintNativeCoin(_to, _amount);
    }

    // solhint-disable-next-line payable-fallback
    fallback() external {
        revert("PM-NFUN-01");
    }
}
