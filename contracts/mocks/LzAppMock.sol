// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.17;

import "../bridgeApps/LzApp.sol";

import "../PortfolioBridgeMain.sol";

/**
 * @title Mock contract to test LzApp.sol using inheritance from PortfolioBridgeMain.sol
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract LzAppMock is PortfolioBridgeMain {
    constructor() {
        initialize();
    }

    function initialize() public initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function lzReceive(uint16, bytes memory, uint64, bytes memory) external pure override {
        return;
    }

    function lzSend(uint16 _dstChainId, bytes memory _payload) private returns (uint256) {
        return super.lzSend(_dstChainId, _payload, payable(this));
    }

    function lzSendMock(uint16 _dstChainId, bytes memory _payload) external returns (uint256) {
        return lzSend(_dstChainId, _payload);
    }

    function getInboundNonceMock(uint16 _dstChainId) external view returns (uint64) {
        return super.getInboundNonce(_dstChainId);
    }

    function getOutboundNonceMock(uint16 _dstChainId) external view returns (uint64) {
        return super.getOutboundNonce(_dstChainId);
    }
}
