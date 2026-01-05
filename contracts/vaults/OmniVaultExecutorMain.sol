// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "./OmniVaultExecutor.sol";
import "../interfaces/IOmniVault.sol";
import "../interfaces/IPortfolioMain.sol";

/**
 * @title OmniVaultExecutorMain
 * @notice The OmniVaultExecutorMain contract extends the OmniVaultExecutor to interact with the OmniVault on mainnets.
 *         It allows settling transfers of deposits and withdrawals in the OmniVault.
 */
contract OmniVaultExecutorMain is OmniVaultExecutor {
    IPortfolioMain public portfolioMain;

    function depositToken(
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge,
        uint256 _bridgeFee
    ) external onlyRole(OMNITRADER_ROLE) {
        portfolioMain.depositToken{value: _bridgeFee}(address(this), _symbol, _quantity, _bridge);
    }

    function setPortfolioMain(address _portfolioMain) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_portfolioMain != address(0), "OT-SAZ-01");
        portfolioMain = IPortfolioMain(_portfolioMain);
    }

    function VERSION() external pure virtual override returns (bytes32) {
        return bytes32("1.0.3");
    }
}
