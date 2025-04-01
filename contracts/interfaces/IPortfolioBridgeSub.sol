// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.17;

import "./ITradePairs.sol";
import "./IPortfolio.sol";
import "./IPortfolioBridge.sol";

/**
 * @title Interface of PortfolioBridgeSub
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolioBridgeSub {
    function addToken(
        bytes32 _srcChainSymbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        uint8 _l1Decimals,
        ITradePairs.AuctionMode,
        bytes32 _subnetSymbol,
        uint256 _bridgeFee
    ) external;

    function removeToken(
        bytes32 _srcChainSymbol,
        uint32 _srcChainId,
        bytes32 _subnetSymbol
    ) external returns (bool deleted);

    function getTokenDetails(bytes32 _symbolId) external view returns (IPortfolio.TokenDetails memory);

    function executeDelayedTransfer(bytes32 _id) external;

    function getAllBridgeFees(
        IPortfolioBridge.BridgeProvider _bridge,
        bytes32 _symbol,
        uint256 _quantity,
        address _sender,
        bytes1 _options
    ) external view returns (uint256[] memory bridgeFees, uint32[] memory chainIds);

    function setBridgeFees(
        uint32 _dstChainListOrgChainId,
        bytes32[] calldata _tokens,
        uint240[] calldata _bridgeFees
    ) external;

    function truncateQuantity(
        uint32 dstChainListOrgChainId,
        bytes32 symbol,
        uint256 quantity,
        uint256 bridgeFee
    ) external view returns (uint256);

    struct TokenDestinationInfo {
        bytes32 symbolId;
        uint240 bridgeFee;
        uint16 maxBridgeFeeCap;
    }

    // Short form Deposit/Withdraw Transaction between Mainnet and Dexalot L1
    // symbol  Dexalot L1 symbol of the token
    // symbolId  SymbolId of the token
    // quantity  Quantity of withdraw/deposit
    // traderaddress address of the tx owner
    struct XferShort {
        bytes32 symbol;
        bytes32 symbolId;
        uint256 quantity;
        address traderaddress;
    }

    event BridgeFeeUpdated(uint32 dstChainId, bytes32[] tokens, uint240[] bridgeFees);
    event MaxBridgeFeeCapUpdated(uint32 dstChainId, bytes32[] tokens, uint16[] maxBridgeFeeCaps);
    event OptionsGasCostUpdated(IPortfolio.Options option, uint256 gasMultiplier);
}
