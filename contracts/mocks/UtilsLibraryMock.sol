// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../library/UtilsLibrary.sol";

/**
 * @title Mock contract to test UtilsLibrary.sol
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

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

    function floor(uint256 _a, uint256 _m) external pure returns (uint256) {
        return UtilsLibrary.floor(_a, _m);
    }

    function min(uint256 _a, uint256 _b) external pure returns (uint256) {
        return UtilsLibrary.min(_a, _b);
    }

    function bytes32ToString(bytes32 _bytes32) external pure returns (string memory) {
        return UtilsLibrary.bytes32ToString(_bytes32);
    }

    function stringToBytes32(string memory _string) external pure returns (bytes32) {
        return UtilsLibrary.stringToBytes32(_string);
    }

    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    ) external pure returns (bytes memory) {
        return UtilsLibrary.slice(_bytes, _start, _length);
    }
}
