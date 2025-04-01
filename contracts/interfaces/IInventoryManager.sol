// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.17;
import "./IPortfolio.sol";
import "./IPortfolioBridgeSub.sol";

interface IInventoryManager {
    function remove(bytes32 _symbol, bytes32 _symbolId) external returns (bool);

    function increment(IPortfolioBridgeSub.XferShort calldata _xferShort) external;

    function decrement(IPortfolioBridgeSub.XferShort calldata _xferShort) external;

    function get(bytes32 _symbol, bytes32 _symbolId) external view returns (uint256);

    function calculateWithdrawalFee(IPortfolioBridgeSub.XferShort calldata _xferShort) external view returns (uint256);
}
