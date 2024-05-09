// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../library/InvariantMathLibrary.sol";

contract InvariantMathLibraryMock {
    function calcFees(
        uint256 A,
        uint256 quantity,
        uint256[] calldata inventories,
        uint256[] calldata scaleFactors,
        uint256 total
    ) external pure returns (uint256[] memory) {
        uint256[] memory fees = new uint256[](inventories.length);
        for (uint256 i; i < inventories.length; i++) {
            fees[i] = InvariantMathLibrary.calcWithdrawOneChain(
                quantity,
                i,
                inventories,
                total,
                scaleFactors[i],
                A,
                inventories.length
            );
        }
        return fees;
    }
}
