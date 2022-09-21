// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../library/UtilsLibrary.sol";

contract UtilsLibraryMock {
    function decimalsOk(
        uint256 value,
        uint8 decimals,
        uint8 displayDecimals
    ) external pure returns (bool) {
        return UtilsLibrary.decimalsOk(value, decimals, displayDecimals);
    }

    function getRemainingQuantity(uint256 _quantity, uint256 _quantityFilled) external pure returns (uint256) {
        return UtilsLibrary.getRemainingQuantity(_quantity, _quantityFilled);
    }

    function matchingAllowed(ITradePairs.AuctionMode _mode) external pure returns (bool) {
        return UtilsLibrary.matchingAllowed(_mode);
    }

    function isAuctionRestricted(ITradePairs.AuctionMode _mode) external pure returns (bool) {
        return UtilsLibrary.isAuctionRestricted(_mode);
    }

    function canCancel(
        uint256 _quantity,
        uint256 _quantityFilled,
        ITradePairs.Status _orderStatus
    ) external pure returns (bool) {
        return UtilsLibrary.canCancel(_quantity, _quantityFilled, _orderStatus);
    }

    function floor(uint256 a, uint256 m) external pure returns (uint256) {
        return UtilsLibrary.floor(a, m);
    }

    function min(uint256 a, uint256 b) external pure returns (uint256) {
        return UtilsLibrary.min(a, b);
    }

    function bytes32ToString(bytes32 _bytes32) external pure returns (string memory) {
        return UtilsLibrary.bytes32ToString(_bytes32);
    }

    function stringToBytes32(string memory _string) external pure returns (bytes32) {
        return UtilsLibrary.stringToBytes32(_string);
    }
}
