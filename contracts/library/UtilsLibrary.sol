// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

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
    function decimalsOk(uint256 _value, uint8 _decimals, uint8 _displayDecimals) internal pure returns (bool) {
        return (_value - (_value - ((_value % 10 ** _decimals) % 10 ** (_decimals - _displayDecimals)))) == 0;
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
     * @notice  Returns the outgoing token symbol & amount based on the side of the order
     * @param   _orderSide  order Side
     * @param   _quoteSymbol  quote Symbol
     * @param   _baseSymbol  base Symbol
     * @param   _baseDecimals  base Token decimals of the trading pair
     * @param   _price  price
     * @param   _quantity  quantity
     * @return  outSymbol  outgoing token symbol
     * @return  outAmount outgoing Amount
     */

    function getOutgoingDetails(
        ITradePairs.Side _orderSide,
        bytes32 _quoteSymbol,
        bytes32 _baseSymbol,
        uint8 _baseDecimals,
        uint256 _price,
        uint256 _quantity
    ) internal pure returns (bytes32 outSymbol, uint256 outAmount) {
        if (_orderSide == ITradePairs.Side.BUY) {
            outSymbol = _quoteSymbol;
            outAmount = getQuoteAmount(_baseDecimals, _price, _quantity);
        } else {
            outSymbol = _baseSymbol;
            outAmount = _quantity;
        }
    }

    /**
     * @notice  Converts a uint256 value to an address
     * @param   _addressAs256  uint256 data to be converted
     * @return  address  converted address representation
     */
    function uint256ToAddress(uint256 _addressAs256) internal pure returns (address) {
        return address(uint160(_addressAs256));
    }

    /**
     * @notice  Converts an address to uint256 value
     * @param   _address  address data to be converted
     * @return  uint256  converted address representation
     */
    function addressToUint256(address _address) internal pure returns (uint256) {
        return uint256(uint160(_address));
    }

    /**
     * @notice  Checks if the order is cancelable.
     * @dev     For an order _quantityFilled < _quantity and its status should be PARTIAL or NEW
                to be eligible for cancelation
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
     * @param   _a  number to round down
     * @param   _m  number of digits from the right to round down
     * @return  uint256  rounded down value
     */
    function floor(uint256 _a, uint256 _m) internal pure returns (uint256) {
        return (_a / 10 ** _m) * 10 ** _m;
    }
    /**
     * @notice  Returns the commission to be paid.
     * @param   _amount  token quantity being swapped
     * @param   _rate  maker or taker rate to be applied to the _amount.
     * It is expected NOT in bps (1/10000) BUT in  1/1000.
     * PortfolioSubHelper.getRates mutliplies the rates by 10 before calling this function.
     * certain admin or contracted market makers have 0 rates.(no minimum applies)
     * @return  uint256  fee to be paid, at least 1 automic unit for regular users
     */

    function getFee(uint256 _amount, uint256 _rate) internal pure returns (uint256) {
        if (_rate == 0) {
            return 0; // for admin , contracted market makers
        }
        // _rate is in bps but PortfolioSubHelper.getRates multiplies it by 10 to be able to get
        // more precision. Hence the denominator for fee calculations is 100K instead of 10K.
        uint256 fee = (_amount * _rate) / 100000;

        // If there is an amount and a rate, ensure fee is at least 1 atomic unit
        // This is a GUARD againts small orders trying to avoidfees(o fees). There has to be some
        // financial penalty if it is attempted. Theoratically, this line won't execute because
        // the lowest evm decimal tokens we support are USDC & USDC with 6 decimals. Even with
        // minTradeAmount = 0.1 (typically set to >=1) USDC and heavily discounted rate of 0.5 bps
        // wich is the minimum taker rate allowed, the fee would be 0.000005, which is still > 0.000001
        if (fee == 0 && _amount >= 1) {
            return 1;
        }

        return fee;
    }

    /**
     * @notice  Returns the minimum of the two uint256 arguments
     * @param   _a  A
     * @param   _b  B
     * @return  uint256  Min of a and b
     */
    function min(uint256 _a, uint256 _b) internal pure returns (uint256) {
        return (_a <= _b ? _a : _b);
    }

    function max(uint256 _a, uint256 _b) internal pure returns (uint256) {
        return (_a >= _b ? _a : _b);
    }

    /**
     * @notice  Converts a bytes32 value to a string
     * @param   _bytes32  bytes32 data to be converted to string
     * @return  string  converted string representation
     */
    function bytes32ToString(bytes32 _bytes32) internal pure returns (string memory) {
        uint8 i = 0;
        while (i < 32 && _bytes32[i] != 0) {
            ++i;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; ++i) {
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

    function addressToBytes32(address _addr) internal pure returns (bytes32 result) {
        assembly {
            result := _addr
        }
    }

    function bytes32ToAddress(bytes32 _bytes32) internal pure returns (address addr) {
        assembly {
            addr := _bytes32
        }
    }

    function isOptionSet(bytes1 _options, uint8 _bit) internal pure returns (bool isSet) {
        return uint8(_options) & (1 << _bit) != 0;
    }

    function truncateQuantity(
        uint256 _quantity,
        uint8 _fromDecimals,
        uint8 _toDecimals
    ) internal pure returns (uint256) {
        if (_fromDecimals <= _toDecimals) {
            return _quantity;
        }
        uint256 factor = 10 ** (_fromDecimals - _toDecimals);
        return (_quantity / factor) * factor;
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

    // get quote amount
    /**
     * @notice  Returns the quote amount for a given price and quantity
     * @param   _baseDecimals  base Token decimals of the trading pair
     * @param   _price  price
     * @param   _quantity  quantity
     * @return  quoteAmount quote amount
     */
    function getQuoteAmount(
        uint8 _baseDecimals,
        uint256 _price,
        uint256 _quantity
    ) internal pure returns (uint256 quoteAmount) {
        quoteAmount = (_price * _quantity) / 10 ** _baseDecimals;
    }

    /**
     * @notice  Copied from Layer0 Libs
     * @param   _bytes  Bytes to slice
     * @param   _start  Start
     * @param   _length Length
     * @return  bytes   Bytes returned
     */
    function slice(bytes memory _bytes, uint256 _start, uint256 _length) internal pure returns (bytes memory) {
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
