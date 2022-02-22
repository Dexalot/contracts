
/**
 * The test runner for trading on Dexalot exchange
 */

const { expect, assert } = require("chai");

const { ethers, upgrades } = require("hardhat");
require("@nomiclabs/hardhat-ethers");

const BigNumber = require('bignumber.js');

const Utils = require('./utils.js');

const MockTokenAbi = require('../artifacts/contracts/token/MockToken.sol/MockToken.json');
const TradePairsAbi = require('../artifacts/contracts/TradePairs.sol/TradePairs.json');
const PortfolioAbi = require('../artifacts/contracts/Portfolio.sol/Portfolio.json');

let MockToken;
let OrderBooks;
let TradePairs;
let Exchange;
let Portfolio;

// using the first numberOfAccounts accounts
const numberOfAccounts = 3;

// fee rates
const makerRate = BigNumber(0.0010);
const takerRate = BigNumber(0.0020);

// initial state
// do transfers to Portfolio contract as follows before starting tests
const tokens = ["AVAX", "USDT", "BUSD"];

const decimalsMap = {"AVAX": 18,
                     "USDT": 6,
                     "BUSD": 18,
                     "LINK": 18,
                     "BTC": 8}

const native = "AVAX";

const tokenList = ["USDT", "BUSD"];

const tokenPairs = ["AVAX/USDT", "AVAX/BUSD"];

const minTradeAmountMap = {"AVAX/USDT": 10,
                           "AVAX/BUSD": 10}

const maxTradeAmountMap = {"AVAX/USDT": 10000,
                           "AVAX/BUSD": 1000}

const baseDisplayDecimalMap = {"AVAX/USDT": 3,
                               "AVAX/BUSD": 3}

const quoteDisplayDecimalMap = {"AVAX/USDT": 3,
                                "AVAX/BUSD": 3}

const initial_mints = {AVAX: 10000, USDT: 15000, BUSD: 50000};

const initial_portfolio_deposits = {AVAX: 9000, USDT: 14000, BUSD: 45000};

var options = { gasLimit: 300000 };

// address (a multisig in production) that collects the fees
const foundationSafe = '0x48a04b706548F7034DC50bafbF9990C6B4Bff177'


