// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IDexalotRFQ} from "contracts/interfaces/IDexalotRFQ.sol";
import {IPortfolio} from "contracts/interfaces/IPortfolio.sol";

contract MockDexalotRFQ is IDexalotRFQ {
    constructor() {}

    function simpleSwap(Order calldata order, bytes calldata signature) external payable override {
        // This mock function does not perform any actual swap logic.
        // In a real implementation, this would verify the signature and execute the swap.
    }

    function processXFerPayload(IPortfolio.XFER calldata _xfer) external override {}

    receive() external payable {}
}
