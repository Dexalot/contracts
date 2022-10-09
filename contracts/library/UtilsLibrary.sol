// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/Strings.sol";

import "../interfaces/ITradePairs.sol";

/**
 * @title Common utility functions used across Dexalot's smart contracts.
 * @dev This library provides a set of simple, pure functions to be used in other contracts.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

library UtilsLibrary {
    /**
     * @notice  Checks the validity of price and quantity given the evm and display decimals.
     * @param   _value  price or quantity
     * @param   _decimals  evm decimals
     * @param   _displayDecimals  base or quote display decimals
     * @return  bool  true if ok
     */
    function decimalsOk(
        uint256 _value,
        uint8 _decimals,
        uint8 _displayDecimals
    ) internal pure returns (bool) {
        return (_value - (_value - ((_value % 10**_decimals) % 10**(_decimals - _displayDecimals)))) == 0;
    }

    /**
     * @notice  Returns the remaining quantity for an Order struct.
     * @param   _quantity  original order quantity
     * @param   _quantityFilled  filled quantity
     * @return  uint256  remaining quantity
     */
    function getRemainingQuantity(uint256 _quantity, uint256 _quantityFilled) internal pure returns (uint256) {
        return _quantity - _quantityFilled;
    }

    /**
     * @notice  Checks if a tradePair is in auction and if matching is not allowed in the orderbook.
     * @param   _mode  Auction Mode
     * @return  bool  true/false
     */
    function matchingAllowed(ITradePairs.AuctionMode _mode) internal pure returns (bool) {
        return _mode == ITradePairs.AuctionMode.OFF || _mode == ITradePairs.AuctionMode.LIVETRADING;
    }

    /**
     * @notice  Checks if the auction is in a restricted state.
     * @param   _mode  Auction Mode
     * @return  bool  true if Auction is in restricted mode
     */
    function isAuctionRestricted(ITradePairs.AuctionMode _mode) internal pure returns (bool) {
        return _mode == ITradePairs.AuctionMode.RESTRICTED || _mode == ITradePairs.AuctionMode.CLOSING;
    }

    /**
     * @notice  Checks if the order is cancelable.
     * @dev     For an order _quantityFilled < _quantity and its status should be PARTIAL or NEW
                to be eligable for cancelation
     * @param   _quantity  quantity of the order
     * @param   _quantityFilled  quantityFilled of the order
     * @param   _orderStatus  status of the order
     * @return  bool  true if cancelable
     */
    function canCancel(
        uint256 _quantity,
        uint256 _quantityFilled,
        ITradePairs.Status _orderStatus
    ) internal pure returns (bool) {
        return (_quantityFilled < _quantity &&
            (_orderStatus == ITradePairs.Status.PARTIAL || _orderStatus == ITradePairs.Status.NEW));
    }

    /**
     * @notice  Round down a unit256 value.  Used for the fees to avoid dust.
     * @dev     example: a = 1245, m: 2 ==> 1200
     * @param   _a  number to round down
     * @param   _m  number of digits from the right to round down
     * @return  uint256  .
     */
    function floor(uint256 _a, uint256 _m) internal pure returns (uint256) {
        return (_a / 10**_m) * 10**_m;
    }

    /**
     * @notice  Returns the minuimum of the two uint256 arguments
     * @param   _a  A
     * @param   _b  B
     * @return  uint256  Min of a and b
     */
    function min(uint256 _a, uint256 _b) internal pure returns (uint256) {
        return (_a <= _b ? _a : _b);
    }

    /**
     * @notice  Converts a bytes32 value to a string
     * @param   _bytes32  bytes32 data to be converted to string
     * @return  string  converted string representation
     */
    function bytes32ToString(bytes32 _bytes32) internal pure returns (string memory) {
        uint8 i = 0;
        while (i < 32 && _bytes32[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }

    /**
     * @notice  Converts a string to a bytes32 value
     * @param   _string  a sting to be converted to bytes32
     * @return  result  converted bytes32 representation
     */
    function stringToBytes32(string memory _string) internal pure returns (bytes32 result) {
        bytes memory tempEmptyStringTest = bytes(_string);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }
        // solhint-disable-next-line no-inline-assembly
        assembly {
            result := mload(add(_string, 32))
        }
    }

    /**
     * @notice  Returns the symbolId that consists of symbol+chainid
     * @param   _symbol  token symbol of an asset
     * @param   _srcChainId  chain id where the asset exists
     * @return  id  the resulting symbolId
     */
    function getIdForToken(bytes32 _symbol, uint32 _srcChainId) internal pure returns (bytes32 id) {
        id = stringToBytes32(string.concat(bytes32ToString(_symbol), Strings.toString(_srcChainId)));
    }

    /**
     * @notice  Copied from Layer0 Libs
     * @param   _bytes  Bytes to slice
     * @param   _start  Start
     * @param   _length Length
     * @return  bytes   Bytes returned
     */
    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    ) internal pure returns (bytes memory) {
        // solhint-disable-next-line reason-string
        require(_bytes.length + 31 >= _length, "slice_overflow");
        // solhint-disable-next-line reason-string
        require(_bytes.length >= _start + _length, "slice_outOfBounds");

        bytes memory tempBytes;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            switch iszero(_length)
            case 0 {
                // Get a location of some free memory and store it in tempBytes as
                // Solidity does for memory variables.
                tempBytes := mload(0x40)

                // The first word of the slice result is potentially a partial
                // word read from the original array. To read it, we calculate
                // the length of that partial word and start copying that many
                // bytes into the array. The first word we copy will start with
                // data we don't care about, but the last `lengthmod` bytes will
                // land at the beginning of the contents of the new array. When
                // we're done copying, we overwrite the full first word with
                // the actual length of the slice.
                let lengthmod := and(_length, 31)

                // The multiplication in the next line is necessary
                // because when slicing multiples of 32 bytes (lengthmod == 0)
                // the following copy loop was copying the origin's length
                // and then ending prematurely not copying everything it should.
                let mc := add(add(tempBytes, lengthmod), mul(0x20, iszero(lengthmod)))
                let end := add(mc, _length)

                for {
                    // The multiplication in the next line has the same exact purpose
                    // as the one above.
                    let cc := add(add(add(_bytes, lengthmod), mul(0x20, iszero(lengthmod))), _start)
                } lt(mc, end) {
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    mstore(mc, mload(cc))
                }

                mstore(tempBytes, _length)

                //update free-memory pointer
                //allocating the array padded to 32 bytes like the compiler does now
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            //if we want a zero-length slice let's just return a zero-length array
            default {
                tempBytes := mload(0x40)
                //zero out the 32 bytes slice we are about to return
                //we need to do it because Solidity does not garbage collect
                mstore(tempBytes, 0)

                mstore(0x40, add(tempBytes, 0x20))
            }
        }

        return tempBytes;
    }
}
