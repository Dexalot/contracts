// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.17;

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

    function pauseDeposit(bool _depositPause) external;

    function removeToken(bytes32 _symbol, uint32 _srcChainId) external;

    function depositNative(address payable _from, IPortfolioBridge.BridgeProvider _bridge) external payable;

    function processXFerPayload(IPortfolio.XFER calldata _xfer) external;

    function getNative() external view returns (bytes32);

    function getChainId() external view returns (uint32);

    function getTokenDetails(bytes32 _symbol) external view returns (TokenDetails memory);

    function getTokenDetailsById(bytes32 _symbolId) external view returns (TokenDetails memory);

    function getTokenList() external view returns (bytes32[] memory);

    function setBridgeParam(bytes32 _symbol, uint256 _fee, uint256 _gasSwapRatio, bool _usedForGasSwap) external;

    event PortfolioUpdated(
        Tx indexed transaction,
        address indexed wallet,
        bytes32 indexed symbol,
        uint256 quantity,
        uint256 feeCharged,
        uint256 total,
        uint256 available,
        address walletOther
    );

    struct BridgeParams {
        uint256 fee; // Bridge Fee
        uint256 gasSwapRatio;
        bool usedForGasSwap; //bool to control the list of tokens that can be used for gas swap. Mostly majors
    }

    struct XFER {
        uint64 nonce;
        IPortfolio.Tx transaction;
        bytes32 trader;
        bytes32 symbol;
        uint256 quantity;
        uint256 timestamp;
        bytes18 customdata;
    }

    struct XFERSolana {
        uint64 nonce;
        IPortfolio.Tx transaction;
        bytes32 trader;
        bytes32 tokenAddress;
        uint64 quantity;
        uint32 timestamp;
        bytes18 customdata;
    }

    struct TokenDetails {
        uint8 decimals; //1
        address tokenAddress; //20
        ITradePairs.AuctionMode auctionMode; //1
        uint32 srcChainId; //4
        uint8 l1Decimals; //1
        bytes32 symbol;
        bytes32 symbolId;
        bytes32 sourceChainSymbol;
        bool isVirtual;
    }

    enum Tx {
        WITHDRAW,
        DEPOSIT,
        EXECUTION,
        INCREASEAVAIL,
        DECREASEAVAIL,
        IXFERSENT, // 5  Subnet Sent. I for Internal to Subnet
        IXFERREC, //     Subnet Received. I for Internal to Subnet
        RECOVERFUNDS, // Obsolete as of 2/1/2024 CD
        ADDGAS,
        REMOVEGAS,
        AUTOFILL, // 10
        CCTRADE, // Cross Chain Trade.
        CONVERTFROM,
        CONVERTTO
    }

    enum Options {
        GASAIRDROP,
        UNWRAP
    }
}
