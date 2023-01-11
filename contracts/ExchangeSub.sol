// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./library/UtilsLibrary.sol";

import "./interfaces/IPortfolioSub.sol";

import "./Exchange.sol";
import "./OrderBooks.sol";

/**
 * @title Subnet Exchange
 * @notice This contract is the subnet version of the Dexalot Exchange.
 * It has all the AUCTION_ADMIN functions that can be called.
 * @dev ExchangeSub is DEFAULT_ADMIN on both PortfolioSub and TradePairs contracts.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract ExchangeSub is Exchange {
    // version
    bytes32 public constant VERSION = bytes32("2.2.0");

    // map and array of all trading pairs on DEXALOT
    ITradePairs private tradePairs;
    OrderBooks private orderBooks;
    event TradePairsSet(ITradePairs _oldTradePairs, ITradePairs _newTradePairs);
    event AuctionMatchFinished(bytes32 indexed pair);

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
     * @notice  Un(pause) trading functionality. Affects both addorder and cancelorder functions.
     * @param   _tradingPause  true to pause trading, false to unpause
     */
    function pauseTrading(bool _tradingPause) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_tradingPause) {
            tradePairs.pause();
        } else {
            tradePairs.unpause();
        }
    }

    /**
     * @notice  Un(pause) trading functionality for a trade pair. Affects both addorder and cancelorder functions.
     * @param   _tradePairId  id of the trading pair
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
        tradePairs.addTradePair(
            _tradePairId,
            _baseSymbol,
            _baseDisplayDecimals,
            _quoteSymbol,
            _quoteDisplayDecimals,
            _minTradeAmount,
            _maxTradeAmount,
            _mode
        );
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
     * @notice  Sets auction price
     * @param   _tradePairId  id of the trading pair
     * @param   _price  price
     */
    function setAuctionPrice(bytes32 _tradePairId, uint256 _price) external onlyRole(AUCTION_ADMIN_ROLE) {
        ITradePairs.AuctionMode mode = tradePairs.getTradePair(_tradePairId).auctionMode;
        require(mode != ITradePairs.AuctionMode.OFF, "E-OACC-04");
        tradePairs.setAuctionPrice(_tradePairId, _price);
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

    /**
     * @notice  Matches auction orders once the auction is closed and auction price is set
     * @dev     Takes the top of the book sell order(bestAsk), and matches it with the buy orders sequentially.
     * An auction mode can safely be changed to AUCTIONMODE.OFF only when this function returns false.
     * High Level Auction Logic
     * Auction Token & An auction pair(Base is the auction) gets added with AUCTION_MODE==PAUSED
     * Nobody can enter orders on this pair, and nobody can transfer/withdraw their auction token
     * when AUCTION_MODE != OFF
     * Auction starts with AUCTION_MODE==ON. Participants can enter any buy or sell orders at any price
     * The order books will not match any orders and it will stay crossed
     * An off-chain app calculates the match price and quantities and disseminates this information in
     * real time for participant to adjust their orders accordingly.
     * When the predetermined auction end time is reached AUCTION_MODE is set to CLOSING. This is the
     * Randomized Closing Sequence as explained in ExchangeMain.flipCoin()
     * When auction is closed, the AUCTION_MODE is set to MATCHING.
     * The auction price is set from the off-chain app. At this point no actions are allowed on this trade pair:
     * no new orders, cancels, cancel-replaces, deposits, withdraws or transfers until all matching is done.
     * @param   _tradePairId  id of the trading pair
     * @param   _maxNbrOfFills  controls max number of fills an order can get at a time to avoid running out of gas
     * @return  bool  true if more matches are possible. false if no more possible matches left in the orderbook.
     */
    function matchAuctionOrders(
        bytes32 _tradePairId,
        uint256 _maxNbrOfFills
    ) external onlyRole(AUCTION_ADMIN_ROLE) returns (bool) {
        bytes32 bookId = tradePairs.getBookId(_tradePairId, ITradePairs.Side.SELL);
        (, bytes32 takerOrderId) = orderBooks.getTopOfTheBook(bookId);
        if (takerOrderId != "") {
            ITradePairs.Order memory takerOrder = tradePairs.getOrder(takerOrderId);
            uint256 startRemainingQuantity = UtilsLibrary.getRemainingQuantity(
                takerOrder.quantity,
                takerOrder.quantityFilled
            );
            uint256 takerRemainingQuantity = tradePairs.matchAuctionOrder(takerOrder.id, _maxNbrOfFills);
            if (startRemainingQuantity == takerRemainingQuantity) {
                //Sell taker order didn't match with any buy orders, auction is finished
                emit AuctionMatchFinished(_tradePairId);
                return false;
            } else {
                return true;
            }
        } else {
            // no more orders left on the sell book, auction is finished
            emit AuctionMatchFinished(_tradePairId);
            return false;
        }
    }
}
