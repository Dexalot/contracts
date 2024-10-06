// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.25;

import "./IPortfolioBridge.sol";

interface IBridgeAggregator {
    function processPayload(
        IPortfolioBridge.BridgeProvider _bridge,
        uint32 _srcChainListOrgChainId,
        bytes calldata _payload
    ) external;
}
