// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.3;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./library/Bytes32Library.sol";
import "./library/StringLibrary.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/ITradePairs.sol";

/**
*   @author "DEXALOT TEAM"
*   @title "The Exchange contract is the main entry point to DEXALOT Decentralized Exchange Trading."
*
*   @dev Start up order:
*   @dev     1. Deploy contracts: Exchange, Portfolio, OrderBooks, TradePairs and Fee
*   @dev     2. Call addTradePairs on Exchange
*   @dev     3. Call setPortfolio and setTradePairs on Exchange
*   @dev     4. Change ownership of contracts as per below
*   @dev     5. Call addToken on Exchange to add supported erc20 tokens to Portfolio and Fee
*
*   @dev "During deployment the ownerships of contracts are changed so they become as follows once DEXALOT is fully deployed:"
*   @dev "Exchange is owned by deploymentAccount to adjust operational parameters and add new trade pairs."
*   @dev "Portfolio contract is owned by exchange contract."
*   @dev "TradePairs contract is owned by exchange contract."
*   @dev "OrderBooks contract is owned by TradePairs contract."
*   @dev "Only tradepairs can internally call addExecution and adjustAvailable functions."
*   @dev "Only valid trader accounts can call deposit and withdraw functions for their own accounts."
*   @dev "Fee contract is owned by the deploymentAccount."
*/

