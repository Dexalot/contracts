// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPortfolio} from "contracts/interfaces/IPortfolio.sol";
import {ITradePairs} from "contracts/interfaces/ITradePairs.sol";

contract MockPortfolioSub {
    address public feeAddress;
    mapping(bytes32 => bool) private isTokenSet;

    event Transfer(address from, address to, bytes32 symbol, uint256 amount);

    function setFeeAddress(address _fee) external {
        feeAddress = _fee;
    }

    function setTokenDetails(bytes32 symbol) external {
        isTokenSet[symbol] = true;
    }

    function getTokenDetails(bytes32 symbol) external view returns (IPortfolio.TokenDetails memory) {
        IPortfolio.TokenDetails memory details = IPortfolio.TokenDetails({
            decimals: 18,
            tokenAddress: address(0xDEAD),
            auctionMode: ITradePairs.AuctionMode(0),
            srcChainId: 1,
            l1Decimals: 18,
            symbol: isTokenSet[symbol] ? symbol : bytes32(0),
            symbolId: symbol,
            sourceChainSymbol: symbol,
            isVirtual: false
        });
        return details;
    }

    function bulkTransferTokens(
        address from,
        address to,
        bytes32[] calldata symbols,
        uint256[] calldata amounts
    ) external {
        for (uint256 i = 0; i < symbols.length; i++) {
            emit Transfer(from, to, symbols[i], amounts[i]);
        }
    }

    function transferToken(address to, bytes32 symbol, uint256 amount) external {
        emit Transfer(msg.sender, to, symbol, amount);
    }

    function withdrawNative(address to, uint256 amount) external {
        to.call{value: amount}("");
    }

    function depositNative() external payable {}

    // This contract has NO receive() or fallback() function,
    // so any attempt to send Ether to it via .call will return success = false.
}
