// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

library StringLibrary {

    // utility function to convert string to bytes32
    function stringToBytes32(string memory _string) internal pure returns (bytes32 result) {
        bytes memory tempEmptyStringTest = bytes(_string);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }
        assembly {
            result := mload(add(_string, 32))
        }
    }

}
