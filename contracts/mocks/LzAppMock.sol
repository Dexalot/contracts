// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.17;

import "../bridgeApps/LzApp.sol";

/**
 * @title Mock contract to test LzApp.sol
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract LzAppMock is LzApp {
    constructor() {
        initialize();
    }

    function initialize() public initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // solhint-disable-next-line no-empty-blocks
    function lzReceive(uint16, bytes memory, uint64, bytes memory) external override {}

    function lzSend(uint16 _dstChainId, bytes memory _payload) private returns (uint256) {
        return super.lzSend(_dstChainId, _payload, payable(this));
    }

    function lzSendMock(uint16 _dstChainId, bytes memory _payload) external returns (uint256) {
        return lzSend(_dstChainId, _payload);
    }

    function getInboundNonceMock(uint16 _srcChainId,  bytes calldata _srcAddress) external view returns (uint64) {
        return super.getInboundNonce(_srcChainId, _srcAddress);
    }

    function getOutboundNonceMock(uint16 _dstChainId) external view returns (uint64) {
        return super.getOutboundNonce(_dstChainId);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    // solhint-disable-next-line no-empty-blocks
    fallback() external payable {}
}
