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
        bytes32 _tradePairId,
        ITradePairs.TradePair calldata _tradePair,
        ITradePairs.Side _makerSide,
        address _makerAddr,
        address _takerAddr,
        uint256 _baseAmount,
        uint256 _quoteAmount
    ) external returns (uint256 makerfee, uint256 takerfee);

    function transferToken(address _to, bytes32 _symbol, uint256 _quantity) external;

    enum AssetType {
        NATIVE,
        ERC20,
        NONE
    }

    function getBalance(
        address _owner,
        bytes32 _symbol
    ) external view returns (uint256 total, uint256 available, AssetType assetType);

    function withdrawNative(address payable _to, uint256 _quantity) external;

    function withdrawToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge,
        uint32 _dstChainListOrgChainId
    ) external;

    function withdrawToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external;

    function setAuctionMode(bytes32 _symbol, ITradePairs.AuctionMode _mode) external;

    function autoFill(address _trader, bytes32 _symbol) external;

    function addToken(
        bytes32 _srcChainSymbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode,
        uint256 _fee,
        uint256 _gasSwapRatio,
        bytes32 _subnetSymbol
    ) external;

    function removeToken(bytes32 _subnetSymbol, uint32 _srcChainId, bytes32 _srcChainSymbol) external;
}
