// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../MainnetRFQ.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FaultyAggregatorMock {
    MainnetRFQ private mainnetRFQ;

    constructor(address payable _address) {
        mainnetRFQ = MainnetRFQ(_address);
    }

    function simpleSwap(MainnetRFQ.Order calldata order, bytes calldata signature) external payable {
        mainnetRFQ.simpleSwap{value: msg.value}(order, signature);
    }
}
