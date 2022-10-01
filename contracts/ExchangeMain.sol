// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "./Exchange.sol";

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
    bytes32 public constant VERSION = bytes32("2.1.0");
    // price feed from chainlink oracle
    AggregatorV3Interface internal priceFeed;

    event CoinFlipped(uint80 roundid, int256 price, bool outcome);

    /**
     * @notice  Initializer for upgradeable contract.
     * @dev     Sets Chainlink price feed address.
     */
    function initialize() public override initializer {
        super.initialize();
        // initialize AVAX/USD price feed with fuji testnet contract,
        // for production deployment it needs to be updated with setPriceFeed function
        // heart-beat = 2m, decimals = 8
        priceFeed = AggregatorV3Interface(0x5498BB86BC934c8D34FDA08E81D444153d0D06aD);
    }

    /**
     * @notice  (Un)pauses portoflioMain and portfolioBridgeMain for upgrade
     * @param   _pause  true to pause, false to unpause
     */
    function pauseForUpgrade(bool _pause) external override {
        pausePortfolio(_pause);
    }

    //========== AUCTION ADMIN FUNCTIONS ==================

    /**
     * @notice  Sets Chainlink price feed address.
     * @param   _address  address of the price feed contract
     */
    function setPriceFeed(address _address) external onlyRole(AUCTION_ADMIN_ROLE) {
        priceFeed = AggregatorV3Interface(_address);
    }

    /**
     * @return  AggregatorV3Interface  price feed contract
     */
    function getPriceFeed() external view returns (AggregatorV3Interface) {
        return priceFeed;
    }

    /**
     * @notice  returns true/false = head/tail based on the latest AVAX/USD price
     * @return  r  the round id parameter from Chainlink price feed
     * @return  p  price of AVAX for this round id
     * @return  o  outcome of the coin flip
     */
    function isHead()
        public
        view
        onlyRole(AUCTION_ADMIN_ROLE)
        returns (
            uint80 r,
            int256 p,
            bool o
        )
    {
        (r, p, , , ) = priceFeed.latestRoundData(); // example answer: 7530342847
        int256 d1 = (p % 1000000) / 100000; // get 6th digit from right, d1=3 for example
        int256 d2 = (p % 10000000) / 1000000; // get 7th digit from right, d2=0 for example
        o = d1 > d2; // head if d1>d2, 3>0=True=Heads for example
    }

    /**
     * @notice  emits coin flip results based on the latest AVAX/USD price
     */
    function flipCoin() external {
        (uint80 r, int256 p, bool o) = isHead();
        emit CoinFlipped(r, p, o);
    }
}
