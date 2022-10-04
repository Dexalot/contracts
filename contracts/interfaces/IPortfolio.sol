// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

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

    function updateTransferFeeRate(uint256 _rate, Tx _rateType) external;

    function addToken(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode
    ) external;

    function removeToken(bytes32 _symbol) external;

    function adjustAvailable(
        Tx _transaction,
        address _trader,
        bytes32 _symbol,
        uint256 _amount
    ) external;

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

    function depositNative(address payable _from, IPortfolioBridge.BridgeProvider _bridge) external payable;

    function withdrawNative(address payable _to, uint256 _quantity) external;

    function depositToken(
        address _from,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external;

    function withdrawToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external;

    function depositTokenFromContract(
        address _from,
        bytes32 _symbol,
        uint256 _quantity
    ) external;

    function addTrustedContract(address _contract, string calldata _organization) external;

    function isTrustedContract(address _contract) external view returns (bool);

    function removeTrustedContract(address _contract) external;

    function setAuctionMode(bytes32 _symbol, ITradePairs.AuctionMode _mode) external;

    function processXFerPayload(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolio.Tx _transaction
    ) external;

    function getNative() external view returns (bytes32);

    function getChainId() external view returns (uint32);

    function getTokenDetails(bytes32 _symbol) external view returns (TokenDetails memory);

    function lzForceResumeReceive(uint16 _srcChainId, bytes calldata _srcAddress) external;

    function lzRetryPayload(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        bytes calldata _payload
    ) external;

    //function defaultBridgeProvider() external view returns (BridgeProvider);

    enum Tx {
        WITHDRAW,
        DEPOSIT,
        EXECUTION,
        INCREASEAVAIL,
        DECREASEAVAIL,
        IXFERSENT,
        IXFERREC,
        RECOVER
    }

    event PortfolioUpdated(
        Tx indexed transaction,
        address indexed wallet,
        bytes32 indexed symbol,
        uint256 quantity,
        uint256 feeCharged,
        uint256 total,
        uint256 available
    );

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
}
