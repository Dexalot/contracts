// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "./OmniVaultExecutor.sol";
import "../interfaces/IPortfolioSub.sol";
import "../interfaces/IOmniVaultExecutorSub.sol";

/**
 * @title OmniVaultExecutorSub
 * @notice The OmniVaultExecutorSub extends the OmniVaultExecutor to provide additional functionalities specific to
 *         OmniVault operations. It allows the OmniVaultManager to dispatch assets, collects swap fees from mainnet
 *         swaps, and manages gas top-ups for the trading bot. This contract interacts with the PortfolioSub contract
 *         to facilitate asset transfers and fee management.
 */
contract OmniVaultExecutorSub is OmniVaultExecutor, IOmniVaultExecutorSub {
    address public omniVaultManager;
    // Treasury address (future replaced by feeManager contract)
    address public feeManager;

    // Weekly gas topup amount for the trading bot
    uint256 public gasTopupAmount;
    // Timestamp of the previous gas topup
    uint256 public prevGasTopupTs;

    // Storage gap for upgradability
    bytes32[50] private __gap;

    /**
     * @notice Dispatches assets from the OmniVaultExecutor to a specified recipient
     * @dev Only callable by the OmniVaultManager contract
     * @param recipient The address to receive the assets
     * @param tokens An array of token symbols to be dispatched
     * @param amounts An array of amounts corresponding to each token symbol
     */
    function dispatchAssets(address recipient, bytes32[] calldata tokens, uint256[] calldata amounts) external {
        require(msg.sender == omniVaultManager, "VE-SNVM-01");
        IPortfolioSub(portfolio).bulkTransferTokens(address(this), recipient, tokens, amounts);
    }

    /**
     * @notice Collects swap fees from mainnet swaps and transfers them to the fee manager
     * @dev Only callable by addresses with the OMNITRADER_ROLE
     * @param feeSymbol The symbol of the fee token
     * @param swapIds An array of swap IDs for which fees are being collected
     * @param fees An array of fee amounts corresponding to each swap ID
     */
    function collectSwapFees(
        bytes32 feeSymbol,
        uint256[] calldata swapIds,
        uint256[] calldata fees
    ) external onlyRole(OMNITRADER_ROLE) {
        uint256 len = fees.length;
        require(len == swapIds.length, "VE-IVAL-01");
        require(feeManager != address(0), "VE-FMNS-01");
        uint256 totalFee;
        for (uint256 i = 0; i < len; i++) {
            totalFee += fees[i];
        }
        IPortfolioSub(portfolio).transferToken(feeManager, feeSymbol, totalFee);
        emit SwapFeesCollected(feeSymbol, swapIds, fees);
    }

    /**
     * @notice Tops up gas for the trading bot on a weekly basis
     * @dev Only callable by addresses with the OMNITRADER_ROLE
     */
    function topupGas() external onlyRole(OMNITRADER_ROLE) {
        require(prevGasTopupTs + 7 days < block.timestamp, "VE-TETG-01");
        prevGasTopupTs = block.timestamp;
        uint256 topupAmount = gasTopupAmount;
        (bool success, ) = msg.sender.call{value: topupAmount}("");
        require(success, "VE-FNGT-01");
        emit GasTopup(block.timestamp, topupAmount);
    }

    /**
     * @notice Sets the OmniVaultManager contract address
     * @param _omniVaultManager The address of the OmniVaultManager contract
     */
    function setOmniVaultManager(address _omniVaultManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_omniVaultManager != address(0), "VE-SAZ-01");
        address oldManager = omniVaultManager;
        omniVaultManager = _omniVaultManager;
        emit AddressUpdate("OmniVaultManager", oldManager, _omniVaultManager);
    }

    /**
     * @notice Sets the weekly gas topup amount for the trading bot
     * @param _amount The amount of gas to top up weekly
     */
    function setGasTopupAmount(uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldAmount = gasTopupAmount;
        gasTopupAmount = _amount;
        emit SetGasTopupValue(oldAmount, _amount);
    }

    /**
     * @notice Sets the fee manager address
     */
    function setFeeManager() external onlyRole(DEFAULT_ADMIN_ROLE) {
        address oldFeeManager = feeManager;
        feeManager = IPortfolioSub(portfolio).feeAddress();
        emit AddressUpdate("FeeManager", oldFeeManager, feeManager);
    }

    function VERSION() external pure virtual override returns (bytes32) {
        return bytes32("1.1.0");
    }
}
