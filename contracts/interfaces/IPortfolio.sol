// SPDX-License-Identifier: BSD-3-Clause

pragma solidity ^0.8.3;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./ITradePairs.sol";

interface IPortfolio {
    function pause() external;
    function unpause() external;
    function pauseDeposit(bool _paused) external;
    function updateTransferFeeRate(uint _rate, IPortfolio.Tx _rateType) external;
    function addToken(bytes32 _symbol, IERC20Upgradeable _token, ITradePairs.AuctionMode auctionMode) external;
    function adjustAvailable(Tx _transaction, address _trader, bytes32 _symbol, uint _amount) external;
    function addExecution(ITradePairs.Order memory _maker, address _taker, bytes32 _baseSymbol, bytes32 _quoteSymbol,
                          uint _baseAmount, uint _quoteAmount, uint _makerfeeCharged,
                          uint _takerfeeCharged) external;
    function depositTokenFromContract(address _from, bytes32 _symbol, uint _quantity) external;
    function addTrustedContract(address _contract, string calldata _organization) external;
    function setAuctionMode(bytes32 _symbol, ITradePairs.AuctionMode _mode) external;
    function addAuctionAdmin(address _address) external;
    function removeAuctionAdmin(address _address) external;
    function addAdmin(address _address) external;
    function removeAdmin(address _address) external;

    enum Tx  {WITHDRAW, DEPOSIT, EXECUTION, INCREASEAVAIL, DECREASEAVAIL}

    event PortfolioUpdated(Tx indexed transaction, address indexed wallet, bytes32 indexed symbol,
                           uint256 quantity, uint256 feeCharged, uint256 total, uint256 available);
}
