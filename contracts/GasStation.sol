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
    bytes32 public constant VERSION = bytes32("2.2.0");

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SWAPPER_ROLE = keccak256("SWAPPER_ROLE");

    uint256 public gasAmount; // Swapper contract should check this field as quote

    event GasAmountChanged(uint256 amount);
    event GasRequested(address indexed to, uint256 amount);

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Grant admin and pauser role to the sender. Grant swapper role to swapper (portfolio) contract.
     * 0.1 ALOT gas is hardcoded at initialization to be distributed to the users which is enough for roughly
     * 25 orders + 25 cancels
     * @param   _swapper  Address of the swapper contract (PortfolioSub in our case)
     */
    function initialize(address _swapper) public initializer {
        __Pausable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(SWAPPER_ROLE, _swapper);
        gasAmount = 10 * 10 ** 16; // 0.1 ALOT (max gas deposit amount to User's subnet wallet)
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
     * @notice  Swapper contract will request gas after depositing equal amount of token transferred to our EOA
     * @dev     Only swapper (Portfolio Sub) can request gas
     * @param   _to  Address of the user to receive gas
     * @param   _amount  Amount of Gas requested
     */
    function requestGas(address _to, uint256 _amount) external onlyRole(SWAPPER_ROLE) whenNotPaused nonReentrant {
        require(_to != address(0), "GS-ZADDR-01");
        require(_amount <= gasAmount, "GS-ASBTZ-04");
        // solhint-disable-next-line avoid-low-level-calls
        (bool sent, ) = _to.call{value: _amount}("");
        require(sent, "GS-FAIL-01");
        emit GasRequested(_to, _amount);
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
