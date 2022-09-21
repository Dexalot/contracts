// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/ITradePairs.sol";

library UtilsLibrary {
    /**
     * @notice  Checks the validity of price & quantity given the evm & display decimals
     * @param   value  price or quantity
     * @param   decimals  evm decimals
     * @param   displayDecimals  base or quote display decimals
     * @return  bool  true if ok
     */
    function decimalsOk(
        uint256 value,
        uint8 decimals,
        uint8 displayDecimals
    ) internal pure returns (bool) {
        return (value - (value - ((value % 10**decimals) % 10**(decimals - displayDecimals)))) == 0;
    }

    /**
     * @notice  get remaining quantity for an Order struct
     * @dev     cheap pure function
     * @param   _quantity  original order quantity
     * @param   _quantityFilled  filled quantity
     * @return  uint256  remaining quantity
     */
    function getRemainingQuantity(uint256 _quantity, uint256 _quantityFilled) internal pure returns (uint256) {
        return _quantity - _quantityFilled;
    }

    /**
     * @notice  If a tradePair is in auction, matching is not allowed in the orderbook
     * @param   _mode  Auction Mode
     * @return  bool  true/false
     */
    function matchingAllowed(ITradePairs.AuctionMode _mode) internal pure returns (bool) {
        return _mode == ITradePairs.AuctionMode.OFF || _mode == ITradePairs.AuctionMode.LIVETRADING;
    }

    /**
     * @notice  Returns if the auction is in restricted state
     * @param   _mode  Auction Mode
     * @return  bool  true if Auction is in restricted mode
     */
    function isAuctionRestricted(ITradePairs.AuctionMode _mode) internal pure returns (bool) {
        return _mode == ITradePairs.AuctionMode.RESTRICTED || _mode == ITradePairs.AuctionMode.CLOSING;
    }

    /**
     * @notice  Checks to see if the order is cancelable.
     * @dev     the order _quantityFilled < _quantity & its status should be PARTIAL or NEW
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
     * @notice  Used to Round Down the fees to the display decimals to avoid dust
     * @dev     example: a = 1245, m: 2 ==> 1200
     * @param   a  number to round down
     * @param   m  number of digits from the right to round down
     * @return  uint256  .
     */
    function floor(uint256 a, uint256 m) internal pure returns (uint256) {
        return (a / 10**m) * 10**m;
    }

    /**
     * @param   a  A
     * @param   b  B
     * @return  uint256  Min of a and b
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a <= b ? a : b);
    }

    /**
     * @dev     utility function to convert bytes32 to string
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
     * @dev     utility function to convert string to bytes32
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
}
