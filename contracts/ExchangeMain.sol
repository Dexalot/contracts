// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
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
    bytes32 public constant VERSION = bytes32("2.2.3");

    // price feed contract address from Chainlink Oracle set externally with setPriceFeed as part of deployment
    AggregatorV3Interface internal priceFeed;
    IMainnetRFQ internal mainnetRfq;

    event CoinFlipped(uint80 roundid, int256 price, bool outcome);

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

    /**
     * @notice  sets Chainlink price feed contract address
     * @dev  refer to Chainlink documentation at https://docs.chain.link/data-feeds/price-feeds/addresses
     * @param  _address  address of the price feed contract
     */
    function setPriceFeed(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
        priceFeed = AggregatorV3Interface(_address);
    }

    /**
     * @return  AggregatorV3Interface  price feed contract
     */
    function getPriceFeed() external view returns (AggregatorV3Interface) {
        return priceFeed;
    }

    //========== AUCTION ADMIN FUNCTIONS ==================

    /**
     * @notice  Add new token to portfolio
     * @dev     Exchange needs to be DEFAULT_ADMIN on the Portfolio
     * @param   _symbol  symbol of the token
     * @param   _tokenaddress  address of the token
     * @param   _srcChainId  Source Chain Symbol of the virtual token only. Otherwise it is overridden by
     * the current chainid
     * @param   _decimals  decimals of the token
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT
     * @param   _isVirtual  Token to facilitate for Cross Chain Trades
     */
    function addToken(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        uint256 _fee,
        uint256 _gasSwapRatio,
        bool _isVirtual
    ) external onlyRole(AUCTION_ADMIN_ROLE) {
        IPortfolioMain(address(portfolio)).addToken(
            _symbol,
            _tokenaddress,
            _srcChainId,
            _decimals,
            _fee,
            _gasSwapRatio,
            _isVirtual
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

    /**
     * @notice  returns true/false = head/tail based on the latest AVAX/USD price
     * @return  r  the round id parameter from Chainlink price feed
     * @return  p  price of AVAX for this round id
     * @return  o  outcome of the coin flip
     */
    function isHead() public view onlyRole(AUCTION_ADMIN_ROLE) returns (uint80 r, int256 p, bool o) {
        (r, p, , , ) = priceFeed.latestRoundData(); // example answer: 7530342847
        int256 d1 = (p % 1000000) / 100000; // get 6th digit from right, d1=3 for example
        int256 d2 = (p % 10000000) / 1000000; // get 7th digit from right, d2=0 for example
        o = d1 > d2; // head if d1>d2, 3>0=True=Heads for example
    }

    /**
     * @notice  emits coin flip results based on the latest AVAX/USD price
     * @dev  Randomized Auction Closing Sequence uses this function to randomly decide when to close an ongoing
     * auction after the specified auction end time is reached. It is to protect the auction participants against
     * gaming during the auction process. For example entering/canceling big orders seconds before a predetermined
     * auction end time may significantly impact the auction price. So we introduced randomness after the predetermined
     * auction end time. Our off-chain application first randomly picks the number of heads (2-n) that it requires
     * before closing the auction. Then it calls this function at random intervals (3-10 min) until it reaches
     * its target. Nobody, including us to some extent, has control over the effective auction close time.
     * We chose 6th-7th digits of the Oracle provided average AVAX/USD price to avoid manipulation.
     * We realize that this is only Pseudo-randomness and is derived from seemingly predictable market prices but it
     * effectively serves its purpose because there are enough additional other randomness (i.e randomly picking the
     * number of heads) controlled by the offchain application that is not visible to the public
     */
    function flipCoin() external {
        (uint80 r, int256 p, bool o) = isHead();
        emit CoinFlipped(r, p, o);
    }
}
