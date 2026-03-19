// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./library/UtilsLibrary.sol";

import "./interfaces/IPortfolioSub.sol";

import "./Exchange.sol";
import "./OrderBooks.sol";
import "./interfaces/ITradePairs.sol";

/**
 * @title Dexalot L1 Exchange
 * @notice This contract is the Dexalot L1 version of the Dexalot Exchange. \
 * *********** Dexalot Discovery (DD) Auction: Overview and Workflow \
 * Dexalot Discovery (DD) is a specialized launchpad mechanism on the Dexalot L1 designed to facilitate new token launches.
 * By utilizing an Omni-Vault and an off-chain Omni-Trader, projects can provide initial liquidity and manage price discovery through
 * automated bonding curves. \
 * *** Core Objectives: \
 * The smart contract logic focuses on two primary goals: \
 * Asset Control: Restricting the movement (withdrawals/transfers) of the auction token to prevent external market distortion
 * (e.g., rogue AMM pools). \
 * Order Book Integrity: Limiting order "posting" (market making) exclusively to the Omni-Vault to ensure a controlled discovery process. \
 * *** The Launch Process: \
 * Setup: Once Dexalot admins approve an Omni-Vault request, the token is added to the PortfolioMain, and initial liquidity is deposited
 * into the L1 vault. \
 * Omni-Trader Assignment: An off-chain component is assigned to the project to manage prices and quantities based on predefined bonding
 * curves and real-time supply/demand. \
 * Active Auction: While the auction is OPEN, the Omni-Trader is the sole market maker. Participants cannot post their own limit orders;
 * they can only trade against the Omni-Trader’s existing bids and asks (hitting the bid or lifting the ask). \

 * Graduation: Once the token reaches a specific market cap milestone, the order book transitions to a standard open market where all
 * users can post orders and transfer tokens freely. \
 * *** Auction Stages & Transitions: \
 * Stage 1:    OPEN         Controlled Discovery. Only the Omni-Vault can post orders. Users trade via Limit IOC (Immediate-or-Cancel)
 *                          orders against the vault. Withdrawals/transfers are disabled. \
 * Stage 1A:   LIVETRADING  Early Trading (Optional). Anyone can post orders or market make, but the token remains locked within the
 *                          Dexalot ecosystem (no withdrawals/transfers). \
 * Stage 2:    OFF          Full Graduation. The auction concludes. The token is available for regular trading and Simple Swaps.
 *                          All transfer and withdrawal restrictions are lifted. The pair will also be offered in Simple Swap \
 * @dev
 * *** Security & Integration: \
 * Privileged Access: The AUCTION_ADMIN manages transitions, while ExchangeSub holds administrative rights over portfolio and
 * trading pairs to ensure smooth operation. \
 * Trusted Deposits: To facilitate pre-sale participants, specific contracts (like Avalaunch or Dexalot TokenVesting) are
 * authorized to deposit tokens on behalf of users before the Token Generation Event (TGE). \
 * Anti-Manipulation: By disabling transfers during the auction, Dexalot prevents the formation of external liquidity pools
 * that could interfere with fair price discovery. \
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract ExchangeSub is Exchange {
    // version
    bytes32 public constant VERSION = bytes32("2.3.0");

    // map and array of all trading pairs on DEXALOT
    ITradePairs private tradePairs;
    OrderBooks private orderBooks;
    event TradePairsSet(ITradePairs _oldTradePairs, ITradePairs _newTradePairs);

    /**
     * @notice  (Un)pauses portfolioSub and portfolioBridgeSub and TradePairs contracts for upgrade
     * @param   _pause  true to pause, false to unpause
     */
    function pauseForUpgrade(bool _pause) external override {
        pausePortfolio(_pause);
        pauseTrading(_pause);
    }

    /**
     * @notice  Set the address of the OrderBooks contract
     * @dev     Needed to initiate match auction orders
     * @param   _orderbooks  Address of the OrderBooks contract
     */
    function setOrderBooks(address _orderbooks) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_orderbooks != address(0), "E-OIZA-01");
        orderBooks = OrderBooks(_orderbooks);
    }

    /**
     * @notice  Gest the address of the OrderBooks contract
     * @return  address  Address of the OrderBooks contract
     */
    function getOrderBooks() external view returns (address) {
        return address(orderBooks);
    }

    /**
     * @notice  Sets trade pairs contract
     * @param   _tradePairs  address of the trade pairs contract
     */
    function setTradePairs(ITradePairs _tradePairs) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit TradePairsSet(tradePairs, _tradePairs);
        tradePairs = _tradePairs;
    }

    /**
     * @return  ITradePairs  trade pairs contract
     */
    function getTradePairsAddr() external view returns (ITradePairs) {
        return tradePairs;
    }

    /**
     * @notice  Un(pause) all trading functionality for all pairs
     * @dev     No new orders or cancellations allowed
     * @param   _tradingPause  true to pause trading, false to unpause
     */
    function pauseTrading(bool _tradingPause) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_tradingPause) {
            if (!PausableUpgradeable(address(tradePairs)).paused()) {
                tradePairs.pause();
            }
        } else {
            if (PausableUpgradeable(address(tradePairs)).paused()) {
                tradePairs.unpause();
            }
        }
    }

    /**
     * @notice  Un(pause) all trading functionality for a trade pair. Affects both addorder and cancelorder functions.
     * @param   _tradePairId  id of the trading pair
     * @dev     No new orders or cancellations allowed for the given pair
     * @param   _tradePairPause  true to pause trading, false to unpause
     */
    function pauseTradePair(bytes32 _tradePairId, bool _tradePairPause) external {
        ITradePairs.AuctionMode mode = tradePairs.getTradePair(_tradePairId).auctionMode;
        if (mode == ITradePairs.AuctionMode.OFF) {
            require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-02");
        } else {
            require(hasRole(AUCTION_ADMIN_ROLE, msg.sender), "E-OACC-03");
        }
        tradePairs.pauseTradePair(_tradePairId, _tradePairPause);
    }

    /**
     * @notice  Update all commissions rates of all trading pairs all at once
     * @param   _makerRate  maker fee rate
     * @param   _takerRate  taker fee rate
     */
    function updateAllRates(uint8 _makerRate, uint8 _takerRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32[] memory pairs = tradePairs.getTradePairs();
        for (uint256 i = 0; i < pairs.length; i++) {
            tradePairs.updateRate(pairs[i], _makerRate, ITradePairs.RateType.MAKER);
            tradePairs.updateRate(pairs[i], _takerRate, ITradePairs.RateType.TAKER);
        }
    }

    //========== AUCTION ADMIN FUNCTIONS ==================

    /**
     * @notice  Add new token to portfolio
     * @dev     Exchange needs to be DEFAULT_ADMIN on the Portfolio
     * @param   _srcChainSymbol  Source Chain Symbol of the token
     * @param   _tokenaddress  address of the token
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  decimals of the token
     * @param   _l1Decimals  decimals of the token on Dexalot L1
     * @param   _mode  starting auction mode
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT
     * @param   _subnetSymbol  Subnet Symbol of the token
     */
    function addToken(
        bytes32 _srcChainSymbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        uint8 _l1Decimals,
        ITradePairs.AuctionMode _mode,
        uint256 _fee,
        uint256 _gasSwapRatio,
        bytes32 _subnetSymbol
    ) external onlyRole(AUCTION_ADMIN_ROLE) {
        IPortfolioSub(address(portfolio)).addToken(
            _srcChainSymbol,
            _tokenaddress,
            _srcChainId,
            _decimals,
            _l1Decimals,
            _mode,
            _fee,
            _gasSwapRatio,
            _subnetSymbol
        );
    }

    /**
     * @notice  Adds a new trading pair to the exchange.
     * @dev     Both the base and quote symbol must exist in the PortfolioSub otherwise it will revert.
     * Both `DEFAULT_ADMIN_ROLE` and `AUCTION_ADMIN_ROLE` can add a new trading pair.
     * @param   _tradePairId  id of the new trading pair
     * @param   _baseSymbol  symbol of the base token
     * @param   _baseDisplayDecimals  display decimals of the base token
     * @param   _quoteSymbol  symbol of the quote token
     * @param   _quoteDisplayDecimals  display decimals of the quote token
     * @param   _minTradeAmount  minimum trade amount
     * @param   _maxTradeAmount  maximum trade amount
     * @param   _mode  auction mode
     */
    function addTradePair(
        bytes32 _tradePairId,
        bytes32 _baseSymbol,
        uint8 _baseDisplayDecimals,
        bytes32 _quoteSymbol,
        uint8 _quoteDisplayDecimals,
        uint256 _minTradeAmount,
        uint256 _maxTradeAmount,
        ITradePairs.AuctionMode _mode
    ) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(AUCTION_ADMIN_ROLE, msg.sender), "E-OACC-01");

        checkMirrorPair(_baseSymbol, _quoteSymbol);

        IPortfolio.TokenDetails memory baseTokenDetails = portfolio.getTokenDetails(_baseSymbol);
        IPortfolio.TokenDetails memory quoteTokenDetails = portfolio.getTokenDetails(_quoteSymbol);
        require(
            baseTokenDetails.decimals >= _baseDisplayDecimals && quoteTokenDetails.decimals >= _quoteDisplayDecimals,
            "E-TNAP-01"
        );
        require(
            baseTokenDetails.auctionMode == _mode && quoteTokenDetails.auctionMode == ITradePairs.AuctionMode.OFF,
            "E-TNSA-01"
        );

        tradePairs.addTradePair(
            _tradePairId,
            baseTokenDetails,
            _baseDisplayDecimals,
            quoteTokenDetails,
            _quoteDisplayDecimals,
            _minTradeAmount,
            _maxTradeAmount,
            _mode
        );
    }

    /**
     * @notice  Checks to see if a mirror pair exists
     * @dev     Checks to see if USDC/AVAX exists when trying to add AVAX/USDC
     * Mirror pairs are not allowed to avoid confusion from a user perspective.
     * @param   _baseSymbol  base Symbol of the pair to be added
     * @param   _quoteSymbol  quote Symbol of the pair to be added
     */
    function checkMirrorPair(bytes32 _baseSymbol, bytes32 _quoteSymbol) private view {
        bytes32 mirrorPairId = UtilsLibrary.stringToBytes32(
            string(
                abi.encodePacked(
                    UtilsLibrary.bytes32ToString(_quoteSymbol),
                    "/",
                    UtilsLibrary.bytes32ToString(_baseSymbol)
                )
            )
        );
        require(tradePairs.getTradePair(mirrorPairId).baseSymbol == "", "T-MPNA-01");
    }

    /**
     * @notice  Sets auction mode for a trading pair and its basetoken in the PortfolioSUb.
     * @param   _tradePairId  id of the trading pair
     * @param   _mode  auction mode
     */
    function setAuctionMode(bytes32 _tradePairId, ITradePairs.AuctionMode _mode) external onlyRole(AUCTION_ADMIN_ROLE) {
        ITradePairs.AuctionMode mode = tradePairs.getTradePair(_tradePairId).auctionMode;
        require(mode != ITradePairs.AuctionMode.OFF, "E-OACC-04");
        tradePairs.setAuctionMode(_tradePairId, _mode);
    }

    /**
     * @notice  Update maker and taker fee rates for execution
     * @param   _tradePairId  id of the trading pair
     * @param   _rate   fee rate
     * @param   _rateType  rate type, maker or taker
     */
    function updateRate(
        bytes32 _tradePairId,
        uint8 _rate,
        ITradePairs.RateType _rateType
    ) external onlyRole(AUCTION_ADMIN_ROLE) {
        ITradePairs.AuctionMode mode = tradePairs.getTradePair(_tradePairId).auctionMode;
        require(mode != ITradePairs.AuctionMode.OFF, "E-OACC-04");
        tradePairs.updateRate(_tradePairId, _rate, _rateType);
    }

    /**
     * @notice  Update maker and taker fee rates for execution
     * @param   _tradePairId  id of the trading pair
     * @param   _makerRate  maker fee rate
     * @param   _takerRate  taker fee rate
     */
    function updateRates(
        bytes32 _tradePairId,
        uint8 _makerRate,
        uint8 _takerRate
    ) external onlyRole(AUCTION_ADMIN_ROLE) {
        ITradePairs.AuctionMode mode = tradePairs.getTradePair(_tradePairId).auctionMode;
        require(mode != ITradePairs.AuctionMode.OFF, "E-OACC-04");
        tradePairs.updateRate(_tradePairId, _makerRate, ITradePairs.RateType.MAKER);
        tradePairs.updateRate(_tradePairId, _takerRate, ITradePairs.RateType.TAKER);
    }

    /**
     * @notice  Sets the OmniVault address that will run the auction
     * @param   _tradePairId  id of the trading pair
     * @param   _omniVaultAdress  omniVault address
     */
    function setAuctionVaultAdress(
        bytes32 _tradePairId,
        address _omniVaultAdress
    ) external onlyRole(AUCTION_ADMIN_ROLE) {
        ITradePairs.AuctionMode mode = tradePairs.getTradePair(_tradePairId).auctionMode;
        require(mode != ITradePairs.AuctionMode.OFF, "E-OACC-04");
        tradePairs.setAuctionVaultAdress(_tradePairId, _omniVaultAdress);
    }

    /**
     * @notice  Sets minimum trade amount for a trade pair
     * @param   _tradePairId  id of the trading pair
     * @param   _minTradeAmount  minimum trade amount
     */
    function setMinTradeAmount(bytes32 _tradePairId, uint256 _minTradeAmount) external onlyRole(AUCTION_ADMIN_ROLE) {
        ITradePairs.AuctionMode mode = tradePairs.getTradePair(_tradePairId).auctionMode;
        require(mode != ITradePairs.AuctionMode.OFF, "E-OACC-04");
        tradePairs.setMinTradeAmount(_tradePairId, _minTradeAmount);
    }

    /**
     * @param   _tradePairId  id of the trading pair
     * @return  uint256  minimum trade amount
     */
    function getMinTradeAmount(bytes32 _tradePairId) external view returns (uint256) {
        return tradePairs.getTradePair(_tradePairId).minTradeAmount;
    }

    /**
     * @notice  Sets maximum trade amount for a trade pair
     * @param   _tradePairId  id of the trading pair
     * @param   _maxTradeAmount  maximum trade amount
     */
    function setMaxTradeAmount(bytes32 _tradePairId, uint256 _maxTradeAmount) external onlyRole(AUCTION_ADMIN_ROLE) {
        ITradePairs.AuctionMode mode = tradePairs.getTradePair(_tradePairId).auctionMode;
        require(mode != ITradePairs.AuctionMode.OFF, "E-OACC-04");
        tradePairs.setMaxTradeAmount(_tradePairId, _maxTradeAmount);
    }

    /**
     * @param   _tradePairId  id of the trading pair
     * @return  uint256  maximum trade amount
     */
    function getMaxTradeAmount(bytes32 _tradePairId) external view returns (uint256) {
        return tradePairs.getTradePair(_tradePairId).maxTradeAmount;
    }
}
