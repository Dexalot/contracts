
/**
 * The test runner for OrderBooks on Dexalot exchange
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    MockToken,
    MockToken__factory,
    LZEndpointMock,
    PortfolioBridge,
    ExchangeSub,
    PortfolioMain,
    PortfolioSub,
    TradePairs,
    OrderBooks,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { assert } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import TradePairsAbi from '../artifacts/contracts/TradePairs.sol/TradePairs.json';

let MockToken: MockToken__factory;

// using the first numberOfAccounts accounts
const numberOfAccounts = 3;

// initial state
// do transfers to Portfolio contract as follows before starting tests
const tokens: string[] = ["AVAX", "USDT", "BUSD"];

const decimalsMap: any = {"AVAX": 18, "USDT": 6, "BUSD": 18, "LINK": 18, "BTC": 8}

const native = "AVAX";

const tokenList: string[] = ["USDT", "BUSD"];

const tokenPairs: string[] = ["AVAX/USDT", "AVAX/BUSD"];

const minTradeAmountMap: any = {"AVAX/USDT": 10, "AVAX/BUSD": 10}

const maxTradeAmountMap: any = {"AVAX/USDT": 1000, "AVAX/BUSD": 1000}

const baseDisplayDecimalMap: any = {"AVAX/USDT": 3, "AVAX/BUSD": 3}

const quoteDisplayDecimalMap: any = {"AVAX/USDT": 3, "AVAX/BUSD": 3}

const initial_mints: any = {AVAX: 10000, USDT: 15000, BUSD: 50000};

const initial_portfolio_deposits: any = {AVAX: 9000, USDT: 14000, BUSD: 45000};

const options: any = { };

// address (a multisig in production) that collects the fees
const foundationSafe = '0x48a04b706548F7034DC50bafbF9990C6B4Bff177'

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

let pairs: any;

let orders: Array<any>;

describe("Dexalot [ @noskip-on-coverage ]", () => {

    before(async () => {
        wallets = await ethers.getSigners();
        accounts = [];
        for (let i=0; i<numberOfAccounts; i++) {
            accounts[i] = wallets[i].address;
        }
        console.log("=== Accounts ===");
        console.log(accounts);
        console.log();

        MockToken = await ethers.getContractFactory("MockToken");

        deploymentWallet = wallets[0];
        deploymentAccount = deploymentWallet.address;
        console.log("deploymentAccount =", deploymentAccount);

        const {portfolioMain: portfolioM, portfolioSub: portfolioS, lzEndpointMain, portfolioBridgeMain: pbrigeMain, portfolioBridgeSub: pbrigeSub, gasStation: gStation} = await f.deployCompletePortfolio();
        portfolioMain = portfolioM;
        portfolio = portfolioS;


        orderBooks = await f.deployOrderBooks();
        exchange = await f.deployExchangeSub(portfolio, orderBooks)
        tradePairs = await f.deployTradePairs(orderBooks, portfolio, exchange);

        console.log();
        console.log("=== Creating and Minting Mock Tokens ===");

        const auctionMode: any = 0;

        for (let j=0; j<tokenList.length; j++) {
            _tokenStr = tokenList[j];
            _tokenBytes32 = Utils.fromUtf8(_tokenStr);
            _tokenDecimals = decimalsMap[_tokenStr];
            _token = await f.deployMockToken(_tokenStr, _tokenDecimals);
            await f.addToken(portfolio, _token, 0.1, auctionMode);
            await f.addToken(portfolioMain, _token, 0.1, auctionMode);
            for (let i=0; i<numberOfAccounts; i++) {
                const account = accounts[i];
                console.log("Account:", account, "before minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
                const _mint_amount = initial_mints[_tokenStr] - Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals);
                if (_mint_amount>0) {
                    await _token.mint(account, Utils.parseUnits(_mint_amount.toString(), _tokenDecimals));
                    console.log("Account:", account, "after minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
                }
            }
        }

        const tokenAddressMap: any = {};
        tokenAddressMap["AVAX"] = "0x0000000000000000000000000000000000000000";
        for (let j=0; j<tokenList.length; j++) {
            _tokenStr = tokenList[j];
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
            const _nativeBytes32 = Utils.fromUtf8(native);
            console.log(`${native}`)
            let _bal = await portfolio.getBalance(account, _nativeBytes32);
            Utils.printBalances(account, _bal, 18);
            if ((parseFloat(Utils.fromWei(_bal.total)) + parseFloat(Utils.fromWei(_bal.available))) < initial_portfolio_deposits[native]) {
                const _deposit_amount = initial_portfolio_deposits[native] - Utils.fromWei(_bal.total) - Utils.fromWei(_bal.available);
                await wallet.sendTransaction({from: account,
                                              to: portfolioMain.address,
                                              value: Utils.toWei(_deposit_amount.toString())});
                //console.log("Deposited for", account, _deposit_amount, native, "to portfolio.");
                _bal = await portfolio.getBalance(account, _nativeBytes32);
                Utils.printBalances(account, _bal, 18);
            }
            console.log();

            // deposit ERC20 token for account to portfolio
            for (let j=0; j<tokenList.length; j++) {
                _tokenStr = tokenList[j];
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

        // initialize Exchange contract and create the TradePairs  "AVAX/USDT" "AVAX/BUSD" ....
        console.log("=== Initialize Exchange Contract ===");
        //exchange = await f.deployExchangeSub(portfolio, tradePairs)
        console.log("ExchangeSub contract deployed at: ", exchange.address)

        pairs = [];
        for (let j=0; j<tokenPairs.length; j++) {
            const pair = tokenPairs[j]
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
            const tp = Utils.fromUtf8(pair.id);   // trading pair id needs to be bytes32
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
        for (let i=0; i < _tokenList.length; i++) {
            console.log(Utils.toUtf8(_tokenList[i]));
        }

        // check all balances at the start of orders processing
        console.log();
        console.log("=== Portfolio State Before Processing Orders ===");
        for (let i=0; i<numberOfAccounts; i++) {
            const account = accounts[i];
            for (let j=0; j<tokens.length; j++) {
                const token = tokens[j];
                const res = await portfolio.getBalance(account, Utils.fromUtf8(token));
                Utils.printBalances(account, res, decimalsMap[token]);
            }
        }
        orders = [];
    });

    it("Should enter all orders correctly", async () => {
        // 1-to-1 key-value map between clientOrderId and Order address
        const orderMap = new Map();  // orderMap: clientOrderId  -->  Order

        // initialize accumulator to check Portfolio contract state per user per token after each order
        console.log();
        console.log("=== Accounts used ===");
        for (let i=0; i<numberOfAccounts; i++) {
            const owner = accounts[i];
            console.log(i, " :: ", owner);
        }

        // process orders sequentially and compare results between contract and calculations
        console.log();
        console.log("=== Reading Orders ===");
        const ordersRaw = await Utils.loadOrders('./test/data/07_TestOrderBook.csv');

        for (let i=0; i<ordersRaw.length; i++) {
            // skip over empty lines
            if (!ordersRaw[i]["clientOrderId"]) { continue; }

            // skip over comment lines added for the group of orders to document tests
            if (ordersRaw[i]["clientOrderId"][0] === "#") { continue; }

            const order: any = ordersRaw[i];
            order["ownerIndex"] = parseInt(order["owner"]);
            order["owner"] = accounts[order["ownerIndex"]];

            orders.push(order);
            console.log("Order :: ", "clientOrderId: ", order["clientOrderId"], "owner: ", order["owner"]);
        }

        console.log();
        console.log("=== Processing Orders ===");
        for (let i=0; i<orders.length; i++) {

            const order = orders[i];                // simulated order from file
            let orderLog: any = {};               // return values from transaction receipt

            // reference for enums in ITradePairs.sol
            // enum Side         {BUY, SELL}
            // enum Type1        {MARKET, LIMIT, STOP, STOPLIMIT}
            // enum Status       {NEW, REJECTED, PARTIAL, FILLED, CANCELED, EXPIRED, KILLED}
            // enum RateType     {MAKER, TAKER}
            // enum Type2        {GTC, FOK, IOC, PO}
            // enum AuctionMode  {OFF, LIVETRADING, OPEN, CLOSING, PAUSED, MATCHING, RESTRICTED}

            const acc = wallets[order["ownerIndex"]];

            // get the TradePairs for this order
            const tradePair: TradePairs = new ethers.Contract(tradePairs.address, TradePairsAbi.abi, wallets[order["ownerIndex"]]) as TradePairs;
            const tradePairId = Utils.fromUtf8(order["tradePair"]);

            const baseDecimals = await tradePair.getDecimals(tradePairId, true);
            const quoteDecimals = await tradePair.getDecimals(tradePairId, false);

            // ADD NEW ORDERS TO TRADEPAIR
            if (order["action"] === "ADD") {

                // add order
                const _side = order["side"] === "BUY" ? 0 : 1;

                let _type1 = 1;
                const _type2 = 0;

                if (order["type1"] === "MARKET") {
                    _type1 =0

                }

                const tx = await tradePair.connect(acc).addOrder(
                    acc.address,
                    Utils.fromUtf8(order["clientOrderId"]),
                    tradePairId,
                    Utils.parseUnits(order["price"].toString(), quoteDecimals),
                    Utils.parseUnits(order["quantity"].toString(), baseDecimals),
                    _side,
                    BigNumber.from(_type1),
                    BigNumber.from(_type2),
                );
                orderLog = await tx.wait();

                // add orders affected by this addition to the orderMap
                for (let j=0; j<orderLog.events.length; j++) {
                    if (orderLog.events[j].event) {
                        const _log = orderLog.events[j];
                        if (_log.event === 'OrderStatusChanged') {
                            const _id = _log.args.orderId;
                            const _orders = [...orderMap.values()];
                            if (!_orders.includes(_id)) {
                                orderMap.set(order["clientOrderId"], {'id': _id, 'order': order});
                            }
                        }
                    }
                }
            }

             // CANCEL orders from TradePair
            if (order["action"] === "CANCEL") {
                // cancel order
                const tx = await tradePair.cancelOrder(tradePairId, orderMap.get(order["clientOrderId"]).id);
                orderLog = await tx.wait();
            }

            console.log("clientOrderId =", order["clientOrderId"], ", ", "orderId =", orderMap.get(order["clientOrderId"]).id);
        }
    });

    it("Should have Old OrderBooks Equal to New Order Book using different Number of records", async () => {
        const pair ="AVAX/USDT"
        const tradePairId = Utils.fromUtf8(pair);

        const buyBookId = Utils.fromUtf8(`${pair}-BUYBOOK`)
        const sellBookId = Utils.fromUtf8(`${pair}-SELLBOOK`)

        const maxNbrOfPrices =orders.length + 3;

        const oldBuyBook = await getOrderBookOld(orderBooks , buyBookId, maxNbrOfPrices, 1) ; //1=Buy 0=Sell
        const oldSellBook = await getOrderBookOld(orderBooks , sellBookId, maxNbrOfPrices, 0) ; //1=Buy 0=Sell
        let newBook;
        let i;
        let j;

        console.log();
        console.log(`Checking Buybook by getting different nprice , nprice= norder`, maxNbrOfPrices)
        for (i=1; i <= maxNbrOfPrices ; i += 1 ) {
            j=i;
            newBook = await getOrderBook(tradePairs,tradePairId, i,  j , "BUY");
            const res= compareMaps (oldBuyBook,newBook)
            assert(res===true, `New Buy Book not eqal to old Book when getting  ${i} ${j} Records at a time`);
            //console.log(`Getting buybook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
        }

        console.log();
        console.log(`Checking Buybook by getting different nprice <=norder `)
        for (i=1; i <= Math.min(4, maxNbrOfPrices-4) ; i += 1 ) {
            for (j=i; j <= 7; j += 1 ) {
                newBook = await getOrderBook(tradePairs,tradePairId, i,  j , "BUY");
                const res= compareMaps (oldBuyBook,newBook)
                assert(res===true, `New Buy Book not eqal to old Book when getting  ${i} ${j} Records at a time`);
                console.log(`Getting buybook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
            }
        }

        console.log();
        console.log(`Checking Buybook by getting different nprice >= norder `)
        for (i=4; i <= Math.min(20, maxNbrOfPrices-20); i += 4 ) {
            for (j=1; j <= i; j += 1 ) {
                newBook = await getOrderBook(tradePairs,tradePairId, i,  j , "BUY");
                const res= compareMaps (oldBuyBook,newBook)
                assert(res===true, `New Buy Book not eqal to old Book when getting  ${i} ${j} Records at a time`);
                console.log(`Getting buybook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
            }
        }

        console.log();
        console.log(`Checking Sellbook by getting different nprice , nprice=norder`)
        for (i=1; i <= maxNbrOfPrices; i += 1) {
            j=i;
            newBook = await getOrderBook(tradePairs,tradePairId, i,  j , "SELL");
            const res=compareMaps (oldSellBook,newBook)
            assert(res===true, `New Sell Book not eqal to old Book when getting  ${i} ${j} Records at a time`);
            //console.log(`Getting sellbook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
        }

        console.log();
        console.log(`Checking Sellbook by getting different nprice <=norder`)
        for (i=1; i <= Math.min(4, maxNbrOfPrices-4); i += 1 ) {
            for (j=i; j <= 7; j += 1 ) {
                newBook = await getOrderBook(tradePairs,tradePairId, i,  j , "SELL");
                const res= compareMaps (oldSellBook,newBook)
                assert(res===true, `New Sell Book not eqal to old Book when getting  ${i} ${j} Records at a time`);
                console.log(`Getting Sellbook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
            }
        }

        console.log();
        console.log(`Checking Sellbook by getting different nprice >=norder`)
        for (i=4; i <= Math.min(20, maxNbrOfPrices-20); i += 4 ) {
            for (j=1; j <= i; j += 1 ) {
                newBook = await getOrderBook(tradePairs,tradePairId, i,  j , "SELL");
                const res=compareMaps (oldSellBook,newBook)
                assert(res===true, `New Sell Book not eqal to old Book when getting  ${i} ${j} Records at a time`);
                //console.log(`Getting sellbook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
            }
        }
    });

    it("Should be able to get Buy & Sell Quantities at different prices", async () => {
        console.log();
        const pair ="AVAX/USDT"
        const buyBookId = Utils.fromUtf8(`${pair}-BUYBOOK`)
        const sellBookId = Utils.fromUtf8(`${pair}-SELLBOOK`)

        let prices = ["5.6","6"]

        const price = Utils.parseUnits("6", decimalsMap['USDT'])
        const sellhead = await orderBooks.getHead(sellBookId,price );
        console.log(`Sell Book Head "6" : Head: ${sellhead} `)

        const sellheadNext  = await orderBooks.nextOrder(sellBookId, price,  sellhead);
        console.log(`Next to Head "6" : Ord: ${sellheadNext} `)

        for (const price of prices) {
            const asks = await orderBooks.getNode(sellBookId, Utils.parseUnits(price, decimalsMap['USDT']))
            console.log(`# of asks at ${price}: ${asks.size.toString()}  Head: ${asks.head} `)
            const sellQuantities = await orderBooks.getQuantitiesAtPrice(sellBookId, Utils.parseUnits(price, decimalsMap['USDT']))
            console.log(`Ordered ask quantities at price ${price}`)
            for (let i=0; i<sellQuantities.length; i++) {
              console.log(`Ask quantities #${i}: ${Utils.formatUnits(sellQuantities[i], 18)}`)
            }
          }

        prices = ["3.9","4"]

        for (const price of prices) {
            const asks = await orderBooks.getNode(buyBookId, Utils.parseUnits(price, decimalsMap['USDT']))
            console.log(`# of bid at ${price}: ${asks.size.toString()}  Head: ${asks.head} `)


            const buyQuantities = await orderBooks.getQuantitiesAtPrice(buyBookId, Utils.parseUnits(price, decimalsMap['USDT']))
            console.log(`Ordered bid quantities at price ${price}`)
            for (let i=0; i<buyQuantities.length; i++) {
            console.log(`Bid quantities #${i}: ${Utils.formatUnits(buyQuantities[i], 18)}`)
            }
        }
    });

}).timeout(240000);

async function getOrderBook(tradePair: TradePairs, tradePairId: string, nPrice: number,  nOrder: number, side: string) {
    const map1 = new Map();
    let price = BigNumber.from(0);
    let lastOrderId = Utils.fromUtf8('')
    let book;
    do  {
        book = await tradePairs.getNBook(tradePairId, side === "BUY" ? 0 : 1 , nPrice, nOrder, price.toString(), lastOrderId);
        price = book[2];
        lastOrderId = book[3]

        // console.log ('Returned', side, 'Price', book[2].toString() );
        // console.log ('Returned', side, 'LastOrderid', book[3] );

        for (let i=0; i < book[0].length; i++ ) {
            if (book[0][i].eq(0)) {
                //console.log (i);
                break;
            } else {
                const key =book[0][i].toString()
                if (map1.has(key)) {
                    map1.set(key, book[1][i].add(map1.get(key)));
                } else {
                    map1.set(key, book[1][i]);
                }
            }
        }
    } while (price.gt(0) || lastOrderId != Utils.fromUtf8(''))
    //console.log ('Returned ', side, Array.from(map1).toString());

    return map1;
}

async function getOrderBookOld(orderbooks: OrderBooks , orderbookId: string, n: number, type: number) {
    const map1 = new Map();
    const book = await orderbooks.getNOrdersOld(orderbookId, n, type)

    // console.log ('Returned', side, 'Price', book[2].toString() );
    // console.log ('Returned', side, 'LastOrderid', book[3] );

    for (let i=0; i < book[0].length; i++ ) {
        if (book[0][i].eq(0)) {
            //console.log (i);
            break;
        } else {
            const key =book[0][i].toString()
            if (map1.has(key)) {
                map1.set(key, book[1][i].add(map1.get(key)));
            } else {
                map1.set(key, book[1][i]);
            }
        }
    }
    //console.log ('Returned ', type, Array.from(map1).toString());
    return map1;
}

function compareMaps(map1: Map<any, any>, map2: Map<any, any>) {
    let testVal;
    if (map1.size !== map2.size) {
        return false;
    }
    for (const [key, val] of map1) {
        testVal = map2.get(key);
        // in cases of an undefined value, make sure the key
        // actually exists on the object so there are no false positives
        if (!testVal.eq(val) || (testVal === undefined && !map2.has(key))) {
            console.log ('Key Value dont match ', key, val.toString(), 'vs' ,map2.get(key).toString());
            return false;
        }
    }
    return true;
}
