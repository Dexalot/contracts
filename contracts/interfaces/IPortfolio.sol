// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./ITradePairs.sol";
import "./IPortfolioBridge.sol";

/**
 * @title Interface of Portfolio
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolio {
    function pause() external;

    function unpause() external;

    function pauseDeposit(bool _pause) external;

    function addToken(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode,
        uint256 _fee,
        uint256 _gasSwapRatio
    ) external;

    function removeToken(bytes32 _symbol, uint32 _srcChainId) external;

    function depositNative(address payable _from, IPortfolioBridge.BridgeProvider _bridge) external payable;

    function processXFerPayload(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolio.Tx _transaction
    ) external;

    function getNative() external view returns (bytes32);

    function getChainId() external view returns (uint32);

    function getTokenDetails(bytes32 _symbol) external view returns (TokenDetails memory);

    function getTokenDetailsById(bytes32 _symbolId) external view returns (TokenDetails memory);

    function getTokenList() external view returns (bytes32[] memory);

    event PortfolioUpdated(
        Tx indexed transaction,
        address indexed wallet,
        bytes32 indexed symbol,
        uint256 quantity,
        uint256 feeCharged,
        uint256 total,
        uint256 available
    );

    struct BridgeParams {
        uint256 fee; // Bridge Fee
        uint256 gasSwapRatio;
        bool usedForGasSwap; //bool to control the list of tokens that can be used for gas swap. Mostly majors
    }

    struct XFER {
        uint64 nonce;
        IPortfolio.Tx transaction;
        address trader;
        bytes32 symbol;
        uint256 quantity;
        uint256 timestamp;
    }

    struct TokenDetails {
        uint8 decimals; //2
        address tokenAddress; //20
        ITradePairs.AuctionMode auctionMode; //2
        uint32 srcChainId; //4
        bytes32 symbol;
        bytes32 symbolId;
    }

    enum Tx {
        WITHDRAW,
        DEPOSIT,
        EXECUTION,
        INCREASEAVAIL,
        DECREASEAVAIL,
        IXFERSENT,
        IXFERREC,
        RECOVERFUNDS,
        ADDGAS,
        REMOVEGAS,
        AUTOFILL
    }
}
