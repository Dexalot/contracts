// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

/**
 * @title DexalotRouter
 * @notice A router contract to facilitate aggregator swaps via RFQ order execution. It forwards calls to allowed MainnetRFQ contracts,
 * transferring tokens from the original sender. Only the partialSwap and simpleSwap functions are supported.
 */
// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2025 Dexalot
contract DexalotRouter is AccessControlEnumerable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    // partialSwap(tuple,bytes,uint256) -> keccak256("partialSwap((uint256,uint128,address,address,address,address,uint256,uint256),bytes,uint256)")
    bytes4 private constant PARTIAL_SWAP_SELECTOR = 0x944bda00;
    // simpleSwap(tuple,bytes) -> keccak256("simpleSwap((uint256,uint128,address,address,address,address,uint256,uint256),bytes)")
    bytes4 private constant SIMPLE_SWAP_SELECTOR = 0x6c75d6f5;
    // 4 bytes for function selector, 32X3 for takerAsset index
    uint256 private constant TAKER_ASSET_OFFSET = 4 + 32 * 3;
    // 4 bytes for function selector, 32X4 for maker index in RFQ order struct
    uint256 private constant MAKER_OFFSET = 4 + 32 * 4;
    // 4 bytes for function selector, 32X7 for taker amount index in RFQ order struct
    uint256 private constant TAKER_AMOUNT_OFFSET = 4 + 32 * 7;
    // 4 bytes for function selector, 32X8 for RFQ order struct, 32 bytes for signature pointer
    uint256 private constant TAKER_PARTIAL_AMOUNT_OFFSET = 4 + 32 * 8 + 32;

    // version
    bytes32 public constant VERSION = bytes32("1.0.1");
    // addresses of allowed MainnetRFQ contracts
    EnumerableSet.AddressSet private allowedRFQs;

    event AllowedRFQUpdated(address indexed rfq, bool allowed);

    /**
     * @notice Constructor to set up roles
     * @param _owner The address to be granted the admin role
     */
    constructor(address _owner) {
        require(_owner != address(0), "DR-SAZ-01");

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
    }

    /**
     * @notice  Add or remove an address from the allowed MainnetRFQs
     * @param _mainnetRFQ The address of the MainnetRFQ maker
     * @param _allowed True to add to allowed list, false to remove
     */
    function setAllowedRFQ(address _mainnetRFQ, bool _allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_mainnetRFQ != address(0), "DR-SAZ-01");
        if (_allowed) {
            allowedRFQs.add(_mainnetRFQ);
        } else {
            allowedRFQs.remove(_mainnetRFQ);
        }
        emit AllowedRFQUpdated(_mainnetRFQ, _allowed);
    }

    /**
     * @notice Retrieve any ERC20 or native tokens mistakenly sent to this contract
     * @param _token The address of the token to retrieve, or address(0) for native
     * @param _amount The amount of tokens to retrieve
     */
    function retrieveToken(address _token, uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_token == address(0)) {
            // native
            (bool success, ) = msg.sender.call{value: _amount}("");
            require(success, "DR-TF-01");
            return;
        }
        // ERC20
        IERC20(_token).safeTransfer(msg.sender, _amount);
    }

    /**
     * @notice Check if a MainnetRFQ address is allowed
     * @param _mainnetRFQ The address to check
     * @return True if the address is in the allowed list, false otherwise
     */
    function isAllowedRFQ(address _mainnetRFQ) external view returns (bool) {
        return allowedRFQs.contains(_mainnetRFQ);
    }

    /**
     * @notice Get the list of allowed MainnetRFQs
     * @return An array of allowed MainnetRFQ contract addresses
     */
    function getAllowedRFQs() external view returns (address[] memory) {
        return allowedRFQs.values();
    }

    /** @notice Get a paginated list of allowed MainnetRFQs
     * @param _startIndex The starting index of the page
     * @param _pageSize The number of addresses to return in the page
     * @return An array of allowed MainnetRFQ contract addresses for the specified page
     */
    function getAllowedRFQsPaginated(uint256 _startIndex, uint256 _pageSize) external view returns (address[] memory) {
        uint256 length = _pageSize;
        uint256 total = allowedRFQs.length();
        if (_startIndex + _pageSize > total) {
            length = total - _startIndex;
        }
        address[] memory page = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            page[i] = allowedRFQs.at(_startIndex + i);
        }
        return page;
    }

    /**
     * @notice Get the number of allowed MainnetRFQs
     * @return The count of allowed MainnetRFQ contract addresses
     */
    function numberOfAllowedRFQs() external view returns (uint256) {
        return allowedRFQs.length();
    }

    /**
     * @notice Not supported. To send native properly, the call must be forwarded to an allowed MainnetRFQ contract via partialSwap or simpleSwap.
     */
    receive() external payable {}

    /**
     * @notice Fallback function to forward calls to allowed MainnetRFQ contracts.
     * Only the partialSwap and simpleSwap functions are supported.
     * The original sender's address is appended to the calldata for the target contract to extract.
     * If the call involves token transfer, the tokens are transferred from the original sender to the target contract before forwarding the call.
     */
    fallback() external payable {
        bytes4 selector;
        assembly {
            // Read the first 4 bytes of calldata
            selector := calldataload(0)
        }

        // If the selector is NOT partialSwap AND NOT simpleSwap, revert.
        if (selector != PARTIAL_SWAP_SELECTOR && selector != SIMPLE_SWAP_SELECTOR) {
            revert("DR-FSNW-01"); // function selector not whitelisted
        }

        address payable targetImplementation;
        assembly {
            targetImplementation := calldataload(MAKER_OFFSET)
        }

        require(targetImplementation != address(0) && allowedRFQs.contains(targetImplementation), "DR-IRMA-01"); // invalid RFQ Maker address

        address takerAsset;
        uint256 amount;
        uint256 amountOffset = selector == PARTIAL_SWAP_SELECTOR ? TAKER_PARTIAL_AMOUNT_OFFSET : TAKER_AMOUNT_OFFSET;
        assembly {
            // Read the takerAsset address from the RFQ order struct in calldata
            takerAsset := calldataload(TAKER_ASSET_OFFSET)
            amount := calldataload(amountOffset)
        }
        if (takerAsset != address(0)) {
            // ERC20 transfer
            IERC20(takerAsset).safeTransferFrom(msg.sender, targetImplementation, amount);
        }

        // Append the original sender's address to the calldata
        bytes memory newCallData = abi.encodePacked(msg.data, msg.sender);

        // Execute the call on the child MainnetRFQ contract
        (bool success, ) = targetImplementation.call{value: msg.value}(newCallData);

        // Forward the revert reason if the call failed
        if (!success) {
            // Revert with the return data from the call
            assembly {
                let returndata_size := returndatasize()
                returndatacopy(0, 0, returndata_size)
                revert(0, returndata_size)
            }
        }

        // Return the result
        assembly {
            let returndata_size := returndatasize()
            returndatacopy(0, 0, returndata_size)
            return(0, returndata_size)
        }
    }
}
