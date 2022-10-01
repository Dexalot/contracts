// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

/**
 * @title Native token treasury
 * @notice This contract swaps other tokens with subnet native coin to send users native coin for gas.
 * It receives native coin and only sends out to the low balanced users via PortfolioSub.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract GasStation is
    Initializable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant VERSION = bytes32("2.1.0");

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SWAPPER_ROLE = keccak256("SWAPPER_ROLE");

    uint256 public gasAmount; // Swapper contract should check this field as quote

    event GasAmountChanged(uint256 amount);
    event GasRequested(address indexed to, uint256 amount);

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Grant admin and pauser role to the sender. Grant swapper role to swapper (portfolio) contract
     * @param   _swapper  Address of the swapper contract (PortfolioSub in our case)
     * @param   _gasAmount  Amount of gas to be distrubuted to the users
     */
    function initialize(address _swapper, uint256 _gasAmount) public initializer {
        require(_gasAmount > 0, "GS-ASBTZ-01");
        __Pausable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(SWAPPER_ROLE, _swapper);

        gasAmount = _gasAmount;
    }

    /**
     * @notice  Pauses gas distribution
     * @dev     Only pauser can pause
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice  Unpauses gas distribution
     * @dev     Only pauser can unpause
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice  Set gas amount to be distributed to the users
     * @dev     Only admin can set gas amount
     * @param   _gasAmount  New gas amount
     */
    function setGasAmount(uint256 _gasAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_gasAmount > 0, "GS-ASBTZ-02");
        gasAmount = _gasAmount;
        emit GasAmountChanged(gasAmount);
    }

    /**
     * @notice  Swapper contract will request gas after depositing bridge fee to our EOA
     * @dev     Only swapper (Portfolio Sub) can request gas
     * @param   _to  Address of the user to receive gas
     */
    function requestGas(address _to) external onlyRole(SWAPPER_ROLE) whenNotPaused nonReentrant {
        // nonReentrant ?
        // solhint-disable-next-line avoid-low-level-calls
        (bool sent, ) = _to.call{value: gasAmount}("");
        require(sent, "GS-FAIL-01");
        emit GasRequested(_to, gasAmount);
    }

    /**
     * @notice  Withdraws native alot from the contract
     * @dev     Only admin can withdraw
     * @param   _amount  Amount of alot to withdraw
     */
    function withdrawNative(uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(_amount > 0, "GS-ASBTZ-03");
        // solhint-disable-next-line avoid-low-level-calls
        (bool sent, ) = (msg.sender).call{value: _amount}("");
        require(sent, "GS-FAIL-02");
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    /**
     * @dev we revert transaction if a non-existing function is called
     */
    fallback() external payable {
        revert("GS-NFUN-01");
    }
}
