// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;
import "./IPortfolio.sol";

interface IInventoryManager {
    function remove(bytes32 _symbol, bytes32 _symbolId) external returns (bool);

    function increment(bytes32 _symbol, bytes32 _symbolId, uint256 _quantity) external;

    function decrement(bytes32 _symbol, bytes32 _symbolId, uint256 _quantity) external;

    function get(bytes32 _symbol, bytes32 _symbolId) external view returns (uint256);

    function calculateWithdrawalFee(
        bytes32 _symbol,
        bytes32 _symbolId,
        uint256 _quantity
    ) external view returns (uint256);
}