describe("Dexalot", () => {

    before(async () => {

        wallets = await ethers.getSigners();
        accounts = [];
        for (var i=0; i<numberOfAccounts; i++) {
            accounts[i] = wallets[i].address;
        }
        console.log("=== Accounts ===");
        console.log(accounts);
        console.log();

        MockToken = await ethers.getContractFactory("MockToken");
        OrderBooks = await ethers.getContractFactory("OrderBooks");
        TradePairs = await ethers.getContractFactory("TradePairs");
        Exchange = await ethers.getContractFactory("Exchange");
        Portfolio = await ethers.getContractFactory("Portfolio");

        deploymentAccount = accounts[0];
        console.log("deploymentAccount =", deploymentAccount);

        // initialize Portfolio contract
        portfolio = await upgrades.deployProxy(Portfolio);

        // initialize portfolios with state-chaning ABIs
        portfolios = [];
        for (var i=0; i<numberOfAccounts; i++) {
            portfolios[i] = new ethers.Contract(portfolio.address, PortfolioAbi.abi, wallets[i]);
        }

        // get depositFeeRate
        depositFeeRate = parseFloat((await portfolio.getDepositFeeRate()).toString())/10000;

        // initialize address collecting fees
        console.log("=== Set Address Collecting the Fees ===");
        await portfolio.setFeeAddress(foundationSafe);
        console.log("Called setFeeAddress on Portfolio ");

        console.log();
        console.log("=== Creating and Minting Mock Tokens ===");

        for (var j=0; j<tokenList.length; j++) {
            _tokenStr = tokenList[j];
            _tokenBytes32 = Utils.fromUtf8(_tokenStr);
            _tokenDecimals = decimalsMap[_tokenStr];
            _token = await MockToken.deploy("Mock " + _tokenStr + " Token", _tokenStr, _tokenDecimals);
            await portfolio.addToken(Utils.fromUtf8(await _token.symbol()), _token.address, 0); //AUction mode off
            for (i=0; i<numberOfAccounts; i++) {
                account = accounts[i];
                console.log("Account:", account, "before minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
                _mint_amount = initial_mints[_tokenStr] - Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals);
                if (_mint_amount>0) {
                    await _token.mint(account, Utils.parseUnits(_mint_amount.toString(), _tokenDecimals));
                    console.log("Account:", account, "after minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
                }
            }
        }

        tokenAddressMap = {};
        tokenAddressMap["AVAX"] = "0x0000000000000000000000000000000000000000";
        for (var j=0; j<tokenList.length; j++) {
            _tokenStr = tokenList[j];
            _tokenAddr = await portfolio.getToken(Utils.fromUtf8(_tokenStr));
            _token = await MockToken.attach(_tokenAddr);
            tokenAddressMap[_tokenStr] = _token.address;
        }
        console.log(tokenAddressMap);

        console.log();
        console.log("=== Making Initial Portfolio Deposits ===");
        for (var i=0; i<numberOfAccounts; i++) {
            wallet = wallets[i];
            account = accounts[i];
            iportfolio = portfolios[i];

            // deposit native coin for account to portfolio
            _nativeBytes32 = Utils.fromUtf8(native);
            _bal = await portfolio.getBalance(account, _nativeBytes32);
            Utils.printBalances(account, _bal, 18);
            if ((parseFloat(Utils.fromWei(_bal.total)) + parseFloat(Utils.fromWei(_bal.available))) < initial_portfolio_deposits[native]) {
                _deposit_amount = initial_portfolio_deposits[native] - Utils.fromWei(_bal.total) - Utils.fromWei(_bal.available);
                await wallet.sendTransaction({from: account,
                                              to: portfolio.address,
                                              value: Utils.toWei(_deposit_amount.toString())});
                console.log("Deposited for", account, _deposit_amount, native, "to portfolio.");
                _bal = await portfolio.getBalance(account, _nativeBytes32);
                Utils.printBalances(account, _bal, 18);
            }
            console.log();

            // deposit ERC20 token for account to portfolio
            for (var j=0; j<tokenList.length; j++) {
                _tokenStr = tokenList[j];
                _tokenBytes32 = Utils.fromUtf8(_tokenStr);
                _tokenAddr = await portfolio.getToken(_tokenBytes32);
                _token = await MockToken.attach(_tokenAddr);
                _token = new ethers.Contract(_tokenAddr, MockTokenAbi.abi, wallet);
                _tokenDecimals = await _token.decimals();
                _bal = await portfolio.getBalance(account, _tokenBytes32);
                Utils.printBalances(account, _bal, _tokenDecimals);
                if ((parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) + parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals))) < initial_portfolio_deposits[_tokenStr]) {
                    _deposit_amount = initial_portfolio_deposits[_tokenStr] - parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) - parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals));
                    _deposit_amount_bn = Utils.parseUnits(_deposit_amount.toString(), _tokenDecimals);
                    await _token.approve(portfolio.address, _deposit_amount_bn, options);
                    console.log("Approve:", account, "to deposit ", _deposit_amount, _tokenStr, "to portfolio.");
                    await iportfolio.depositToken(account, Utils.fromUtf8(_tokenStr), _deposit_amount_bn, options);
                    console.log("Deposit:", account, _deposit_amount, _tokenStr, "to portfolio.");
                    _bal = await portfolio.getBalance(account, _tokenBytes32);
                    Utils.printBalances(account, _bal, _tokenDecimals);
                }
                console.log();
            }
            console.log();
        }

        // initialize OrderBooks contract
        console.log();
        console.log("=== Initialize OrderBooks Contract ===");
        orderBooks = await upgrades.deployProxy(OrderBooks);
        console.log("OrderBooks contract deployed at: ", orderBooks.address)

        // initialize TradePairs contract
        console.log();
        console.log("=== Initialize TradePairs Contract ===");
        tradePairs = await upgrades.deployProxy(TradePairs, [orderBooks.address, portfolio.address]);
        console.log("TradePairs contract deployed at: ", tradePairs.address)

        // initialize Exchange contract and create the TradePairs  "AVAX/USDT" "AVAX/BUSD" ....
        console.log();
        console.log("=== Initialize Exchange Contract ===");
        exchange = await upgrades.deployProxy(Exchange);
        await exchange.setPortfolio(portfolio.address);
        console.log("Called setPortfolio on Exchange");
        await exchange.setTradePairs(tradePairs.address);
        console.log("Called setTradePairs on Exchange");
        console.log("Exchange contract deployed at: ", exchange.address)

        // adjust ownership and access hierarchy among contracts for security
        //
        // OrderBooks through Ownable
        const tx_orderBooks = await orderBooks.transferOwnership(tradePairs.address)
        await tx_orderBooks.wait()
        console.log(`OrderBooks at ${orderBooks.address} ownership transferred to ${await orderBooks.owner()}.`)

        // TradePairs through Ownable
        const tx_tradePairs = await tradePairs.transferOwnership(exchange.address)
        await tx_tradePairs.wait()
        console.log(`TradePairs at ${tradePairs.address} ownership transferred to ${await tradePairs.owner()}.`)

        // Portfolio through AccessControl
        await portfolio.addAdmin(exchange.address);
        console.log("Exchange added to portfolio admin group.");
        await portfolio.addAdmin(tradePairs.address);
        console.log("TradePairs added to portfolio admin group.");

        const pairs = [];
        for (var j=0; j<tokenPairs.length; j++) {
            pair = tokenPairs[j]
            symbols = pair.split("/", 2);
            baseSymbol = symbols[0];
            quoteSymbol = symbols[1];
            tokenAddr = await portfolio.getToken(Utils.fromUtf8(quoteSymbol));
            token = await MockToken.attach(tokenAddr);
            pairs.push({id: pair,
                        baseDecimals: 18, basePriceDecimal: baseDisplayDecimalMap[pair],
                        quoteDecimals: await token.decimals(), quotePriceDecimal: quoteDisplayDecimalMap[pair],
                        minTradeAmount: minTradeAmountMap[pair], maxTradeAmount:maxTradeAmountMap[pair]});
        }

        for (const pair of pairs)  {
            pairIdAsBytes32 = Utils.fromUtf8(pair.id);   // trading pair id needs to be bytes32
            symbols = pair.id.split("/", 2);
            baseSymbol = symbols[0];
            quoteSymbol = symbols[1];
            await exchange.addTradePair(pairIdAsBytes32,
                                        tokenAddressMap[baseSymbol], pair.basePriceDecimal,
                                        tokenAddressMap[quoteSymbol],  pair.quotePriceDecimal,
                                        Utils.parseUnits((pair.minTradeAmount).toString(), pair.quoteDecimals),
                                        Utils.parseUnits((pair.maxTradeAmount).toString(), pair.quoteDecimals), 0);
            console.log(`${pair.id} added to TradePairs at ${tradePairs.address} with min trade amount of ${pair.minTradeAmount}.`)
            await exchange.addOrderType(pairIdAsBytes32, 0)  // 0 = MARKET, 1 = LIMIT
            console.log(`MARKET order type added to ${pair.id} at ${tradePairs.address}.`)
            await exchange.updateRate(pairIdAsBytes32, 10, 0)
            console.log(`${pair.id} at ${tradePairs.address} has its MAKER fee rate updated to 10/10000.`)
            await exchange.updateRate(pairIdAsBytes32, 20, 1)
            console.log(`${pair.id} at ${tradePairs.address} has its TAKER fee rate updated to 20/10000.`)
        }

        // get native list at system start-up
        console.log();
        console.log("=== Native Coin at Start-Up ===");
        _native = await portfolio.native(); // return is bytes32[]
        console.log(Utils.toUtf8(_native));

        // get token list at system start-up
        console.log();
        console.log("=== ERC20 Token List at Start-Up ===");
        _tokenList = await portfolio.getTokenList(); // return is bytes32[]
        for (var i=0; i < _tokenList.length; i++) {
            console.log(Utils.toUtf8(_tokenList[i]));
        }

        // check all balances at the start of orders processing
        console.log();
        console.log("=== Portfolio State Before Processing Orders ===");
        for (var i=0; i<numberOfAccounts; i++) {
            account = accounts[i];
            for (var j=0; j<tokens.length; j++) {
                token = tokens[j];
                res = await portfolios[i].getBalance(account, Utils.fromUtf8(token));
                Utils.printBalances(account, res, decimalsMap[token]);
            }
        }

    });

    it("... should enter all orders correctly", async () => {

        /*** ORDER SIMULATION STARTS HERE ***/
        // orders that are read from file and cleaned for processing
        orders = [];

        // 1-to-1 key-value map between clientOrderId and Order address
        orderMap = new Map();  // orderMap: clientOrderId  -->  Order

        // initialize accumulator to check Fee contract state after each order in tests
        feeLumped = {}
        for (var i=0; i<tokens.length; i++) {
            feeLumped[tokens[i]] = BigNumber(numberOfAccounts * initial_portfolio_deposits[tokens[i]] * depositFeeRate);
        }

        // initialize accumulator to check Portfolio contract state per user per token after each order
        console.log();
        console.log("=== Accounts used ===");
        var portfolioUser = {}
        for (var i=0; i<numberOfAccounts; i++) {
            owner = accounts[i];
            console.log(i, " :: ", owner);
            portfolioUser[owner] = {};
            for (var j=0; j<tokens.length; j++) {
                token = tokens[j];
                portfolioUser[owner][token] = {};
                portfolioUser[owner][token]['total'] = BigNumber(initial_portfolio_deposits[token] * (1 - depositFeeRate));
                portfolioUser[owner][token]['available'] = BigNumber(initial_portfolio_deposits[token] * (1 - depositFeeRate));
            }
        }

        simNum = 1;

        // process orders sequentially and compare results between contract and calculations
        console.log();
        console.log("=== Reading Orders ===");
        ordersRaw = await Utils.loadOrders('./test/data/07_TestOrderBook.csv');

        for (var i=0; i<ordersRaw.length; i++) {
            // skip over empty lines
            if (!ordersRaw[i]["clientOrderId"]) { continue; }

            // skip over comment lines added for the group of orders to document tests
            if (ordersRaw[i]["clientOrderId"][0] === "#") { continue; }

            order = ordersRaw[i];
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
        for (var i=0; i<orders.length; i++) {

            order = orders[i];                // simulated order from file
            orderLog = {};                    // return values from transaction receipt

            sideMap = {"0": "BUY",            // BUY = Order.Side.BUY = 0
                       "1": "SELL"}           // SELL = Order.Side.SELL = 1

            type1Map = {"0": "MARKET",        // MARKET = Order.Type1.MARKET = 0
                        "1": "LIMIT",         // LIMIT = Order.Type1.LIMIT = 1
                        "2": "STOP",          // STOP = Order.Type1.STOP = 2
                        "3":"STOPLIMIT",
                        "4": "LIMITFOK"}

            // console.log();
            // console.log("+++++++++++++++++++++++++++++++++++++++++++ START :: SIM # ", simNum, "+++++++++++++++++++++++++++++++++++++++++++");
            // console.log();
            // console.log("Order Id >> ", order["clientOrderId"], " ::: Action: ", order["action"], " ::: Owner account: ", order["owner"]);
            // console.log();

            // get the TradePairs for this order
            tradePair = new ethers.Contract(tradePairs.address, TradePairsAbi.abi, wallets[order["ownerIndex"]]);

            // ADD NEW ORDERS TO TRADEPAIR
            if (order["action"] === "ADD") {
                tradePairId = Utils.fromUtf8(order["tradePair"]);

                // add order
                _side = order["side"] === "BUY" ? 0 : 1;

                if (order["type1"] === "MARKET") {
                    _type1 =0

                } else if (order["type1"] === "LIMIT") {
                    _type1 =1

                } else if (order["type1"] === "LIMITFOK") {
                    _type1 =4
                }

                baseDecimals = await tradePair.getDecimals(tradePairId, true);
                quoteDecimals = await tradePair.getDecimals(tradePairId, false);
                const tx = await tradePair.addOrder(tradePairId,
                                                    Utils.parseUnits(order["price"].toString(), quoteDecimals),
                                                    Utils.parseUnits(order["quantity"].toString(), baseDecimals),
                                                    _side,
                                                    _type1);
                orderLog = await tx.wait();

                // add orders affected by this addition to the orderMap
                for (var j=0; j<orderLog.events.length; j++) {
                    if (orderLog.events[j].event) {
                        const _log = orderLog.events[j];
                        if (_log.event === 'OrderStatusChanged') {
                            _id = _log.args.id;
                            _orders = [...orderMap.values()];
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
                const tx = await tradePair.cancelOrder(tradePairId, orderMap.get(order["clientOrderId"]).id);
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

            makerOrder = [];
            takerOrder = '';
            makerFee = [];
            takerFee = [];
            if (order["action"] === "ADD") {
                for (var j=0; j<orderLog.events.length; j++) {
                    if (orderLog.events[j].event) {
                        const _log = orderLog.events[j];
                        if (_log.event === 'Executed') {
                            makerOrder.push(_log.args.maker);
                            makerFee.push(_log.args.feeMaker);
                            takerOrder = _log.args.taker;
                            takerFee.push(_log.args.feeTaker);
                        }
                    }
                }
            }

            console.log("current order ::: ", "clientOrderId =", order["clientOrderId"], ", ", "orderAddress =", orderMap.get(order["clientOrderId"]).id);

            // console.log();
            // console.log("price :::", order['price'].toString());
            // console.log("quantity :::", order['quantity'].toString());
            // console.log("side :::", order['side'].toString());
            // console.log("type1 :::", order['type1'].toString());
            // console.log();

            if (takerOrder) {
                tOrderId = Utils.getMapKeyByValue(orderMap, takerOrder);
                tOrder = orderMap.get(tOrderId).order;
                tOrder["quantityFilled"] = BigNumber(0);
                tOrder["totalQuantityFilled"] = BigNumber(0);
            }

        }

    });

    it("... should have Old OrderBooks Equal to New Order Book using different Number of records", async () => {

        pair ="AVAX/USDT"
        const buyBookId = Utils.fromUtf8(`${pair}-BUYBOOK`)
        const sellBookId = Utils.fromUtf8(`${pair}-SELLBOOK`)

        let maxNbrOfPrices =orders.length + 3;

        const oldBuyBook = await getOrderBookOld(orderBooks , buyBookId, maxNbrOfPrices, 1) ; //1=Buy 0=Sell
        const oldSellBook = await getOrderBookOld(orderBooks , sellBookId, maxNbrOfPrices, 0) ; //1=Buy 0=Sell
        let newBook;
        let i;
        let j;

        console.log(`Checking Buybook by getting different nprice , nprice= norder`, maxNbrOfPrices)

        for (i=1; i <= maxNbrOfPrices ; i += 1 ) {
            j=i;
            newBook = await getOrderBook(tradePair,tradePairId, i,  j , "BUY");
            res= compareMaps (oldBuyBook,newBook)
            assert(res===true, "New Buy Book not eqal to old Book when getting  ", i, j ,"Records at a time ");
            //console.log(`Getting buybook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
        }


        console.log(`Checking Buybook by getting different nprice <=norder `)
        for (i=1; i <= Math.min(4, maxNbrOfPrices-4) ; i += 1 ) {
            for (j=i; j <= 7; j += 1 ) {
                newBook = await getOrderBook(tradePair,tradePairId, i,  j , "BUY");
                res= compareMaps (oldBuyBook,newBook)
                assert(res===true, "New Buy Book not eqal to old Book when getting  ", i, j ,"Records at a time ");
                console.log(`Getting buybook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
            }
        }


        console.log(`Checking Buybook by getting different nprice >= norder `)
        for (i=4; i <= Math.min(20, maxNbrOfPrices-20); i += 4 ) {
            for (j=1; j <= i; j += 1 ) {
                newBook = await getOrderBook(tradePair,tradePairId, i,  j , "BUY");
                res= compareMaps (oldBuyBook,newBook)
                assert(res===true, "New Buy Book not eqal to old Book when getting  ", i, j ,"Records at a time ");
                console.log(`Getting buybook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
            }
        }

        console.log(`Checking Sellbook by getting different nprice , nprice=norder`)

        for (i=1; i <= maxNbrOfPrices; i += 1) {
            j=i;
            newBook = await getOrderBook(tradePair,tradePairId, i,  j , "SELL");
            res=compareMaps (oldSellBook,newBook)
            assert(res===true, "New Sell Book not eqal to old Book when getting  ", i, j ,"Records at a time ");
            //console.log(`Getting sellbook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
        }


        console.log(`Checking Sellbook by getting different nprice <=norder`)
        for (i=1; i <= Math.min(4, maxNbrOfPrices-4); i += 1 ) {
            for (j=i; j <= 7; j += 1 ) {
                newBook = await getOrderBook(tradePair,tradePairId, i,  j , "SELL");
                res= compareMaps (oldSellBook,newBook)
                assert(res===true, "New Sell Book not eqal to old Book when getting  ", i, j ,"Records at a time ");
                console.log(`Getting Sellbook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
            }
        }


        console.log(`Checking Sellbook by getting different nprice >=norder`)
        for (i=4; i <= Math.min(20, maxNbrOfPrices-20); i += 4 ) {
            for (j=1; j <= i; j += 1 ) {
                newBook = await getOrderBook(tradePair,tradePairId, i,  j , "SELL");
                res=compareMaps (oldSellBook,newBook)
                assert(res===true, "New Sell Book not eqal to old Book when getting  ", i, j ,"Records at a time ");
                //console.log(`Getting sellbook nprice ${i} norder ${j} Records at a time. Old and new books are equal ${res}`) ;
            }
        }


    });

    it("... should be able to get Buy & Sell Quantities at different prices", async () => {
        pair ="AVAX/USDT"
        const buyBookId = Utils.fromUtf8(`${pair}-BUYBOOK`)
        const sellBookId = Utils.fromUtf8(`${pair}-SELLBOOK`)

        prices = ["5.6","6"]

        price = Utils.parseUnits("6", decimalsMap['USDT'])
        sellhead = await orderBooks.getHead(sellBookId,price );
        console.log(`Sell Book Head "6" : Head: ${sellhead} `)

        sellheadNext  = await orderBooks.nextOrder(sellBookId, price,  sellhead);
        console.log(`Next to Head "6" : Ord: ${sellheadNext} `)

        for (let price of prices) {
            asks = await orderBooks.getNode(sellBookId, Utils.parseUnits(price, decimalsMap['USDT']))
            console.log(`# of asks at ${price}: ${asks.size.toString()}  Head: ${asks.head} `)
            sellQuantities = await orderBooks.getQuantitiesAtPrice(sellBookId, Utils.parseUnits(price, decimalsMap['USDT']))
            console.log(`Ordered ask quantities at price ${price}`)
            for (let i=0; i<sellQuantities.length; i++) {
              console.log(`Ask quantities #${i}: ${Utils.formatUnits(sellQuantities[i], 18)}`)
            }
          }

        prices = ["3.9","4"]

        for (let price of prices) {
            asks = await orderBooks.getNode(buyBookId, Utils.parseUnits(price, decimalsMap['USDT']))
            console.log(`# of bid at ${price}: ${asks.size.toString()}  Head: ${asks.head} `)


            buyQuantities = await orderBooks.getQuantitiesAtPrice(buyBookId, Utils.parseUnits(price, decimalsMap['USDT']))
            console.log(`Ordered bid quantities at price ${price}`)
            for (let i=0; i<buyQuantities.length; i++) {
            console.log(`Bid quantities #${i}: ${Utils.formatUnits(buyQuantities[i], 18)}`)
            }
        }



    });

}).timeout(240000);;


async function getOrderBook(tradePair ,tradePairId, nPrice,  nOrder , side) {
    const map1 = new Map();
    price = BigNumber(0);
    lastOrderId = Utils.fromUtf8('')
    do  {
        if (side=="BUY") {
            book = await tradePair.getNBuyBook(tradePairId, nPrice, nOrder, price.toString(), lastOrderId)
        } else {
            book = await tradePair.getNSellBook(tradePairId, nPrice, nOrder, price.toString(), lastOrderId)
        }

        price = book[2]
        lastOrderId = book[3]

        // console.log ('Returned', side, 'Price', book[2].toString() );
        // console.log ('Returned', side, 'LastOrderid', book[3] );


        for (i=0; i < book[0].length; i++ ) {
            if (book[0][i].eq(0)) {
                //console.log (i);
                break;
            } else {
                let key =book[0][i].toString()
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

async function getOrderBookOld(orderbooks , orderbookId, n, type) {
    const map1 = new Map();
    book = await orderbooks.getNOrdersOld(orderbookId, n, type)

    // console.log ('Returned', side, 'Price', book[2].toString() );
    // console.log ('Returned', side, 'LastOrderid', book[3] );

    for (i=0; i < book[0].length; i++ ) {
        if (book[0][i].eq(0)) {
            //console.log (i);
            break;
        } else {
            let key =book[0][i].toString()
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

function compareMaps(map1, map2) {
    var testVal;
    if (map1.size !== map2.size) {
        return false;
    }
    for (var [key, val] of map1) {
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


function doNumberAssert(_checkName, _contractNumberValue, _checkNumberValue) {
    diff = _contractNumberValue.minus(_checkNumberValue);
    console.log(`${_checkName} ::: Contract: ${_contractNumberValue}, Expected: ${_checkNumberValue}, Difference = ${diff}`);
    assert(_contractNumberValue.isEqualTo(_checkNumberValue), "incorrect ", _checkName, "=", _checkNumberValue);
}

function doStringAssert(_checkName, _contractStringValue, _checkStringValue) {
    console.log(`${_checkName} ::: ${_contractStringValue} == ${_checkStringValue}`);
    assert(_contractStringValue == _checkStringValue, "incorrect ", _checkName, "=", _checkStringValue);
}

function getRemainingQuantity(_order) {
    return _order["quantity"].minus(_order["totalQuantityFilled"]);
}
