/**
 * The test runner for trading on Dexalot decentralized exchange
 */

import Utils from './utils';

import BigNumber from 'bignumber.js';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    MockToken,
    MockToken__factory,
    ExchangeSub,
    PortfolioMain,
    PortfolioSub,
    TradePairs,
    OrderBooks,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { assert, expect } from "chai";
import { ethers } from "hardhat";

import TradePairsAbi from '../artifacts/contracts/TradePairs.sol/TradePairs.json';

let MockToken: MockToken__factory;

// using the first numberOfAccounts accounts
const numberOfAccounts = 3;

// fee rates
const makerRate = BigNumber(0.0010);
const takerRate = BigNumber(0.0020);

// initial state
// do transfers to Portfolio contract as follows before starting tests
const tokens: string[] = ["AVAX", "USDT", "ALOT"];

const decimalsMap: any = {"AVAX": 18, "USDT": 6, "ALOT": 18, "LINK": 18, "BTC": 8}

const native = "AVAX";

const tokenList: string[] = ["USDT", "ALOT"];

const tokenPairs: string[] = ["AVAX/USDT", "ALOT/USDT"];

const minTradeAmountMap: any = {"AVAX/USDT": 10, "ALOT/USDT": 10}

const maxTradeAmountMap: any = {"AVAX/USDT": 1000, "ALOT/USDT": 1000}

const baseDisplayDecimalMap: any = {"AVAX/USDT": 3, "ALOT/USDT": 3}

const quoteDisplayDecimalMap: any = {"AVAX/USDT": 3, "ALOT/USDT": 3}

const initial_mints: any = {AVAX: 3000, USDT: 5000, ALOT: 5000};

const initial_portfolio_deposits: any = {AVAX: 1000, USDT: 3000, ALOT: 3000};

const options: any = { };

// address (a multisig in production) that collects the fees
const feeSafe = '0x48a04b706548F7034DC50bafbF9990C6B4Bff177'

let wallets: Array<SignerWithAddress>;
let accounts: Array<string>;

let deploymentWallet: SignerWithAddress;
let deploymentAccount: string;

let exchange: ExchangeSub
let portfolio: PortfolioSub
let portfolioMain: PortfolioMain
let tradePairs: TradePairs
let orderBooks: OrderBooks


let _tokenStr: string;
let _tokenDecimals: number;
let _tokenBytes32: string;
let _tokenAddr: string;
let _token: MockToken;

