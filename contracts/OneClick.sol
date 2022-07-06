// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/IPortfolio.sol";
import "./interfaces/ITradePairs.sol";

/**
*   @author "DEXALOT TEAM"
*   @title "OneClick: a contract to test some of the bridge functionalities"
*/

contract OneClick is Initializable, OwnableUpgradeable {
    // version
    bytes32 constant public VERSION = bytes32('1.4.0');

    // denominator for rate calculations
    uint constant private TENK = 10000;

    // reference to Portfolio contract
    IPortfolio public portfolio;

    // reference TradePairs contract
    ITradePairs public tradePairs;

    // native gas token
    bytes32 public native;

    function initialize (address _portfolio, address _tradePairs, bytes32 _native)
    public
    initializer
    {
        __Ownable_init();
        portfolio = IPortfolio(_portfolio);
        tradePairs = ITradePairs(_tradePairs);
        native = _native;
    }

    function getTradePairParameters(bytes32 _tradePairId, uint _price, uint _quantity)
    private
    view
    returns (bytes32 baseSymbol, bytes32 quoteSymbol, uint256 quoteAmount , uint256 takerRate)
    {
        baseSymbol = tradePairs.getSymbol(_tradePairId, true);
        quoteSymbol = tradePairs.getSymbol(_tradePairId, false);
        quoteAmount = tradePairs.getQuoteAmount(_tradePairId, _price, _quantity);
        takerRate = tradePairs.getTakerRate(_tradePairId);
    }

    function depositBuyWithdraw(bytes32 _tradePairId, uint _price, uint _quantity, ITradePairs.Type1 _type1)
    external
    payable
    {
        // get settings from the trade pair
        (bytes32 baseSymbol, bytes32 quoteSymbol, uint256 quoteAmount, uint256 takerRate) =
            getTradePairParameters(_tradePairId, _price, _quantity);

        // deposit
        if (quoteSymbol == native) {
            require(msg.value == quoteAmount, "OC-VSNE-01"); // value sent not exact
            portfolio.depositNative{value: msg.value}(payable(msg.sender));
        } else {
            require(msg.value == 0, "OC-VSNZ-01"); // value sent not zero
            portfolio.depositToken(msg.sender, quoteSymbol, quoteAmount);
        }

        // trade (buy)
        tradePairs.addOrderFrom(msg.sender, _tradePairId, _price, _quantity, ITradePairs.Side.BUY, _type1);

        // withdraw
        if (baseSymbol == native) {
            portfolio.withdrawNative(payable(msg.sender), _quantity * (TENK - takerRate) / TENK);
        } else {
            portfolio.withdrawToken(payable(msg.sender), baseSymbol, _quantity * (TENK - takerRate) / TENK);
        }
    }

    function depositSellWithdraw(bytes32 _tradePairId, uint _price, uint _quantity, ITradePairs.Type1 _type1)
    external
    payable
    {
        // get settings from the trade pair
        (bytes32 baseSymbol, bytes32 quoteSymbol, uint256 quoteAmount, uint256 takerRate) =
            getTradePairParameters(_tradePairId, _price, _quantity);

        // deposit
        if (baseSymbol == native) {
            require(msg.value == _quantity, "OC-VSNE-02"); // value sent not exact
            portfolio.depositNative{value: msg.value}(payable(msg.sender));
        } else {
            require(msg.value == 0, "OC-VSNZ-02"); // value sent not zero
            portfolio.depositToken(msg.sender, baseSymbol, _quantity);
        }

        // trade (sell)
        tradePairs.addOrderFrom(msg.sender, _tradePairId, _price, _quantity, ITradePairs.Side.SELL, _type1);

        // withdraw
        if (quoteSymbol == native) {
            portfolio.withdrawNative(payable(msg.sender), quoteAmount * (TENK - takerRate) / TENK);
        } else {
            portfolio.withdrawToken(payable(msg.sender), quoteSymbol, quoteAmount * (TENK - takerRate) / TENK);
        }
    }

    // don't accept send transaction
    receive()
    external
    payable
    {
        revert("OC-NREC-01");
    }

    // revert transaction if a non-existing function is called
    fallback()
    external
    {
        revert("OC-NFUN-01");
    }
}
