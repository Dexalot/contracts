// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "./IPortfolioBridge.sol";
import "./IPortfolio.sol";

interface IDexalotRFQ {
    // firm order data structure sent to user for regular swap from RFQ API
    struct Order {
        uint256 nonceAndMeta;
        uint128 expiry;
        address makerAsset;
        address takerAsset;
        address maker;
        address taker;
        uint256 makerAmount;
        uint256 takerAmount;
    }

    // firm order data structure sent to user for cross chain swap from RFQ API
    struct XChainSwap {
        bytes32 from;
        bytes32 to;
        bytes32 makerSymbol;
        bytes32 makerAsset;
        bytes32 takerAsset;
        uint256 makerAmount;
        uint256 takerAmount;
        uint96 nonce;
        uint32 expiry;
        uint32 destChainId;
        IPortfolioBridge.BridgeProvider bridgeProvider;
    }

    struct SwapData {
        uint256 nonceAndMeta;
        // originating user
        address taker;
        // aggregator or destination user
        bytes32 destTrader;
        uint32 destChainId;
        address srcAsset;
        bytes32 destAsset;
        uint256 srcAmount;
        uint256 destAmount;
        address msgSender;
        bool isDirect;
    }

    // data structure for swaps unable to release funds on destination chain due to lack of inventory
    struct PendingSwap {
        address trader;
        uint256 quantity;
        bytes32 symbol;
    }

    function processXFerPayload(IPortfolio.XFER calldata _xfer) external;

    receive() external payable;
}