describe("Dexalot", () => {

    before(async () => {

        wallets = await ethers.getSigners();
        accounts = [];
        for (let i=0; i<numberOfAccounts; i++) {
            accounts[i] = wallets[i].address;
        }
        console.log("=== Accounts ===");
        console.log(accounts);
        console.log();

        MockToken = await ethers.getContractFactory("MockToken") as MockToken__factory;

        deploymentWallet = wallets[0];
        deploymentAccount = deploymentWallet.address;
        console.log("deploymentAccount =", deploymentAccount);

        const portfolioContracts = await f.deployCompletePortfolio(true);
        portfolioMain = portfolioContracts.portfolioAvax;
        portfolio = portfolioContracts.portfolioSub;
        const alotMain =  portfolioContracts.alot;

        orderBooks = await f.deployOrderBooks();
        exchange = await f.deployExchangeSub(portfolio, orderBooks)
        tradePairs = await f.deployTradePairs(orderBooks, portfolio, exchange);


        // initialize address collecting fees
        console.log("=== Set Address Collecting the Fees ===");
        await portfolio.setFeeAddress(feeSafe);
        console.log("Called setFeeAddress on Portfolio ");

        console.log();
        console.log("=== Creating and Minting Mock Tokens ===");

        //const srcChainId = 1;
        const auctionMode: any = 0;

        for (const element of tokenList) {
            _tokenStr = element;
            _tokenBytes32 = Utils.fromUtf8(_tokenStr);
            _tokenDecimals = decimalsMap[_tokenStr];

            if (_tokenStr !== "ALOT") {
                _token = await f.deployMockToken(_tokenStr, _tokenDecimals);
                await f.addToken(portfolioMain, portfolio, _token, 0.1, auctionMode);
            } else {
                _token = alotMain;
            }
            //await f.addToken(portfolioMain, _token, 0.1, auctionMode);
            for (let i=0; i<numberOfAccounts; i++) {
                const account = accounts[i];
                //console.log("Account:", account, "before minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
                const _mint_amount = initial_mints[_tokenStr] - Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals);
                if (_mint_amount>0) {
                    await _token.mint(account, Utils.parseUnits(_mint_amount.toString(), _tokenDecimals));
                    //console.log("Account:", account, "after minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
                }
            }
        }

        const tokenAddressMap: any = {};
        tokenAddressMap["AVAX"] = "0x0000000000000000000000000000000000000000";
        for (const element of tokenList) {
            _tokenStr = element;
            _tokenAddr = await portfolioMain.getToken(Utils.fromUtf8(_tokenStr));
            _token = MockToken.attach(_tokenAddr);
            tokenAddressMap[_tokenStr] = _token.address;
        }
        console.log(tokenAddressMap);

        console.log();
        console.log("=== Making Initial Portfolio Deposits ===");
        for (let i=0; i<numberOfAccounts; i++) {
            const wallet = wallets[i];
            const account = accounts[i];

            // deposit native coin for account to portfolio
            console.log(native);
            const _nativeBytes32 = Utils.fromUtf8(native);
            let _bal = await portfolio.getBalance(account, _nativeBytes32);
            Utils.printBalances(account, _bal, 18);
            if ((parseFloat(Utils.fromWei(_bal.total)) + parseFloat(Utils.fromWei(_bal.available))) < initial_portfolio_deposits[native]) {
                const _deposit_amount = initial_portfolio_deposits[native] - Utils.fromWei(_bal.total) - Utils.fromWei(_bal.available);
                await wallet.sendTransaction({to: portfolioMain.address,
                                              value: Utils.toWei(_deposit_amount.toString())});
                //console.log("Deposited for", account, _deposit_amount, native, "to portfolio.");
                _bal = await portfolio.getBalance(account, _nativeBytes32);
                Utils.printBalances(account, _bal, 18);
            }
            console.log();

            // deposit ERC20 token for account to portfolio
            for (const element of tokenList) {
                _tokenStr = element;
                _tokenBytes32 = Utils.fromUtf8(_tokenStr);
                _tokenAddr = await portfolioMain.getToken(_tokenBytes32);
                console.log(`${_tokenStr} @ ${_tokenAddr}`)
                _token = MockToken.attach(_tokenAddr);
                _tokenDecimals = await _token.decimals();
                _bal = await portfolio.getBalance(account, _tokenBytes32);
                Utils.printBalances(account, _bal, _tokenDecimals);
                if ((parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) + parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals))) < initial_portfolio_deposits[_tokenStr]) {
                    const _deposit_amount = initial_portfolio_deposits[_tokenStr] - parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) - parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals));
                    const _deposit_amount_bn = Utils.parseUnits(_deposit_amount.toString(), _tokenDecimals);
                    await _token.connect(wallet).approve(portfolioMain.address, _deposit_amount_bn, options);
                    //console.log("Approve:", account, "to deposit ", _deposit_amount, _tokenStr, "to portfolio.");
                    await portfolioMain.connect(wallet).depositToken(account, _tokenBytes32, _deposit_amount_bn, 0, options);
                    //console.log("Deposit:", account, _deposit_amount, _tokenStr, "to portfolio.");
                    _bal = await portfolio.getBalance(account, _tokenBytes32);
                    Utils.printBalances(account, _bal, _tokenDecimals);
                }
                console.log();
            }
        }

        // initialize Exchange contract and create the TradePairs  "AVAX/USDT" "ALOT/USDT" ....
        console.log("=== Initialize Exchange Contract ===");
        //exchange = await f.deployExchangeSub(portfolio, tradePairs)
        console.log("ExchangeSub contract deployed at: ", exchange.address)

        const pairs: any = [];
        for (const element of tokenPairs) {
            const pair = element
            const symbols = pair.split("/", 2);
            const baseSymbol = symbols[0];
            const quoteSymbol = symbols[1];
            const tokenAddr = await portfolioMain.getToken(Utils.fromUtf8(quoteSymbol));
            const token = MockToken.attach(tokenAddr);
            pairs.push({id: pair, pairIdAsBytes32: Utils.fromUtf8(pair), baseSymbol, quoteSymbol,
                        baseDecimals: 18, basePriceDecimal: baseDisplayDecimalMap[pair],
                        quoteDecimals: await token.decimals(), quotePriceDecimal: quoteDisplayDecimalMap[pair],
                        minTradeAmount: minTradeAmountMap[pair], maxTradeAmount: maxTradeAmountMap[pair]});
        }

        for (const pair of pairs)  {
            const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32
            await exchange.addTradePair(tp,
                                        Utils.fromUtf8(pair.baseSymbol), pair.basePriceDecimal,
                                        Utils.fromUtf8(pair.quoteSymbol),  pair.quotePriceDecimal,
                                        Utils.parseUnits((pair.minTradeAmount).toString(), pair.quoteDecimals),
                                        Utils.parseUnits((pair.maxTradeAmount).toString(), pair.quoteDecimals), 0);
            console.log(`${pair.id} added to TradePairs at ${tradePairs.address} with min trade amount of ${pair.minTradeAmount}.`)
            await tradePairs.addOrderType(tp, 0)  // 0 = MARKET, 1 = LIMIT
            console.log(`MARKET order type added to ${pair.id} at ${tradePairs.address}.`)
            await tradePairs.updateRate(tp, 10, 0)
            console.log(`${pair.id} at ${tradePairs.address} has its MAKER fee rate updated to 10/10000.`)
            await tradePairs.updateRate(tp, 20, 1)
            console.log(`${pair.id} at ${tradePairs.address} has its TAKER fee rate updated to 20/10000.`)
        }

        // get native list at system start-up
        console.log();
        console.log("=== Native Coin at Start-Up ===");
        const _native = await portfolio.native(); // return is bytes32[]
        console.log(Utils.toUtf8(_native));

        // get token list at system start-up
        console.log();
        console.log("=== ERC20 Token List at Start-Up ===");
        const _tokenList = await portfolio.getTokenList(); // return is bytes32[]
        for (const element of _tokenList) {
            console.log(Utils.toUtf8(element));
        }

        // check all balances at the start of orders processing
        console.log();
        console.log("=== Portfolio State Before Processing Orders ===");
        for (let i=0; i<numberOfAccounts; i++) {
            const account = accounts[i];
            for (const element of tokens) {
                const token = element;
                const res = await portfolio.getBalance(account, Utils.fromUtf8(token));
                Utils.printBalances(account, res, decimalsMap[token]);
            }
        }
    });

    it("Should run the simulated orders correctly", async () => {

        /*** ORDER SIMULATION STARTS HERE ***/
        // orders that are read from file and cleaned for processing
        const orders = [];

        // 1-to-1 key-value map between clientOrderId and Order address
        const orderMap = new Map();  // orderMap: clientOrderId  -->  Order

        // initialize accumulator to check Fee contract state after each order in tests
        const feeLumped: any = {}
        for (const element of tokens) {
            feeLumped[element] = BigNumber(0);
        }

        // initialize accumulator to check Portfolio contract state per user per token after each order
        console.log();
        console.log("=== Accounts used ===");
        const portfolioUser: any = {}
        for (let i=0; i<numberOfAccounts; i++) {
            const owner = accounts[i];
            console.log(i, " :: ", owner);
            portfolioUser[owner] = {};
            for (const element of tokens) {
                const token = element;
                portfolioUser[owner][token] = {};
                portfolioUser[owner][token]['total'] = BigNumber(initial_portfolio_deposits[token] );
                portfolioUser[owner][token]['available'] = BigNumber(initial_portfolio_deposits[token] );
            }
        }

        let simNum = 1;

        // process orders sequentially and compare results between contract and calculations
        console.log();
        console.log("=== Reading Orders ===");
        const ordersRaw = await Utils.loadOrders('./test/data/01_TestOrderBook.csv');

        for (const element of ordersRaw) {
            // skip over empty lines
            if (!element["clientOrderId"]) { continue; }

            // skip over comment lines added for the group of orders to document tests
            if (element["clientOrderId"][0] === "#") { continue; }

            const order: any = element;
            order["ownerIndex"] = parseInt(order["owner"]);
            order["owner"] = accounts[order["ownerIndex"]];
            order["price"] = BigNumber(order["price"]);
            order["quantity"] = BigNumber(order["quantity"]);
            order["quantityFilled"] = BigNumber(order["quantityFilled"]);
            order["totalQuantityFilled"] = BigNumber(order["totalQuantityFilled"]);

            orders.push(order);
            console.log("Order :: ", "clientOrderId: ", order["clientOrderId"], "owner: ", order["owner"]);
        }

        console.log();
        console.log("=== Processing Orders ===");
        for (const element of orders) {

            const order = element;                // simulated order from file
            let orderLog: any = {};               // return values from transaction receipt

            // reference for enums in ITradePairs.sol
            // enum Side         {BUY, SELL}
            // enum Type1        {MARKET, LIMIT, STOP, STOPLIMIT}
            // enum Status       {NEW, REJECTED, PARTIAL, FILLED, CANCELED, EXPIRED, KILLED}
            // enum RateType     {MAKER, TAKER}
            // enum Type2        {GTC, FOK, IOC, PO}
            // enum AuctionMode  {OFF, LIVETRADING, OPEN, CLOSING, PAUSED, MATCHING, RESTRICTED}

            console.log();
            console.log("+++++++++++++++++++++++++++++++++++++++++++ START :: SIM # ", simNum, "+++++++++++++++++++++++++++++++++++++++++++");
            console.log();
            console.log("Order Id >> ", order["clientOrderId"], " ::: Action: ", order["action"], " ::: Owner account: ", order["owner"]);
            console.log();

            const acc = wallets[order["ownerIndex"]];

            // get the TradePairs for this order
            const tradePair: TradePairs = new ethers.Contract(tradePairs.address, TradePairsAbi.abi, wallets[order["ownerIndex"]]) as TradePairs;
            const tradePairId = Utils.fromUtf8(order["tradePair"]);

            const baseDecimals = (await tradePair.getTradePair(tradePairId)).baseDecimals;
            const quoteDecimals = (await tradePair.getTradePair(tradePairId)).quoteDecimals;

            // ADD NEW ORDERS TO TRADEPAIR
            if (order["action"] === "ADD") {

                // add order
                const _side = order["side"] === "BUY" ? 0 : 1;

                let _type1;
                let _type2;

                if (order["type1"] === "MARKET") {
                    _type1 =0

                } else if (order["type1"] === "LIMIT") {
                    _type1 =1

                }

                if (order["type2"] === "GTC") {
                    _type2 =0

                } else if (order["type2"] === "FOK") {
                    _type2 =1

                } else if (order["type2"] === "IOC") {
                    _type2 =2

                }else if (order["type2"] === "PO") {
                    _type2 =3
                }

                const tx = await tradePair.connect(acc).addOrder(
                    acc.address,
                    Utils.fromUtf8(order["clientOrderId"]),
                    tradePairId,
                    Utils.parseUnits(order["price"].toString(), quoteDecimals),
                    Utils.parseUnits(order["quantity"].toString(), baseDecimals),
                    _side,
                    ethers.BigNumber.from(_type1),
                    ethers.BigNumber.from(_type2),
                );
                orderLog = await tx.wait();

                // add orders affected by this addition to the orderMap
                for (const element of orderLog.events) {
                    if (element.event) {
                        const _log = element;
                        if (_log.event === 'OrderStatusChanged') {
                            const _id = _log.args.orderId;
                            const _orders = [...orderMap.values()];
                            if (!_orders.includes(_id)) {
                                orderMap.set(order["clientOrderId"], {'id': _id, 'order': order});
                            }
                        }
                    }
                }

                // remove from available for new orders
                if (order["status"] === "NEW") {
                    if (order["side"] === "BUY") {
                        portfolioUser[order["owner"]][order["quoteSymbol"]]["available"] =
                            portfolioUser[order["owner"]][order["quoteSymbol"]]["available"]
                                .minus(order["price"].times(order["quantity"])
                                    .dp(decimalsMap[order["quoteSymbol"]], BigNumber.ROUND_FLOOR));
                    } else {
                        portfolioUser[order["owner"]][order["baseSymbol"]]["available"] =
                            portfolioUser[order["owner"]][order["baseSymbol"]]["available"]
                                .minus(order["quantity"]);
                    }
                }
            }

             // CANCEL orders from TradePair
            if (order["action"] === "CANCEL") {
                // cancel order
                const tx = await tradePair.connect(acc).cancelOrder(orderMap.get(order["clientOrderId"]).id);
                orderLog = await tx.wait();

                // add remaining quantity back to available
                if (order["side"] === "BUY") {
                    portfolioUser[order["owner"]][order["quoteSymbol"]]["available"] =
                        portfolioUser[order["owner"]][order["quoteSymbol"]]["available"]
                            .plus(order["price"].times(order["quantity"].minus(order["quantityFilled"]))
                                .dp(decimalsMap[order["quoteSymbol"]], BigNumber.ROUND_FLOOR));
                } else {
                    portfolioUser[order["owner"]][order["baseSymbol"]]["available"] =
                        portfolioUser[order["owner"]][order["baseSymbol"]]["available"]
                            .plus(order["quantity"].minus(order["quantityFilled"]));
                }
            }

            const makerOrder = [];
            let takerOrder = '';
            const makerFee = [];
            const takerFee = [];
            if (order["action"] === "ADD") {
                for (const element of orderLog.events) {
                    if (element.event) {
                        const _log = element;
                        if (_log.event === 'Executed') {
                            makerOrder.push(_log.args.makerOrder);
                            makerFee.push(_log.args.feeMaker);
                            takerOrder = _log.args.takerOrder;
                            takerFee.push(_log.args.feeTaker);
                        }
                    }
                }
            }

            console.log("clientOrderId =", order["clientOrderId"], ", ", "orderId =", orderMap.get(order["clientOrderId"]).id);

            console.log();
            console.log("price :::", order['price'].toString());
            console.log("quantity :::", order['quantity'].toString());
            console.log("side :::", order['side'].toString());
            console.log("type1 :::", order['type1'].toString());
            console.log();

            let tOrderId
            let tOrder

            if (takerOrder) {
                tOrderId = Utils.getMapKeyByValue(orderMap, takerOrder);
                tOrder = orderMap.get(tOrderId).order;
                tOrder["quantityFilled"] = BigNumber(0);
                tOrder["totalQuantityFilled"] = BigNumber(0);
            }
            // calculate portfolio changes for executions
            for (let j=0; j<makerOrder.length; j++) {
                const mOrderId = Utils.getMapKeyByValue(orderMap, makerOrder[j]);
                //console.log(makerOrder[j])
                //console.log(orderMap.get(mOrderId))
                const mOrder = orderMap.get(mOrderId).order;

                let feeBase = BigNumber(0);
                let feeQuote = BigNumber(0);

                //tOrder already has quantityFilled value filled out when received from the contract
                const quantityFilled = BigNumber.minimum(getRemainingQuantity(mOrder), getRemainingQuantity(tOrder));
                tOrder["quantityFilled"] = quantityFilled;
                tOrder["totalQuantityFilled"] = tOrder["totalQuantityFilled"].plus(quantityFilled);
                mOrder["quantityFilled"] = quantityFilled;
                mOrder["totalQuantityFilled"] = mOrder["totalQuantityFilled"].plus(quantityFilled);
                // maker order sets the price
                const fillPrice = mOrder["price"];

                // portfolioUser total
                if (mOrder.side === "BUY") {  // if mOrder.side = BUY then tOrder.side = SELL

                    // fillPrice x quantityFilled floor to quoteDecimals
                    const fp_times_qf = (fillPrice.times(quantityFilled)).dp(decimalsMap[mOrder["baseSymbol"]], BigNumber.ROUND_FLOOR);

                    // calculate fees
                    feeBase = quantityFilled.times(makerRate).dp(3, BigNumber.ROUND_FLOOR);
                    feeQuote = fp_times_qf.times(takerRate).dp(3, BigNumber.ROUND_FLOOR);

                    // total
                    // decrease maker quote
                    portfolioUser[mOrder["owner"]][mOrder["quoteSymbol"]]["total"] =
                        portfolioUser[mOrder["owner"]][mOrder["quoteSymbol"]]["total"].minus(fp_times_qf);

                    // increase taker quote
                    portfolioUser[tOrder["owner"]][tOrder["quoteSymbol"]]["total"] =
                        portfolioUser[tOrder["owner"]][tOrder["quoteSymbol"]]["total"].plus(fp_times_qf.minus(feeQuote));

                    // increase maker base
                    portfolioUser[mOrder["owner"]][mOrder["baseSymbol"]]["total"] =
                        portfolioUser[mOrder["owner"]][mOrder["baseSymbol"]]["total"].plus(quantityFilled.minus(feeBase));

                    // decrase taker base
                    portfolioUser[tOrder["owner"]][tOrder["baseSymbol"]]["total"] =
                        portfolioUser[tOrder["owner"]][tOrder["baseSymbol"]]["total"].minus(quantityFilled);

                    // available
                    portfolioUser[mOrder["owner"]][mOrder["baseSymbol"]]["available"] =
                        portfolioUser[mOrder["owner"]][mOrder["baseSymbol"]]["available"].plus(quantityFilled.minus(feeBase));

                    portfolioUser[tOrder["owner"]][tOrder["quoteSymbol"]]["available"] =
                        portfolioUser[tOrder["owner"]][tOrder["quoteSymbol"]]["available"].plus(fp_times_qf.minus(feeQuote));

                    portfolioUser[tOrder["owner"]][tOrder["baseSymbol"]]["available"] =
                        portfolioUser[tOrder["owner"]][tOrder["baseSymbol"]]["available"].minus(quantityFilled);

                } else { // SELL

                    // fillPrice x quantityFilled floor to quoteDecimals
                    const fp_times_qf = (fillPrice.times(quantityFilled)).dp(decimalsMap[mOrder["baseSymbol"]], BigNumber.ROUND_FLOOR);

                    // calculate fees
                    feeBase = quantityFilled.times(takerRate).dp(3, BigNumber.ROUND_FLOOR);
                    feeQuote = fp_times_qf.times(makerRate).dp(3, BigNumber.ROUND_FLOOR);

                    // total
                    // increase maker quote
                    portfolioUser[mOrder["owner"]][mOrder["quoteSymbol"]]["total"] =
                        portfolioUser[mOrder["owner"]][mOrder["quoteSymbol"]]["total"].plus(fp_times_qf.minus(feeQuote));

                    // decrease taker quote
                    portfolioUser[tOrder["owner"]][tOrder["quoteSymbol"]]["total"] =
                        portfolioUser[tOrder["owner"]][tOrder["quoteSymbol"]]["total"].minus(fp_times_qf);

                    // decrease maker base
                    portfolioUser[mOrder["owner"]][mOrder["baseSymbol"]]["total"] =
                        portfolioUser[mOrder["owner"]][mOrder["baseSymbol"]]["total"].minus(quantityFilled);

                    // increase taker base
                    portfolioUser[tOrder["owner"]][tOrder["baseSymbol"]]["total"] =
                        portfolioUser[tOrder["owner"]][tOrder["baseSymbol"]]["total"].plus(quantityFilled.minus(feeBase));

                    // available
                    portfolioUser[mOrder["owner"]][mOrder["quoteSymbol"]]["available"] =
                        portfolioUser[mOrder["owner"]][mOrder["quoteSymbol"]]["available"].plus(fp_times_qf.minus(feeQuote));

                    portfolioUser[tOrder["owner"]][tOrder["baseSymbol"]]["available"] =
                        portfolioUser[tOrder["owner"]][tOrder["baseSymbol"]]["available"].plus(quantityFilled.minus(feeBase));

                    portfolioUser[tOrder["owner"]][tOrder["quoteSymbol"]]["available"] =
                        portfolioUser[tOrder["owner"]][tOrder["quoteSymbol"]]["available"].minus(fillPrice.times(quantityFilled));
                }

                console.log("feeBase =", feeBase.toString());
                console.log("feeQuote =", feeQuote.toString());

                feeLumped[mOrder["baseSymbol"]] = feeLumped[mOrder["baseSymbol"]].plus(feeBase);
                feeLumped[tOrder["quoteSymbol"]] = feeLumped[tOrder["quoteSymbol"]].plus(feeQuote);

                console.log("maker order ::: ", "clientOrderId =", mOrder['clientOrderId'], ", ", "orderId =", makerOrder[j]);
                console.log("makerfee =", makerFee[j].toString());

                console.log("taker order ::: ", "clientOrderId =", tOrder['clientOrderId'], ", ", "orderId =", takerOrder);
                console.log("takerfee =", takerFee[j].toString());
            }

            // check portfolio balances for baseSymbol
            const balBase = await portfolio.getBalance(order["owner"], Utils.fromUtf8(order["baseSymbol"]));

            // check total
            let _checkName = "Potfolio balance ::: " + order["owner"] + " ::: " + order["baseSymbol"] + " ::: total";
            let _contractValue = BigNumber(Utils.formatUnits(balBase.total, baseDecimals));
            let _checkValue = portfolioUser[order["owner"]][order["baseSymbol"]]['total'];
            doNumberAssert(_checkName, _contractValue, _checkValue);

            // check available
            _checkName = "Potfolio balance ::: " + order["owner"] + " ::: " + order["baseSymbol"] + " ::: avail";
            _contractValue = BigNumber(Utils.formatUnits(balBase.available, baseDecimals));
            _checkValue = portfolioUser[order["owner"]][order["baseSymbol"]]['available'];
            doNumberAssert(_checkName, _contractValue, _checkValue);

            // check portfolio balances for quoteSymbol
            const balQuote = await portfolio.getBalance(order["owner"], Utils.fromUtf8(order["quoteSymbol"]));

            // check total
            _checkName = "Potfolio balance ::: " + order["owner"] + " ::: " + order["quoteSymbol"] + " ::: total";
            _contractValue = BigNumber(Utils.formatUnits(balQuote.total, quoteDecimals));
            _checkValue = portfolioUser[order["owner"]][order["quoteSymbol"]]['total'];
            doNumberAssert(_checkName, _contractValue, _checkValue);

            // check available
            _checkName = "Potfolio balance ::: " + order["owner"] + " ::: " + order["quoteSymbol"] + " ::: avail";
            _contractValue = BigNumber(Utils.formatUnits(balQuote.available, quoteDecimals));
            _checkValue = portfolioUser[order["owner"]][order["quoteSymbol"]]['available'];
            doNumberAssert(_checkName, _contractValue, _checkValue);

            const feeAddress = await portfolio.feeAddress();
            // fail for non-admin
            await portfolio.revokeRole(await portfolio.DEFAULT_ADMIN_ROLE(), wallets[5].address);
            await expect(portfolio.connect(wallets[5]).withdrawFees(feeAddress, 10))
            .to.be.revertedWith("AccessControl:");

            await portfolio.grantRole(await portfolio.DEFAULT_ADMIN_ROLE(), wallets[0].address);

            //fail for non-treasury or non-feeAddress
            await expect(portfolio.connect(wallets[0]).withdrawFees(wallets[0].address, 10))
            .to.be.revertedWith("P-OWTF-01");

            const treasury = await portfolio.getTreasury();
            await portfolio.connect(wallets[0]).withdrawFees(feeAddress, 10);
            await portfolio.connect(wallets[0]).withdrawFees(treasury, 10);

            // check fee balance for base symbol
            _checkName = "Fee balance ::: " + order["baseSymbol"];
            if (order["baseSymbol"] === "AVAX") {
                _contractValue = BigNumber(Utils.formatUnits(await ethers.provider.getBalance(feeSafe), decimalsMap['AVAX']));
            } else {
                const baseTokenAddr = await portfolioMain.getToken(Utils.fromUtf8(order["baseSymbol"]));
                const token = MockToken.attach(baseTokenAddr);
                _contractValue = BigNumber(Utils.formatUnits(await token.balanceOf(feeSafe), decimalsMap[order["baseSymbol"]]));
            }
            _checkValue = feeLumped[order["baseSymbol"]];
            doNumberAssert(_checkName, _contractValue, _checkValue);

            // check fee balance for quote symbol
            _checkName = "Fee balance ::: " + order["quoteSymbol"];
            if (order["quoteSymbol"] === "AVAX") {
                _contractValue = BigNumber(Utils.formatUnits(await ethers.provider.getBalance(feeSafe), decimalsMap['AVAX']));
            } else {
                const baseTokenAddr = await portfolioMain.getToken(Utils.fromUtf8(order["quoteSymbol"]));
                const token = MockToken.attach(baseTokenAddr);
                _contractValue = BigNumber(Utils.formatUnits(await token.balanceOf(feeSafe), decimalsMap[order["quoteSymbol"]]));
            }
            _checkValue = feeLumped[order["quoteSymbol"]];
            doNumberAssert(_checkName, _contractValue, _checkValue);

            console.log();
            console.log("-------------------------------------------- END :: SIM # ", simNum++, "--------------------------------------------");
            console.log();
        }

        // Portfolio contract final checks
        console.log()
        console.log("===== PORTFOLIO CONTRACT END STATE =====")
        for (let i=0; i<numberOfAccounts; i++) {
            const _owner = accounts[i];
            console.log(_owner);
            for (const element of tokens) {
                _tokenStr = element;
                const _bal = await portfolio.getBalance(_owner, Utils.fromUtf8(_tokenStr));

                // check total
                let _checkName = "Ending Potfolio contract balance ::: " + _tokenStr + " ::: total";
                let _contractValue = BigNumber(Utils.formatUnits(_bal.total, decimalsMap[_tokenStr]));
                let _checkValue = portfolioUser[_owner][_tokenStr]['total'];
                doNumberAssert(_checkName, _contractValue, _checkValue);

                // check available
                _checkName = "Ending Potfolio contract balance ::: " + _tokenStr + " ::: avail";
                _contractValue = BigNumber(Utils.formatUnits(_bal.available, decimalsMap[_tokenStr]));
                _checkValue = portfolioUser[_owner][_tokenStr]['available'];
                doNumberAssert(_checkName, _contractValue, _checkValue);
            }
            console.log()
        }

        console.log("===== PORTFOLIO CONTRACT LUMPED END STATE =====")
        const portfolioLumped: any = {};
        for (const element of tokens) {
            portfolioLumped[element] = BigNumber(0);
        }

        for (let i=0; i<numberOfAccounts; i++) {
            const _owner = accounts[i];
            for (const element of tokens) {
                _tokenStr = element;
                const _bal = await portfolio.getBalance(_owner, Utils.fromUtf8(_tokenStr));
                portfolioLumped[_tokenStr] = portfolioLumped[_tokenStr].plus(BigNumber(Utils.formatUnits(_bal.total, decimalsMap[_tokenStr])));
            }
        }

        // portfolio lumped balance for native tokens
        let _checkName = "Ending Potfolio contract lumped balance ::: " + native + " ::: total";
        let _contractValue = BigNumber(Utils.formatUnits(await portfolio.tokenTotals(Utils.fromUtf8(native)), decimalsMap['AVAX']));
        let _checkValue = portfolioLumped[native];
        doNumberAssert(_checkName, _contractValue, _checkValue);

        // portfolio lumped balance for erc20 tokens
        for (const element of tokenList) {
            _tokenAddr = await portfolioMain.getToken(Utils.fromUtf8(element));
            _token = MockToken.attach(_tokenAddr);
            _checkName = "Ending Potfolio contract lumped balance ::: " + element + " ::: total";
            _contractValue = BigNumber(Utils.formatUnits(await portfolio.tokenTotals(Utils.fromUtf8(element)), await _token.decimals()));
            _checkValue = portfolioLumped[element]
            doNumberAssert(_checkName, _contractValue, _checkValue);
        }

        // Fees final checks
        console.log()
        console.log("===== FEE CONTRACT LUMPED END STATE =====")
        const feeAddress = await portfolio.feeAddress();
        await portfolio.withdrawFees(feeAddress, 10);

        for(const _token in feeLumped) {
            _checkName = "Ending Fee balance ::: " + _token;
            if (_token === "AVAX") {
                _contractValue = BigNumber(Utils.formatUnits(await ethers.provider.getBalance(feeSafe), decimalsMap['AVAX']));
            } else {
                const baseTokenAddr = await portfolioMain.getToken(Utils.fromUtf8(_token));
                const token = MockToken.attach(baseTokenAddr);
                _contractValue = BigNumber(Utils.formatUnits(await token.balanceOf(feeSafe), decimalsMap[_token]));
            }
            _checkValue = feeLumped[_token];
            doNumberAssert(_checkName, _contractValue, _checkValue);
        }

        console.log()
    });

}).timeout(60000);

function doNumberAssert(_checkName: any, _contractNumberValue: any, _checkNumberValue: any) {
    const diff = _contractNumberValue.minus(_checkNumberValue);
    console.log(`${_checkName} ::: Contract: ${_contractNumberValue}, Expected: ${_checkNumberValue}, Difference = ${diff}`);
    assert(_contractNumberValue.isEqualTo(_checkNumberValue), "incorrect " + _checkName + "=" + _checkNumberValue);
}

// function doStringAssert(_checkName: any, _contractStringValue: any, _checkStringValue: any) {
//     console.log(`${_checkName} ::: ${_contractStringValue} == ${_checkStringValue}`);
//     assert(_contractStringValue == _checkStringValue, "incorrect " + _checkName + "=" + _checkStringValue);
// }

function getRemainingQuantity(_order: any) {
    return _order["quantity"].minus(_order["totalQuantityFilled"]);
}
