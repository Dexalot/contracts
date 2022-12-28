// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./ITradePairs.sol";
import "./IPortfolioBridge.sol";
import "./IPortfolio.sol";

/**
 * @title Interface of PortfolioSub
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolioSub {
    function adjustAvailable(IPortfolio.Tx _transaction, address _trader, bytes32 _symbol, uint256 _amount) external;

    function addExecution(
        ITradePairs.Side _makerSide,
        address _makerAddr,
        address _taker,
        bytes32 _baseSymbol,
        bytes32 _quoteSymbol,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        uint256 _makerfeeCharged,
        uint256 _takerfeeCharged
    ) external;

    function withdrawNative(address payable _to, uint256 _quantity) external;

    function withdrawToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external;

    function setAuctionMode(bytes32 _symbol, ITradePairs.AuctionMode _mode) external;

    function autoFill(address _trader, bytes32 _symbol) external;
}