contract Exchange is Initializable, AccessControlEnumerableUpgradeable {
    using SafeERC20 for IERC20Metadata;
    using StringLibrary for string;
    using Bytes32Library for bytes32;

    // version
    bytes32 constant public VERSION = bytes32('1.0.0');

    // map and array of all trading pairs on DEXALOT
    ITradePairs private tradePairs;

    // portfolio reference
    IPortfolio private portfolio;

    event PortfolioSet(IPortfolio _oldPortfolio, IPortfolio _newPortfolio);
    event TradePairsSet(ITradePairs _oldTradePairs, ITradePairs _newTradePairs);

    function initialize() public initializer {
        __AccessControl_init();

        // intitialize the admins
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // set deployment account to have DEFAULT_ADMIN_ROLE
    }

    function owner() public view returns(address) {
        return getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    }

    function addAdmin(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-01");
        grantRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function removeAdmin(address _address) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-02");
        require(getRoleMemberCount(DEFAULT_ADMIN_ROLE)>1, "E-ALOA-01");
        revokeRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function isAdmin(address _address) public view returns(bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    // FRONTEND FUNCTION TO GET A LIST OF TRADE PAIRS
    function getTradePairs() public view returns(bytes32[] memory) {
         return tradePairs.getTradePairs();
    }

     // DEPLOYMENT ACCOUNT FUNCTION TO UPDATE FEE RATES FOR DEPOSIT AND WITHDRAW
    function updateTransferFeeRate(uint _rate, IPortfolio.Tx _rateType) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-03");
        portfolio.updateTransferFeeRate(_rate, _rateType);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO UPDATE FEE RATE EXECUTIONS
    function updateRate(bytes32 _tradePair, uint _rate, ITradePairs.RateType _rateType) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-04");
        tradePairs.updateRate(_tradePair, _rate, _rateType);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO GET MAKER FEE RATE
    function getMakerRate(bytes32 _tradePairId) public view returns (uint) {
        return tradePairs.getMakerRate(_tradePairId);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO GET TAKER FEE RATE
    function getTakerRate(bytes32 _tradePairId) public view returns (uint) {
        return tradePairs.getTakerRate(_tradePairId);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO SET PORTFOLIO FOR THE EXCHANGE
    function setPortfolio(IPortfolio _portfolio) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-05");
        emit PortfolioSet(portfolio, _portfolio);
        portfolio = _portfolio;
    }

    // FRONTEND FUNCTION TO GET PORTFOLIO
    function getPortfolio() public view returns(IPortfolio) {
        return portfolio;
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO SET TRADEPAIRS FOR THE EXCHANGE
    function setTradePairs(ITradePairs _tradePairs) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-06");
        emit TradePairsSet(tradePairs, _tradePairs);
        tradePairs = _tradePairs;
    }

    // FRONTEND FUNCTION TO GET TRADEPAIRS
    function getTradePairsAddr() public view returns(ITradePairs) {
        return tradePairs;
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO ADD A NEW TRADEPAIR
    function addTradePair(bytes32 _tradePairId,
                          address _baseAssetAddr, uint8 _baseDisplayDecimals,
                          address _quoteAssetAddr, uint8 _quoteDisplayDecimals,
                          uint _minTradeAmount, uint _maxTradeAmount)
            public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-07");
        (bytes32 _baseAssetSymbol, uint8 _baseAssetDecimals) = getAssetMeta(_baseAssetAddr);
        (bytes32 _quoteAssetSymbol, uint8 _quoteAssetDecimals) = getAssetMeta(_quoteAssetAddr);
        // check if base asset is native AVAX, if not it is ERC20 and add it
        if (_baseAssetSymbol != bytes32("AVAX")) {
            portfolio.addToken(_baseAssetSymbol, IERC20Metadata(_baseAssetAddr));
        }
        // check if quote asset is native AVAX, if not it is ERC20 and add it
        if (_quoteAssetSymbol != bytes32("AVAX")) {
            portfolio.addToken(_quoteAssetSymbol, IERC20Metadata(_quoteAssetAddr));
        }
        tradePairs.addTradePair(_tradePairId,
                                _baseAssetSymbol, _baseAssetDecimals, _baseDisplayDecimals,
                                _quoteAssetSymbol, _quoteAssetDecimals, _quoteDisplayDecimals,
                                _minTradeAmount, _maxTradeAmount);
    }

    function getAssetMeta(address _assetAddr) private view returns (bytes32 _symbol, uint8 _decimals) {
        if (_assetAddr == address(0)) {
            return (bytes32("AVAX"), 18);
        } else {
            IERC20Metadata _asset = IERC20Metadata(_assetAddr);
            return (StringLibrary.stringToBytes32(_asset.symbol()), _asset.decimals());
        }
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO PAUSE AND UNPAUSE THE PORTFOLIO CONTRACT - AFFECTS ALL DEPOSIT AND WITHDRAW FUNCTIONS
    function pausePortfolio(bool _paused) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-08");
        if (_paused) {
            portfolio.pause();
        } else {
            portfolio.unpause();
        }
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO DISABLE ONLY DEPOSIT FUNCTIONS
    function pauseDeposit(bool _paused) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-09");
        portfolio.pauseDeposit(_paused);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO PAUSE AND UNPAUSE THE TRADEPAIRS CONTRACT
    // AFFECTS BOTH ADDORDER AND CANCELORDER FUNCTIONS FOR ALL TRADE PAIRS
    function pauseTrading(bool _tradingPaused) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-10");
        if (_tradingPaused) {
            tradePairs.pause();
        } else {
            tradePairs.unpause();
        }
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO PAUSE AND UNPAUSE THE TRADEPAIRS CONTRACT
    // AFFECTS BOTH ADDORDER AND CANCELORDER FUNCTIONS FOR A SELECTED TRADE PAIR
    function pauseTradePair(bytes32 _tradePairId, bool _tradePairPaused) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-11");
        tradePairs.pauseTradePair(_tradePairId, _tradePairPaused);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO DISABLE ONLY ADDORDER FUNCTION FOR A TRADEPAIR
    function pauseAddOrder(bytes32 _tradePairId, bool _addOrderPaused) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-12");
        tradePairs.pauseAddOrder(_tradePairId, _addOrderPaused);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO ADD AN ORDER TYPE TO A TRADEPAIR
    function addOrderType(bytes32 _tradePairId, ITradePairs.Type1 _type) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-13");
        tradePairs.addOrderType(_tradePairId, _type);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO REMOVE AN ORDER TYPE FROM A TRADEPAIR
    function removeOrderType(bytes32 _tradePairId, ITradePairs.Type1 _type) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-14");
        tradePairs.removeOrderType(_tradePairId, _type);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO SET MIN TRADE AMOUNT FOR A TRADEPAIR
    function setMinTradeAmount(bytes32 _tradePairId, uint _minTradeAmount) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-15");
        tradePairs.setMinTradeAmount(_tradePairId, _minTradeAmount);
    }

    // FRONTEND FUNCTION TO GET MIN TRADE AMOUNT
    function getMinTradeAmount(bytes32 _tradePairId) public view returns (uint) {
        return tradePairs.getMinTradeAmount(_tradePairId);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO SET MAX TRADE AMOUNT FOR A TRADEPAIR
    function setMaxTradeAmount(bytes32 _tradePairId, uint _maxTradeAmount) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-16");
        tradePairs.setMaxTradeAmount(_tradePairId, _maxTradeAmount);
    }

    // FRONTEND FUNCTION TO GET MAX TRADE AMOUNT
    function getMaxTradeAmount(bytes32 _tradePairId) public view returns (uint) {
        return tradePairs.getMaxTradeAmount(_tradePairId);
    }

    // FRONTEND FUNCTION TO SET DISPLAY DECIMALS
    function setDisplayDecimals(bytes32 _tradePairId, uint8 _displayDecimals, bool _isBase) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-17");
        tradePairs.setDisplayDecimals(_tradePairId, _displayDecimals, _isBase);
    }

    // FRONTEND FUNCTION TO GET DISPLAY DECIMALS
    function getDisplayDecimals(bytes32 _tradePairId, bool _isBase) public view returns(uint8) {
        return tradePairs.getDisplayDecimals(_tradePairId, _isBase);
    }

    // FRONTEND FUNCTION TO GET DECIMALS
    function getDecimals(bytes32 _tradePairId, bool _isBase) public view returns(uint8) {
         return tradePairs.getDecimals(_tradePairId, _isBase);
    }

    // FRONTEND FUNCTION TO GET DECIMALS
    function getSymbol(bytes32 _tradePairId, bool _isBase) public view returns(bytes32) {
         return tradePairs.getSymbol(_tradePairId, _isBase);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO SET ALLOWED SLIPPAGE PERCENT
    function setAllowedSlippagePercent(bytes32 _tradePairId, uint8 _allowedSlippagePercent) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-18");
        tradePairs.setAllowedSlippagePercent(_tradePairId, _allowedSlippagePercent);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO GET ALLOWED SLIPPAGE PERCENT
    function getAllowedSlippagePercent(bytes32 _tradePairId) public view returns (uint8) {
        return tradePairs.getAllowedSlippagePercent(_tradePairId);
    }

    // DEPLOYMENT ACCOUNT FUNCTION TO ADD A NEW TOKEN
    // NEEDS TO BE CALLED ONLY AFTER PORTFOLIO IS SET FOR EXCHANGE AND PORTFOLIO OWNERSHIP IS CHANGED TO EXCHANGE
    function addToken(bytes32 _symbol, IERC20 _token) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "E-OACC-19");
        portfolio.addToken(_symbol, _token);
    }

    fallback() external {}

    // utility function to convert string to bytes32
    function stringToBytes32(string memory _string) public pure returns (bytes32 result) {
        return _string.stringToBytes32();
    }

    // utility function to convert bytes32 to string
    function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
        return _bytes32.bytes32ToString();
    }

}
