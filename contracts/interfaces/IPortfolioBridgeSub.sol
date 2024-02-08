// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "./ITradePairs.sol";
import "./IPortfolio.sol";

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
        ITradePairs.AuctionMode,
        bytes32 _subnetSymbol
    ) external;

    function removeToken(
        bytes32 _srcChainSymbol,
        uint32 _srcChainId,
        bytes32 _subnetSymbol
    ) external returns (bool deleted);

    function getTokenDetails(bytes32 _symbolId) external view returns (IPortfolio.TokenDetails memory);

    function executeDelayedTransfer(uint16 _dstChainId, bytes32 _id) external;

}
