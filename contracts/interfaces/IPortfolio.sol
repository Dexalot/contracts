// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./ITradePairs.sol";

interface IPortfolio {
    function pause() external;
    function unpause() external;
    function pauseDeposit(bool _paused) external;
    function updateTransferFeeRate(uint _rate, IPortfolio.Tx _rateType) external;
    function addToken(bytes32 _symbol, IERC20 _token) external;
    function adjustAvailable(Tx _transaction, address _trader, bytes32 _symbol, uint _amount) external;
    function addExecution(ITradePairs.Order memory _maker, address _taker, bytes32 _baseSymbol, bytes32 _quoteSymbol,
                          uint _baseAmount, uint _quoteAmount, uint _makerfeeCharged,
                          uint _takerfeeCharged) external;

    enum Tx  {WITHDRAW, DEPOSIT, EXECUTION, INCREASEAVAIL, DECREASEAVAIL}

    event PortfolioUpdated(Tx indexed transaction, address indexed wallet, bytes32 indexed symbol,
                           uint256 quantity, uint256 feeCharged, uint256 total, uint256 available);
}
