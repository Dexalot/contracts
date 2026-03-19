// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./interfaces/IPortfolioMain.sol";
import "./Exchange.sol";
import "./interfaces/IMainnetRFQ.sol";

/**
 * @title Mainnet Exchange
 * @notice This contract is the mainnet version of the Dexalot Exchange.
 * @dev ExchangeMain is DEFAULT_ADMIN to PortfolioMain contract.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract ExchangeMain is Exchange {
    // version
    bytes32 public constant VERSION = bytes32("2.3.0");

    // price feed contract address from Chainlink Oracle set externally with setPriceFeed as part of deployment
    address internal priceFeed; //Obsolete as of Jan 1, 2026
    IMainnetRFQ internal mainnetRfq;

    /**
     * @notice  (Un)pauses portfolioMain, portfolioBridgeMain & MainnetRFQ for upgrade
     * @param   _pause  true to pause, false to unpause
     */
    function pauseForUpgrade(bool _pause) external override {
        pausePortfolio(_pause);
        pauseMainnetRfq(_pause);
    }

    /**
     * @notice  Set MainnetRFQ address
     * @dev     Only admin can set MainnetRFQ address.
     * There is a one to one relationship between MainnetRFQ and ExchangeMain.
     * @param   _mainnetRfq  MainnetRFQ address
     */
    function setMainnetRFQ(address payable _mainnetRfq) external onlyRole(DEFAULT_ADMIN_ROLE) {
        mainnetRfq = IMainnetRFQ(_mainnetRfq);
    }

    /**
     * @return  IMainnetRFQ  MainnetRFQ contract
     */
    function getMainnetRfq() external view returns (IMainnetRFQ) {
        return mainnetRfq;
    }

    /**
     * @notice  (Un)pause pauseMainnetRfq operations
     * @param   _pause  true to pause, false to unpause
     */
    function pauseMainnetRfq(bool _pause) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_pause) {
            if (!PausableUpgradeable(address(mainnetRfq)).paused()) {
                mainnetRfq.pause();
            }
        } else {
            if (PausableUpgradeable(address(mainnetRfq)).paused()) {
                mainnetRfq.unpause();
            }
        }
    }

    //========== AUCTION ADMIN FUNCTIONS ==================

    /**
     * @notice  Add new token to portfolio
     * @dev     Exchange needs to be DEFAULT_ADMIN on the Portfolio
     * @param   _symbol  symbol of the token
     * @param   _tokenaddress  address of the token
     * @param   _decimals  decimals of the token
     * @param   _l1Decimals  decimals of the token on Dexalot L1
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT
     */
    function addToken(
        bytes32 _symbol,
        address _tokenaddress,
        uint8 _decimals,
        uint8 _l1Decimals,
        uint256 _fee,
        uint256 _gasSwapRatio
    ) external onlyRole(AUCTION_ADMIN_ROLE) {
        IPortfolioMain(address(portfolio)).addToken(
            _symbol,
            _tokenaddress,
            _decimals,
            _l1Decimals,
            _fee,
            _gasSwapRatio
        );
    }

    /**
     * @notice  Adds trusted contract to portfolio
     * @dev     Exchange needs to be DEFAULT_ADMIN on the Portfolio
     * @param   _contract  address of trusted contract
     * @param   _name  name of trusted contract
     */
    function addTrustedContract(address _contract, string calldata _name) external onlyRole(AUCTION_ADMIN_ROLE) {
        IPortfolioMain(address(portfolio)).addTrustedContract(_contract, _name);
    }

    /**
     * @param   _contract  address to check
     * @dev     Exchange needs to be DEFAULT_ADMIN on the Portfolio
     * @return  bool  true if contract is trusted
     */
    function isTrustedContract(address _contract) external view returns (bool) {
        return IPortfolioMain(address(portfolio)).isTrustedContract(_contract);
    }

    /**
     * @notice  Removes trusted contract from portfolio
     * @dev     Exchange needs to be DEFAULT_ADMIN on the Portfolio
     * @param   _contract  address of trusted contract
     */
    function removeTrustedContract(address _contract) external onlyRole(AUCTION_ADMIN_ROLE) {
        IPortfolioMain(address(portfolio)).removeTrustedContract(_contract);
    }
}
