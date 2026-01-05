/**
 * The test runner for Dexalot TradePairs contract
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    MockToken,
    OrderBooks,
    PortfolioMain,
    PortfolioSub,
    TradePairs,
    ExchangeSub,
    GasStation,
    IPortfolio,
    PortfolioSubHelper
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, ContractFactory } from "ethers";


describe("TradePairs", function () {
    let portfolioSubHelper: PortfolioSubHelper;
    let MockToken: ContractFactory;
    let portfolio: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let exchange: ExchangeSub;
    let tradePairs: TradePairs;
    let orderBooks: OrderBooks;
    let gasStation: GasStation;

    let quoteToken: any;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;
    let treasurySafe: SignerWithAddress;
    let quoteAssetAddr: any;
    let alot: MockToken;
    let buyOrder: any;
    let sellOrder: any;
    //let defaultDestinationChainId: number;

    const ALOT: string = Utils.fromUtf8("ALOT");
    const alot_decimals = 18;

    const baseSymbolStr = "AVAX";
    const baseSymbol = Utils.fromUtf8(baseSymbolStr);
    const baseDecimals = 18;
    const baseDisplayDecimals = 3;

    const quoteTokenStr = "Quote Token";
    const quoteSymbolStr = "QT"
    const quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
    const quoteDecimals = 6;
    const quoteDisplayDecimals = 3;
    const srcChainId =1;


    const tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
    const tradePairId = Utils.fromUtf8(tradePairStr);

    const minTradeAmount = 10;
    const maxTradeAmount = 100000;
    const mode = 0;  // auction off

    const pair = {
        baseSymbol,
        baseDecimals,
        baseDisplayDecimals,
        quoteSymbol,
        quoteDecimals,
        quoteDisplayDecimals,
        tradePairId
    }

    const defaultPairSettings = {
        minTradeAmount,
        maxTradeAmount,
        mode
    }

    const defaultNativeDeposit = '3000'
    const defaultTokenDeposit = '2000'
    const tokenStruct: IPortfolio.TokenDetailsStruct = {decimals : 18,
        l1Decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
        auctionMode: 0,
        srcChainId:1111,
        symbol: ethers.constants.HashZero,
        symbolId: ethers.constants.HashZero,
        sourceChainSymbol:ethers.constants.HashZero,
        isVirtual:false
    };

    const alotWithdrawnToGasTankMultiplier = 10;  // 1 if token swap 10 if ALOT is withdrawn from portfolio to wallet

    async function  addOrderAndVerify(trader: SignerWithAddress, order: any, expectedStatus: number
        , expectedCode: string = ethers.constants.HashZero
        , expectedTotalAmount = BigNumber.from(0), expectedQuantityFilled = BigNumber.from(0), expectedTotalFee = BigNumber.from(0)
        ): Promise<string | any>{

        const tx = await tradePairs.connect(trader).addNewOrder(order);
        const res: any  = await tx.wait();

        for (const e of res.events) {

            if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader.address && e.args.order.clientOrderId == order.clientOrderId) {
                //console.log("code:", Utils.toUtf8(e.args.code) , "order:", e.args.order);
                //expect(e.event).to.be.equal('OrderStatusChanged');
                //expect(e.args.traderaddress).to.be.equal(order.traderaddress);
               // console.log (expectedTotalAmount, expectedQuantityFilled, expectedTotalFee)
               if (e.args.order.status ==1 && e.args.order.status != expectedStatus &&  e.args.code != expectedCode) {
                console.log("Order Rejected unexpectedly", Utils.toUtf8(e.args.code));
               }
                expect(e.args.pair).to.be.equal(order.tradePairId);

                expect(e.args.order.traderaddress).to.be.equal(order.traderaddress);
                expect(e.args.order.tradePairId).to.be.equal(order.tradePairId);
                expect(e.args.order.clientOrderId).to.be.equal(order.clientOrderId);

                if (!e.args.order.totalAmount.eq(expectedTotalAmount) || e.args.order.status != expectedStatus ) {
                    console.log("expectedStatus:", expectedStatus , "expectedTotalAmount:", expectedTotalAmount, "code:", Utils.toUtf8(e.args.code) , "Order:", e.args.order);
                }

                expect(e.args.order.totalAmount).to.be.equal(expectedTotalAmount);      // not executed, yet, so totalamount is 0
                expect(e.args.order.quantity).to.be.equal(order.quantity);
                expect(e.args.order.side).to.be.equal(order.side);             // side is BUY=0
                expect(e.args.order.type1).to.be.equal(order.type1);            // type1 is LIMIT=1
                expect(e.args.order.type2).to.be.equal(order.type2);            // type2 is GTC=0
                expect(e.args.order.status).to.be.equal(expectedStatus);           // status is NEW = 0
                expect(e.args.order.quantityFilled).to.be.equal(expectedQuantityFilled);   // not executed, yet, so quantityfilled is 0
                expect(e.args.order.totalFee).to.be.equal(expectedTotalFee);         // not executed, yet, so free is 0
                expect(e.args.order.updateBlock).to.be.equal(res.blockNumber);
                expect(e.args.order.createBlock).to.be.equal(res.blockNumber);
                expect(e.args.code).to.be.equal(expectedCode);         // error code
                return e.args.order.id;
            }
        }
    }

    async function  addOrderAndVerifyWithCancel(trader: SignerWithAddress, orderToEnter: any, expectedStatus: number
        , stpCanceledOrderToVerify:any ={}
        , expectedCode: string = ethers.constants.HashZero
        , expectedTotalAmount = BigNumber.from(0), expectedQuantityFilled = BigNumber.from(0), expectedTotalFee = BigNumber.from(0)
        ): Promise<string | any>{

        const tx = await tradePairs.connect(trader).addNewOrder(orderToEnter);
        const res: any  = await tx.wait();
        // let i = 0;
        for (const e of res.events) {

            if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader.address ) {
                //console.log("event", i, e.args.order);
                //i++;
                //expect(e.event).to.be.equal('OrderStatusChanged');
                //expect(e.args.traderaddress).to.be.equal(order.traderaddress);
                let order: any;
                if (e.args.order.clientOrderId == orderToEnter.clientOrderId) {
                    order = orderToEnter;
                } else if (e.args.order.clientOrderId == stpCanceledOrderToVerify.clientOrderId) {
                    order = stpCanceledOrderToVerify;
                    expectedStatus = 4
                    expectedCode = Utils.fromUtf8("T-STPR-01");
                    expectedTotalAmount = BigNumber.from(0);
                    expectedQuantityFilled = BigNumber.from(0);
                    expectedTotalFee = BigNumber.from(0);
                } else {
                    continue;
                }

                if (e.args.order.status ==1 && e.args.order.status != expectedStatus &&  e.args.code != expectedCode) {
                    console.log("Order Rejected unexpectedly", Utils.toUtf8(e.args.code));
                }
                if (!e.args.order.totalAmount.eq(expectedTotalAmount) || e.args.order.status != expectedStatus ) {
                    console.log("expectedStatus:", expectedStatus , "expectedTotalAmount:", expectedTotalAmount, "Order:", e.args.order);
                }

                expect(e.args.pair).to.be.equal(order.tradePairId);

                expect(e.args.order.traderaddress).to.be.equal(order.traderaddress);
                expect(e.args.order.tradePairId).to.be.equal(order.tradePairId);
                expect(e.args.order.clientOrderId).to.be.equal(order.clientOrderId);

                expect(e.args.order.price).to.be.equal(order.price);
                expect(e.args.order.totalAmount).to.be.equal(expectedTotalAmount);      // not executed, yet, so totalamount is 0
                expect(e.args.order.quantity).to.be.equal(order.quantity);
                expect(e.args.order.side).to.be.equal(order.side);             // side is BUY=0
                expect(e.args.order.type1).to.be.equal(order.type1);            // type1 is LIMIT=1
                expect(e.args.order.type2).to.be.equal(order.type2);            // type2 is GTC=0
                expect(e.args.order.status).to.be.equal(expectedStatus);           // status is NEW = 0
                expect(e.args.order.quantityFilled).to.be.equal(expectedQuantityFilled);   // not executed, yet, so quantityfilled is 0
                expect(e.args.order.totalFee).to.be.equal(expectedTotalFee);         // not executed, yet, so free is 0
                expect(e.args.code).to.be.equal(expectedCode);         // error code
                return e.args.order.id;
            }
        }
    }


    before(async function () {
        const { owner: owner1, admin: admin1, auctionAdmin: admin2, trader1: t1, trader2: t2 , treasurySafe: ts} = await f.getAccounts();
        owner = owner1;
        admin = admin1;
        auctionAdmin = admin2;
        trader1 = t1;
        trader2 = t2;
        treasurySafe= ts;

        console.log("Owner", owner.address);
        console.log("Admin", admin.address );
        console.log("AuctionAdmin", auctionAdmin.address);
        console.log("Trader1", trader1.address);
        console.log("Trader2", trader2.address);

        MockToken = await ethers.getContractFactory("MockToken");

    });

    beforeEach(async function () {
        const portfolioContracts = await f.deployCompletePortfolio(true);
        portfolioMain = portfolioContracts.portfolioMainnet;
        portfolio = portfolioContracts.portfolioSub;
        gasStation = portfolioContracts.gasStation;
        alot = portfolioContracts.alot;
        portfolioSubHelper = portfolioContracts.portfolioSubHelper;

        //defaultDestinationChainId = await portfolioBridgeSub.getDefaultDestinationChain();
        orderBooks = await f.deployOrderBooks();
        exchange = await f.deployExchangeSub(portfolio, orderBooks)
        tradePairs = await f.deployTradePairs(orderBooks, portfolio, exchange);

        quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
        quoteAssetAddr = quoteToken.address;
        await f.addToken(portfolioMain, portfolio, quoteToken, 0.1, mode);

        const newBalance = ethers.utils.parseEther('1000000');

        await f.setHardhatBalance(trader1, newBalance);

        buyOrder = {
            traderaddress: trader1.address
            , clientOrderId : await Utils.getClientOrderId(ethers.provider, trader1.address)
            , tradePairId
            , price: Utils.parseUnits('100', quoteDecimals)
            , quantity: Utils.parseUnits('10', baseDecimals)
            , side :  0   // Buy
            , type1 : 1   // market orders not enabled
            , type2: 0   // GTC
            , stp : 0   // CancelTaker
        }

        sellOrder = {
            traderaddress: trader1.address
            , clientOrderId : await Utils.getClientOrderId(ethers.provider, trader1.address, 1)
            , tradePairId
            , price: Utils.parseUnits('101', quoteDecimals)
            , quantity: Utils.parseUnits('10', baseDecimals)
            , side :  1   // Sell
            , type1 : 1   // market orders not enabled
            , type2: 0   // GTC
            , stp : 0   // CancelTaker
        }
    });

        it("Should not initialize again after deployment", async function () {
            await expect(tradePairs.initialize(orderBooks.address, portfolio.address))
                .to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("Exchange Should have DEFAULT_ADMIN_ROLE", async function () {
            expect(await tradePairs.hasRole(await tradePairs.DEFAULT_ADMIN_ROLE(), exchange.address)).to.be.equal(true);
        });

        it("TradePairs Should have EXECUTOR_ROLE on orderbooks", async function () {
            expect(await orderBooks.hasRole(await orderBooks.EXECUTOR_ROLE(), tradePairs.address)).to.be.equal(true);
        });

        it("TradePairs Should have EXECUTOR_ROLE on portfolio", async function () {
            expect(await portfolio.hasRole(await portfolio.EXECUTOR_ROLE(), tradePairs.address)).to.be.equal(true);
        });

        it("Should not accept via fallback()", async function () {
            const ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
            const iface = new ethers.utils.Interface(ABI)
            const calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader2.address, Utils.toWei('100')])
            await expect(owner.sendTransaction({to: tradePairs.address, data: calldata}))
                .to.be.revertedWith("T-NFUN-01")
        })

        it("Should be able to add native as base asset and ERC20 as quote asset", async function () {


            await expect(tradePairs.connect(trader1).addTradePair(tradePairId, tokenStruct, baseDisplayDecimals,
                                                tokenStruct,  quoteDisplayDecimals,
                                                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                                                .to.be.revertedWith("AccessControl:");

            await f.addTradePair(exchange, pair, defaultPairSettings)

            expect((await tradePairs.getTradePairs())[0]).to.be.equal(tradePairId);

            expect((await tradePairs.getTradePair(tradePairId)).baseSymbol).to.be.equal(baseSymbol);
            expect((await tradePairs.getTradePair(tradePairId)).quoteSymbol).to.be.equal(quoteSymbol);
            expect((await tradePairs.getTradePair(tradePairId)).baseDecimals).to.be.equal(baseDecimals);
            expect((await tradePairs.getTradePair(tradePairId)).quoteDecimals).to.be.equal(quoteDecimals);
            expect((await tradePairs.getTradePair(tradePairId)).baseDisplayDecimals).to.be.equal(baseDisplayDecimals);
            expect((await tradePairs.getTradePair(tradePairId)).quoteDisplayDecimals).to.be.equal(quoteDisplayDecimals);

            expect((await tradePairs.getTradePair(tradePairId)).minTradeAmount).to.be.equal(Utils.parseUnits(minTradeAmount.toString(), quoteDecimals));
            expect((await tradePairs.getTradePair(tradePairId)).maxTradeAmount).to.be.equal(Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals));

            expect((await tradePairs.getTradePair(tradePairId)).auctionMode).to.be.equal(mode);

            // check buy side order book id
            const buyBookStr = `${baseSymbolStr}/${quoteSymbolStr}-BUYBOOK`
            const buyBook = await tradePairs.getBookId(tradePairId, 0)  // buy side
            expect(buyBook).to.equal(Utils.fromUtf8(buyBookStr))

            // check sell side order book id
            const sellBookStr = `${baseSymbolStr}/${quoteSymbolStr}-SELLBOOK`
            const sellBook = await tradePairs.getBookId(tradePairId, 1)  // sell side
            expect(sellBook).to.equal(Utils.fromUtf8(sellBookStr))
        });

        it("Should not remove TradePair if orderbook is not empty", async function () {

            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            await f.addTradePair(exchange, pair, defaultPairSettings)
            expect((await tradePairs.getTradePairs()).length).to.be.equal(1);

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)

            const tx =  await tradePairs.connect(trader1).addNewOrder(buyOrder)
            const receipt = await tx.wait();
            //console.log("Gas used", Utils.formatUnits(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice).div(10**9),18));
           // console.log("Gas used", receipt.cumulativeGasUsed.toString(), receipt.effectiveGasPrice.toString());

            sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address,3);
            await tradePairs.connect(trader1).addNewOrder(sellOrder);
            await expect(tradePairs.connect(trader1).removeTradePair(tradePairId))
                    .to.be.revertedWith("AccessControl:");

            await expect(tradePairs.removeTradePair(tradePairId))
                   .to.be.revertedWith("T-RMTP-01");

            //Cancel buy order
            let orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, buyOrder.clientOrderId);
            await tradePairs.connect(trader1).cancelOrder(orderbyCl1.id);
            //Original order removed
            expect((await tradePairs.getOrder(orderbyCl1.id)).id).to.be.equal(ethers.constants.HashZero );
            //Still fails
            await expect(tradePairs.removeTradePair(tradePairId))
                   .to.be.revertedWith("T-RMTP-01");
            //Cancel sell order
            orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address,  sellOrder.clientOrderId);
            await tradePairs.connect(trader1).cancelOrder(orderbyCl1.id);
            //Original order removed
            expect((await tradePairs.getOrder(orderbyCl1.id)).id).to.be.equal(ethers.constants.HashZero );

            // Success
            await expect(tradePairs.removeTradePair(tradePairId))
            .to.emit(tradePairs, "ParameterUpdated")
            .withArgs(1, tradePairId, "T-REMOVETRADEPAIR", 0, 0);

            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            expect(await tradePairs.tradePairExists(tradePairId)).to.be.false;

            await f.addTradePair(exchange, pair, defaultPairSettings);

            // non existent tradepair
            await expect(tradePairs.removeTradePair(Utils.fromUtf8("TK1/TK2")))
            .to.not.emit(tradePairs, "ParameterUpdated");

        });

        it("Should update maker and taker fee rates from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(exchange, pair, defaultPairSettings)

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).updateRate(tradePairId, mRate, 0)).to.be.revertedWith("AccessControl:");
            await expect(tradePairs.connect(trader2).updateRate(tradePairId, tRate, 1)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).updateRate(tradePairId, mRate, 0);
            expect((await tradePairs.getTradePair(tradePairId)).makerRate).to.be.equal(mRate);
            await tradePairs.connect(owner).updateRate(tradePairId, tRate, 1);
            expect((await tradePairs.getTradePair(tradePairId)).takerRate).to.be.equal(tRate);

            // call with wrong rate type
            await expect(tradePairs.connect(owner).updateRate(tradePairId, tRate, 2)).to.be.revertedWith("Transaction reverted");
        });

        it("Should update max number of fills from the owner account", async function () {
            expect(await tradePairs.maxNbrOfFills()).to.be.equal(ethers.BigNumber.from(100));
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setMaxNbrOfFills(10)).to.be.revertedWith("AccessControl:");
            //Fail for less than 10
            await expect(tradePairs.setMaxNbrOfFills(9)).to.be.revertedWith("T-MNOE-01");
            // succeed from owner accounts
            await tradePairs.setMaxNbrOfFills(10);
            expect(await tradePairs.maxNbrOfFills()).to.be.equal(ethers.BigNumber.from(10));

        });


        it("Should add and remove order types from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).addOrderType(tradePairId, 0)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).addOrderType(tradePairId, ethers.BigNumber.from(0));
            await tradePairs.connect(owner).addOrderType(tradePairId, ethers.BigNumber.from(1));
            let allowedOrderTypes = await tradePairs.getAllowedOrderTypes(tradePairId);
            expect(allowedOrderTypes.length).to.be.equal(2);
            expect(allowedOrderTypes[0]).to.be.equal(ethers.BigNumber.from(1));
            expect(allowedOrderTypes[1]).to.be.equal(ethers.BigNumber.from(0));
            // fail for non-admin
            await expect(tradePairs.connect(trader1).removeOrderType(tradePairId, ethers.BigNumber.from(0))).to.be.revertedWith("AccessControl:");
            // succeed for admin
            await tradePairs.connect(owner).removeOrderType(tradePairId, ethers.BigNumber.from(0));
            allowedOrderTypes = await tradePairs.getAllowedOrderTypes(tradePairId);
            expect(allowedOrderTypes.length).to.be.equal(1);
            expect(allowedOrderTypes[0]).to.be.equal(ethers.BigNumber.from(1));

            // cannot remove limit orders
            await expect(tradePairs.connect(owner).removeOrderType(tradePairId, ethers.BigNumber.from(1)))
                         .to.be.revertedWith("T-LONR-01");
        });

        it("Should set min trade amount from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(exchange, pair, defaultPairSettings)

            const minTradeAmount1 = Utils.parseUnits('50', quoteDecimals);
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setMinTradeAmount(tradePairId, minTradeAmount1)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setMinTradeAmount(tradePairId, minTradeAmount1);
            expect((await tradePairs.getTradePair(tradePairId)).minTradeAmount).to.be.equal(minTradeAmount1);
        });

        it("Should set max trade amount from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;
            await f.addTradePair(exchange, pair, defaultPairSettings)

            const maxTradeAmount1 = Utils.parseUnits('250', quoteDecimals);
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setMaxTradeAmount(tradePairId, maxTradeAmount1)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setMaxTradeAmount(tradePairId, maxTradeAmount1);
            expect((await tradePairs.getTradePair(tradePairId)).maxTradeAmount).to.be.equal(maxTradeAmount1);
        });

        it("Should set min post amount from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(exchange, pair, defaultPairSettings)

            const minPostAmount = Utils.parseUnits('50', quoteDecimals);
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setMinPostAmount(tradePairId, minPostAmount)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setMinPostAmount(tradePairId, minPostAmount);
            expect((await tradePairs.getTradePair(tradePairId)).minPostAmount).to.be.equal(minPostAmount);
        });


        it("Should set display decimals from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(exchange, pair, defaultPairSettings)

            const displayDecimals = 2;
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, Boolean(1))).to.be.revertedWith("AccessControl:");
            await expect(tradePairs.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, Boolean(0))).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setDisplayDecimals(tradePairId, displayDecimals, Boolean(1));
            expect((await tradePairs.getTradePair(tradePairId)).baseDisplayDecimals).to.be.equal(displayDecimals);
            await tradePairs.connect(owner).setDisplayDecimals(tradePairId, displayDecimals, Boolean(0));
            expect((await tradePairs.getTradePair(tradePairId)).quoteDisplayDecimals).to.be.equal(displayDecimals);
        });

        it("Should set allowed slippage percentage from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;
            await f.addTradePair(exchange, pair, defaultPairSettings)

            const allowedSlippagePercent = 25;
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setAllowedSlippagePercent(tradePairId, allowedSlippagePercent)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setAllowedSlippagePercent(tradePairId, allowedSlippagePercent);
            expect((await tradePairs.getTradePair(tradePairId)).allowedSlippagePercent).to.be.equal(allowedSlippagePercent);
        });

        it("Should be able to add a new buy order from the trader accounts", async function () {
            const minTradeAmount = 5;
            const maxTradeAmount = 2000;
            const mode = 0;  // auction off
            const defaultTokenDeposit = '3000'
            const pairSettings = {
                minTradeAmount: minTradeAmount,
                maxTradeAmount: maxTradeAmount,
                mode: mode,
            }

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            expect(portfolioMain.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, quoteDecimals, quoteDecimals, '0', ethers.utils.parseUnits('0.5',quoteDecimals))).to.be.revertedWith("P-TSDM-01");
            expect(portfolio.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, srcChainId, quoteDecimals, quoteDecimals, mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals),Utils.fromUtf8(quoteTokenStr))).to.be.revertedWith("P-TSDM-01");
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits(defaultNativeDeposit, baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits(defaultNativeDeposit, baseDecimals));

            // deposit some native to portfolio for trader2
            await f.depositNative(portfolioMain, trader2, defaultNativeDeposit)

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals));

            await f.addTradePair(exchange, pair, pairSettings)


            //Set minPostAMount = minTradeAmount*10
            const minPostAmount = Utils.parseUnits((minTradeAmount*10).toString(), quoteDecimals);
            await tradePairs.connect(owner).setMinPostAmount(tradePairId, minPostAmount);


            const tradePairData = await tradePairs.getTradePair(tradePairId);
            // console.log("MinTrade", tradePairData.minTradeAmount, "MinPost", tradePairData.minPostAmount)
            expect(tradePairData.minTradeAmount).to.be.equal(Utils.parseUnits(minTradeAmount.toString(), quoteDecimals));
            expect(tradePairData.minPostAmount).to.be.equal(minPostAmount);

            //buyOrder.price(100) * quantity(10) 1000 > 50 (5*10 minPost) > 5(minTrade)
            await addOrderAndVerify(trader1, buyOrder, 0);  // status is NEW = 0
            // Clientorderid not unique
            // {GTC, FOK, IOC, PO}

            await addOrderAndVerify(trader1, buyOrder, 1, Utils.fromUtf8("T-CLOI-01"));  // status is REJECTED = 1

            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address);
            buyOrder.type2 = 1; // FOK

            await expect(tradePairs.connect(trader1).addNewOrder(buyOrder)).to.be.revertedWith("T-FOKF-01");

            sellOrder.type2 = 3; // PO
            sellOrder.price = Utils.parseUnits('100', quoteDecimals)
            sellOrder.traderaddress = trader2.address;
            await addOrderAndVerify(trader2, sellOrder, 1, Utils.fromUtf8("T-T2PO-01"));  // status is REJECTED = 1

            // cannot add market order if not an allowed type
            buyOrder.type1 = 0; // market orders
            buyOrder.type2 = 0; // GTC
            buyOrder.price = BigNumber.from(0); // market orders should have 0 price
            //No need to get new clientorderid as it will revert for other reasons first
            await addOrderAndVerify(trader1, buyOrder, 1, Utils.fromUtf8("T-IVOT-01"));  // status is REJECTED = 1

            // cannot add market order if auction is on
            await tradePairs.connect(owner).addOrderType(tradePairId, 0);    // add market order first
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 2);  // auction is OPEN
            await addOrderAndVerify(trader1, buyOrder, 1, Utils.fromUtf8("T-AUCT-04"));  // status is REJECTED = 1
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 0);  // auction is OFF

            // Revert when traderaddress != sender
            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 2);
            buyOrder.price = Utils.parseUnits('100', quoteDecimals);
            //send with trader2
            await expect(tradePairs.connect(trader2).addNewOrder(buyOrder)).to.be.revertedWith("T-OOCA-01");

            // reject a sell limit order too big
            sellOrder.type2 = 0; // GTC
            sellOrder.quantity = Utils.parseUnits('1000', baseDecimals)
            //buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 3);
            await addOrderAndVerify(trader2, sellOrder, 1, Utils.fromUtf8("T-MTMT-01"));  // status is REJECTED = 1


            let sellQty = 0.01;
            let sellPx = 101;
            const feePct = 0.003;

            // cancel the a limit order where the remaining is too small to be posted to ob (no fills)
            // reject a sell limit order too small
            sellOrder.type1 = 1;  // limit order
            sellOrder.price = Utils.parseUnits(sellPx.toString(), quoteDecimals);
            sellOrder.quantity = Utils.parseUnits(sellQty.toString(), baseDecimals);
            await addOrderAndVerify(trader2, sellOrder, 1, Utils.fromUtf8("T-LTMT-01"));  // status is REJECTED = 1


            // Try to post an order smaller than minPostAmount, gets a cancel
            sellQty = 0.1;
            sellOrder.quantity = Utils.parseUnits(sellQty.toString(), baseDecimals);
            await addOrderAndVerify(trader2, sellOrder, 4, Utils.fromUtf8("T-LTPA-01"));  // status is CANCELED = 4

            // fill a very small limit order if there is a maker 100 * 0.06 = 6 > 5
            // minTradeAmount = 5;
            sellPx = 100
            sellQty = 0.06;
            //console.log((sellPx * sellQty * feePct).toString());

            let feeCalculated =  Utils.parseUnits('0.018', quoteDecimals) //100 * 0.06 * 0.003
            sellOrder.price = Utils.parseUnits(sellPx.toString(), quoteDecimals);
            sellOrder.quantity = Utils.parseUnits(sellQty.toString(), baseDecimals);
            await addOrderAndVerify(trader2, sellOrder, 3, ethers.constants.HashZero, Utils.parseUnits((BigNumber.from(sellPx * sellQty)).toString(), quoteDecimals)
                , sellOrder.quantity, BigNumber.from(feeCalculated));  //  status is FILLED = 3



            // fill a very small market order if there is a maker
            sellOrder.type1 = 0; // market orders
            sellOrder.price = Utils.parseUnits(sellPx.toString(), quoteDecimals);
            sellOrder.quantity = Utils.parseUnits(sellQty.toString(), baseDecimals);
            //console.log (sellOrder.price, sellOrder.quantity , sellOrder.price.mul(sellOrder.quantity))
            await addOrderAndVerify(trader2, sellOrder, 3, ethers.constants.HashZero, Utils.parseUnits((BigNumber.from(sellPx * sellQty)).toString(), quoteDecimals)
                , sellOrder.quantity, BigNumber.from(feeCalculated));  //status is FILLED = 3

            // So far 0.06*2 = 0.12 of the buyOrder is partially filled out of 10
            // Enter a big sellOrder that fills the buyOrder and has a small partial left that can't be posted and it gets a cancel
            sellOrder.type1 = 1
            sellQty = 10;
            //const buyOrderFilledQty = 0.12
            const sellOrderFilledQty = 9.88; //(10-0.12)
            const sellAmount = 988 // 9.88 *100
            feeCalculated = Utils.parseUnits('2.964', quoteDecimals) //100 * 9.88 * 0.003 2.964

            sellOrder.quantity = Utils.parseUnits(sellQty.toString(), baseDecimals);
            sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader2.address, 3);
            await addOrderAndVerify(trader2, sellOrder, 4, Utils.fromUtf8("T-LTPA-01"), Utils.parseUnits(BigNumber.from(sellAmount).toString(), quoteDecimals)
                 , Utils.parseUnits(sellOrderFilledQty.toString(), baseDecimals), BigNumber.from(feeCalculated));  //  status CANCELED = 4


            // Now check the buy side logic
            // Nothing in the ob. Enter a sell order

            // reject a market order - OB empty
            buyOrder.type1 = 0; // market orders
            buyOrder.type2 = 0; // GTC
            buyOrder.price = BigNumber.from(0); // market orders should have 0 price
            await addOrderAndVerify(trader1, buyOrder, 1, Utils.fromUtf8("T-LTMT-01"));  // status is REJECTED = 1

            // reject a buy limit order too big
            let buyQty = 1000;
            let buyPx = 10
            buyOrder.type1 = 1;  // limit order
            buyOrder.price = Utils.parseUnits(buyPx.toString(), quoteDecimals);
            buyOrder.quantity = Utils.parseUnits(buyQty.toString(), baseDecimals)
            await addOrderAndVerify(trader1, buyOrder, 1, Utils.fromUtf8("T-MTMT-01"));  // status is REJECTED = 1

            // order too small
            buyQty = 0.01;
            buyPx = 100;
            buyOrder.type1 = 1;
            buyOrder.quantity = Utils.parseUnits(buyQty.toString(), baseDecimals);
            buyOrder.price = Utils.parseUnits(buyPx.toString(), quoteDecimals);
            await addOrderAndVerify(trader1, buyOrder, 1, Utils.fromUtf8("T-LTMT-01"));  // status is REJECTED = 1

            // Try to post an order smaller than minPostAmount, gets a cancel
            buyQty = 0.1;
            buyOrder.quantity = Utils.parseUnits(buyQty.toString(), baseDecimals);

            await addOrderAndVerify(trader1, buyOrder, 4, Utils.fromUtf8("T-LTPA-01"));  // status is CANCELED = 4
            await addOrderAndVerify(trader2, sellOrder, 0)// status is NEW = 0

            buyQty = 10.05;
            const buyOrderFilledQty = 10;
            const buyAmount = 1000 // 10 *100
            feeCalculated = Utils.parseUnits('0.03', baseDecimals) // 10 * 0.003 =0.03

            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 3);
            buyOrder.quantity = Utils.parseUnits(buyQty.toString(), baseDecimals);
            await addOrderAndVerify(trader1, buyOrder, 4, Utils.fromUtf8("T-LTPA-01"), Utils.parseUnits(BigNumber.from(buyAmount).toString(), quoteDecimals)
                 , Utils.parseUnits(buyOrderFilledQty.toString(), baseDecimals), BigNumber.from(feeCalculated));  //  status CANCELED = 4


        });

        it("Should be able to add a new sell order from the trader accounts", async function () {

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // const tx = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 1, 1, type2);
            const order = {
                traderaddress: trader1.address
                , clientOrderId : await Utils.getClientOrderId(ethers.provider, trader1.address)
                , tradePairId
                , price: Utils.parseUnits('100', quoteDecimals)
                , quantity: Utils.parseUnits('10', baseDecimals)
                , side :  1   // Sell
                , type1 : 1   // market orders not enabled
                , type2: 0   // GTC
                , stp: 0 // Cancel Taker
            }

            await addOrderAndVerify(trader1, order, 0);  // status is NEW = 0


            order.side = 0;   // buy side
            //{GTC, FOK, IOC, PO}

            order.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address);
            order.type2 = 1; // FOK
            order.price = Utils.parseUnits('98', quoteDecimals);

            await expect(tradePairs.connect(trader1).addNewOrder(order)).to.be.revertedWith("T-FOKF-01");


            order.type2 = 3; // PO
            order.price = Utils.parseUnits('100', quoteDecimals);
            await addOrderAndVerify(trader1, order, 1, Utils.fromUtf8("T-T2PO-01"));  // status is REJECTED = 1
        });

        it("Should be able to send addOrderList with autoFill", async function () {
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            const type2 = 0 ;  // GTC
            const deposit_amount = '100'

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)

            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            await f.addTradePair(exchange, pair, defaultPairSettings)
            expect((await tradePairs.getTradePairs()).length).to.be.equal(1);

            const AVAX = baseSymbol;
            const QT = quoteSymbol;
            await portfolio.setBridgeParam(QT, 0, Utils.parseUnits('1', quoteDecimals), true)
            await portfolio.setBridgeParam(AVAX, 0, Utils.toWei("0.1"), true)

            const params =await portfolio.bridgeParams(QT);
            expect(params.gasSwapRatio).to.equal(Utils.parseUnits('1', quoteDecimals));
            expect(params.fee).to.equal(0);
            expect(params.usedForGasSwap).to.equal(true);

            let gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address);
            const gasDeposited = await gasStation.gasAmount();
            const qtSwappedAmnt = (await portfolio.bridgeParams(QT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

            // Autofill does not kick in for addOrderList
            const WalBaltoReset =gasDeposited.div(2);
            await f.setHardhatBalance(trader1, WalBaltoReset);

            const newOrders = []

            //buy orders
            for (let i = 0; i < 6; i++) {
                const order = {
                    traderaddress: trader1.address
                    , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader1.address, i)
                    , tradePairId
                    , price: Utils.parseUnits((100 - i).toString(), quoteDecimals) // 100, 99, 98
                    , quantity: Utils.parseUnits('1', baseDecimals)
                    , side: 0
                    , type1: 1
                    , type2
                    , stp: 0 // Cancel Taker
                }
                newOrders.push(order)
            }

            const tx1 = await tradePairs.connect(trader1)
                    .addOrderList(newOrders,{gasLimit: 3000000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res1: any = await tx1.wait();
            const gasUsedInTx = res1.cumulativeGasUsed.mul(res1.effectiveGasPrice);
            // autoFill kicked in, wallet balance less than what we started with after deposited gas
            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset.add(gasDeposited))).to.lte(gasUsedInTx);
            // change in QT
            expect((await portfolio.getBalance(trader1.address, quoteSymbol)).total).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals).sub(qtSwappedAmnt));
            // No impact on treasury nor Gas Station
            expect((await portfolio.getBalance(treasurySafe.address, quoteSymbol)).total).to.equal(qtSwappedAmnt);
            expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited);
            gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address);


            //No impact on Trader Portfolio ALOT Balance
            //expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(Utils.parseUnits(deposit_amount, alot_decimals));

            //Reset trader1 balances for later tests
            const newBalance = ethers.utils.parseEther('1000000');
            await f.setHardhatBalance(trader1, newBalance);

            let buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            let sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(0);

            //Sell orders reuse the newOrders array
            for (let i=0; i<6; i++) {
                newOrders[i].clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, i);
                newOrders[i].price = (Utils.parseUnits((100 + i).toString(), quoteDecimals)); //100, 101, 102
                newOrders[i].side = 1;
            }

            const tx = await tradePairs.connect(trader1).addOrderList(newOrders);
            const receipt = await tx.wait();

            //console.log("addOrderList Gas used", Utils.formatUnits(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice).div(10**9),18));
            // console.log("addOrderList Gas used", receipt.cumulativeGasUsed.toString(), receipt.effectiveGasPrice.toString());
            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            // One sell order gets STP
            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(5);
            // we have 100 - 101


            for (let i = 0; i < 6; i++) {
                newOrders[i].clientOrderId =await Utils.getClientOrderId(ethers.provider, trader1.address, i);
                newOrders[i].price = Utils.parseUnits((100.5 + i).toString(), quoteDecimals); //100.5 , 101.5
            }
            newOrders[1].type2 = 1;  //FOK
            //console.log (newOrders)
            // Only 1 order is unfilled FOK but the entire batch reverts
            await expect(tradePairs.connect(trader1).addOrderList(newOrders)).to.be.revertedWith("T-FOKF-01");


            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");


            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(5);

            newOrders[1].type2=2 // IOC,
            // Only 1 order is IOC and it gets canceled
            await tradePairs.connect(trader1).addOrderList(newOrders);

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            // No impact
            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(10); // 5 more added to the orderbook


            for (let i = 0; i < 6; i++) {
                newOrders[i].clientOrderId =await Utils.getClientOrderId(ethers.provider, trader1.address,i);
                newOrders[i].price = Utils.parseUnits((98.9 + i).toString(), quoteDecimals);
                newOrders[i].type2 = 3 // PO,
            }

            // First 2 PO orders will get a match hence they are rejected
            // the rest of the orders are processed
            const tx2 = await tradePairs.connect(trader1).addOrderList(newOrders);
            const receipt2 : any  = await tx2.wait();

            for (const e of receipt2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){
                    //expect(e.args.pair).to.be.equal(tradePairId);
                    const order = newOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                    expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                    expect(e.args.pair).to.be.equal(order?.tradePairId);
                    expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                    expect(e.args.order.price).to.be.equal(order?.price);
                    expect(e.args.order.quantity).to.be.equal(order?.quantity);
                    expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                    expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                    expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                    if (newOrders[0].clientOrderId === order?.clientOrderId ||
                            newOrders[1].clientOrderId === order?.clientOrderId
                    ) { // the very first 2 orders are rejected
                        expect(e.args.order.status).to.be.equal(1);            // status is REJECTED = 1
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));
                    } else {
                        expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                        expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                    }
                    expect(e.args.order.quantityFilled).to.be.equal(0);

                }
            }

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            // for ( const p of sellbook) {
            //     console.log(p.price.toString(), "q", p.quantity.toString())
            // }

            // No impact
            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(14); //Only 4 more added to the orderbook 2 PO orders ignored

            // fail paused
            await tradePairs.connect(owner).pause();
            await expect( tradePairs.connect(trader1).addOrderList(newOrders))
                    .to.be.revertedWith("Pausable: paused");

        });

        it("Should be able to send cancelAddList", async function () {
            const type2 = 0 ;  // GTC
            const deposit_amount = '100'

            await alot.mint(trader1.address, Utils.toWei(deposit_amount));
            await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT,  deposit_amount);


            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            await f.addTradePair(exchange, pair, defaultPairSettings)
            expect((await tradePairs.getTradePairs()).length).to.be.equal(1);

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            await f.depositNative(portfolioMain, trader2, defaultNativeDeposit)
            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            await f.depositToken(portfolioMain, trader2, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)

            const buyOrderIds = []

            const buyOrders = []

            //buy orders
            for (let i = 0; i < 6; i++) {
                const order = {
                    traderaddress: trader1.address
                    , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader1.address, i)
                    , tradePairId
                    , price: Utils.parseUnits((100 - i).toString(), quoteDecimals) //100, 99, 98
                    , quantity: Utils.parseUnits('1', baseDecimals)
                    , side: 0  // Buy
                    , type1: 1 //Limit
                    , type2
                    , stp: 0 // Cancel Taker
                }
                buyOrders.push(order)
            }

            // fail paused
            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1).addOrderList(buyOrders
                , { gasLimit: 3000000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei") })).to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause()

            const tx1 = await tradePairs.connect(trader1)
                    .addOrderList(buyOrders,{gasLimit: 3000000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res1: any = await tx1.wait();

            for (const e of res1.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){
                    //expect(e.args.pair).to.be.equal(tradePairId);
                    //const orderIndex = clientOrderIds.indexOf(e.args.clientOrderId);
                    const order = buyOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                    buyOrderIds.push(e.args.order.id);
                    expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                    expect(e.args.pair).to.be.equal(order?.tradePairId);
                    expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                    expect(e.args.order.price).to.be.equal(order?.price);
                    expect(e.args.order.quantity).to.be.equal(order?.quantity);
                    expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                    expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                    expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                    if (!order) {
                        expect(e.args.order.status).to.be.equal(1);            // status is REJECTED = 1
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));
                    } else {
                        expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                        expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                    }
                    expect(e.args.order.quantityFilled).to.be.equal(0);

                }
            }

            let buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            let sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(0);

            // Sells from trader2 , clone buyOrders and overwrite
            const sellOrders = buyOrders.map(x => Object.assign({}, x));
            const sellOrderIds = [];
            //Sell orders
            for (let i=0; i<6; i++) {
                sellOrders[i].traderaddress= trader2.address
                sellOrders[i].clientOrderId =await Utils.getClientOrderId(ethers.provider, trader2.address,i);
                sellOrders[i].price = (Utils.parseUnits((101 + i).toString(), quoteDecimals)); //101, 102, 103
                sellOrders[i].side = 1;
                sellOrders[i].type2 = 3;//PO

            }

            const tx = await tradePairs.connect(trader2).addOrderList(sellOrders);
            const receipt: any = await tx.wait();

            for (const e of receipt.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader2.address){
                    //expect(e.args.pair).to.be.equal(tradePairId);
                    const order = sellOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);


                    //const orderIndex = SclientOrderIds.indexOf(e.args.clientOrderId);
                    sellOrderIds.push(e.args.order.id);
                    expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                    expect(e.args.pair).to.be.equal(order?.tradePairId);
                    expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                    expect(e.args.order.price).to.be.equal(order?.price);
                    expect(e.args.order.quantity).to.be.equal(order?.quantity);
                    expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                    expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                    expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                    if (!order) {
                        expect(e.args.order.status).to.be.equal(1);            // status is REJECTED = 1
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));
                    } else {
                        expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                        expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                    }
                    expect(e.args.order.quantityFilled).to.be.equal(0);

                }
            }
            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(6);
            // we have 100 - 101

            const replaceBuyOrders = buyOrders.map(x => Object.assign({}, x));
            const RepBuyOrderIds = [];
            //Replace Buys
            for (let i = 0; i < 6; i++) {
                replaceBuyOrders[i].clientOrderId =await Utils.getClientOrderId(ethers.provider, trader1.address,i);
                replaceBuyOrders[i].price = (Utils.parseUnits((101.1 - i).toString(), quoteDecimals));
                replaceBuyOrders[i].quantity = Utils.parseUnits('2', baseDecimals);
            }

            // trader2 gets a silent cancel_reject on trader1 orders and then reverts when trying to add new orders for trader1
            await expect(tradePairs.connect(trader2).cancelAddList(buyOrderIds, replaceBuyOrders)).to.be.revertedWith("T-OOCA-01");

            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1).cancelAddList(buyOrderIds, replaceBuyOrders)).to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause()
            const tx2 = await tradePairs.connect(trader1).cancelAddList(buyOrderIds, replaceBuyOrders);
            const receipt2 : any  = await tx2.wait();

            for (const e of receipt2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){

                    const order = buyOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                    if (order) {// previous orders are cancelled
                        expect(e.args.order.status).to.be.equal(4); // Canceled
                        expect(e.args.order.quantityFilled).to.be.equal(0);
                    } else {
                        RepBuyOrderIds.push(e.args.order.id);

                        const order = replaceBuyOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);
                        expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                        expect(e.args.pair).to.be.equal(order?.tradePairId);
                        expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                        expect(e.args.order.price).to.be.equal(order?.price);
                        expect(e.args.order.quantity).to.be.equal(order?.quantity);
                        expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                        expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                        expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                        if (replaceBuyOrders[0].clientOrderId === order?.clientOrderId ) { // very first order partially filled
                            expect(e.args.order.status).to.be.equal(2);            // status is PARTIAL = 2
                            expect(e.args.order.quantityFilled).to.be.equal(order?.quantity.div(2)); // filled half because all sells were 1 qty
                        } else {
                            expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                            expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                            expect(e.args.order.quantityFilled).to.be.equal(0);
                        }
                    }
                }
            }

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(5); // One of the sells got filled

            const replaceSellOrders = sellOrders.map(x => Object.assign({}, x));
            const RepSellOrderIds = [];
            //Replace Sells
            for (let i=0; i<6; i++) {
                replaceSellOrders[i].clientOrderId =await Utils.getClientOrderId(ethers.provider, trader2.address,i);
                replaceSellOrders[i].price = (Utils.parseUnits((100.1 + i).toString(), quoteDecimals));
                replaceSellOrders[i].quantity = Utils.parseUnits('2', baseDecimals);
            }

            const tx3 = await tradePairs.connect(trader2).cancelAddList(sellOrderIds, replaceSellOrders);
            const receipt3 : any  = await tx3.wait();

            for (const e of receipt3.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader2.address){
                    const order = sellOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);
                    if (order) {// Found in the previous orders. It must be cancelled
                        expect(e.args.order.status).to.be.equal(4); // Canceled
                        expect(e.args.order.quantityFilled).to.be.equal(0);
                    } else {
                        RepSellOrderIds.push(e.args.order.id);
                        //orderIndex = RSclientOrderIds.indexOf(e.args.clientOrderId);
                        const order = replaceSellOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                        if (!order && e.args.order.status == 7) { // status is CANCEL_REJECT = 7
                            //Rejected order, can only find it in  orderId array
                            const sellOrder = sellOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                            //console.log ("Rejected", e.args.orderId, orderIndex2)
                            if (sellOrder?.clientOrderId === sellOrders[0].clientOrderId) {
                                expect(e.args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));
                                //console.log("1", sellOrder);
                            }
                        } else if (order?.clientOrderId === replaceSellOrders[0].clientOrderId // First 2 new orders are rejected
                                || order?.clientOrderId === replaceSellOrders[1].clientOrderId) {
                            //console.log("T-T2PO-01")
                            expect(e.args.order.status).to.be.equal(1); // status is REJECTED = 1
                            expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));

                        } else if (order) {
                            //console.log ("REGULAR", e.args.clientOrderId, orderIndex)
                            expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                            expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                            expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                            expect(e.args.pair).to.be.equal(order?.tradePairId);
                            expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                            expect(e.args.order.quantityFilled).to.be.equal(0);
                            expect(e.args.order.price).to.be.equal(order?.price);
                            expect(e.args.order.quantity).to.be.equal(order?.quantity);
                            expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                            expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                            expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                        }
                    }
                }
            }

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(6); // the Bestbid is partial
            expect(sellbook.length).to.equal(4); // One of the sells got filled, the other got canceled but it couldn't post a new one instead

        });

        it("Should be able to send cancelAddListByClientId", async function () {
            const type2 = 0 ;  // GTC
            const deposit_amount = '100'

            await alot.mint(trader1.address, Utils.toWei(deposit_amount));
            await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT,  deposit_amount);


            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            await f.addTradePair(exchange, pair, defaultPairSettings)
            expect((await tradePairs.getTradePairs()).length).to.be.equal(1);

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            await f.depositNative(portfolioMain, trader2, defaultNativeDeposit)
            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            await f.depositToken(portfolioMain, trader2, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)

            const buyClientOrderIds = []

            const buyOrders = []

            //buy orders
            for (let i = 0; i < 6; i++) {
                const order = {
                    traderaddress: trader1.address
                    , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader1.address, i)
                    , tradePairId
                    , price: Utils.parseUnits((100 - i).toString(), quoteDecimals) //100, 99, 98
                    , quantity: Utils.parseUnits('1', baseDecimals)
                    , side: 0  // Buy
                    , type1: 1 //Limit
                    , type2
                    , stp: 0 // Cancel Taker
                }
                buyOrders.push(order)
            }

            const tx1 = await tradePairs.connect(trader1)
                    .addOrderList(buyOrders,{gasLimit: 3000000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res1: any = await tx1.wait();

            for (const e of res1.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){
                    //expect(e.args.pair).to.be.equal(tradePairId);
                    //const orderIndex = clientOrderIds.indexOf(e.args.clientOrderId);
                    const order = buyOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                    buyClientOrderIds.push(e.args.order.clientOrderId);
                    expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                    expect(e.args.pair).to.be.equal(order?.tradePairId);
                    expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                    expect(e.args.order.price).to.be.equal(order?.price);
                    expect(e.args.order.quantity).to.be.equal(order?.quantity);
                    expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                    expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                    expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                    if (!order) {
                        expect(e.args.order.status).to.be.equal(1);            // status is REJECTED = 1
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));
                    } else {
                        expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                        expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                    }
                    expect(e.args.order.quantityFilled).to.be.equal(0);

                }
            }

            let buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            let sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(0);

            // Sells from trader2 , clone buyOrders and overwrite
            const sellOrders = buyOrders.map(x => Object.assign({}, x));
            const sellClientOrderIds = [];
            //Sell orders
            for (let i=0; i<6; i++) {
                sellOrders[i].traderaddress= trader2.address
                sellOrders[i].clientOrderId =await Utils.getClientOrderId(ethers.provider, trader2.address,i);
                sellOrders[i].price = (Utils.parseUnits((101 + i).toString(), quoteDecimals)); //101, 102, 103
                sellOrders[i].side = 1;
                sellOrders[i].type2 = 3;//PO

            }

            const tx = await tradePairs.connect(trader2).addOrderList(sellOrders);
            const receipt: any = await tx.wait();

            for (const e of receipt.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader2.address){
                    //expect(e.args.pair).to.be.equal(tradePairId);
                    const order = sellOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);


                    //const orderIndex = SclientOrderIds.indexOf(e.args.clientOrderId);
                    sellClientOrderIds.push(e.args.order.clientOrderId);
                    expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                    expect(e.args.pair).to.be.equal(order?.tradePairId);
                    expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                    expect(e.args.order.price).to.be.equal(order?.price);
                    expect(e.args.order.quantity).to.be.equal(order?.quantity);
                    expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                    expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                    expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                    if (!order) {
                        expect(e.args.order.status).to.be.equal(1);            // status is REJECTED = 1
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));
                    } else {
                        expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                        expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                    }
                    expect(e.args.order.quantityFilled).to.be.equal(0);

                }
            }
            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(6);
            // we have 100 - 101

            const replaceBuyOrders = buyOrders.map(x => Object.assign({}, x));
            const RepBuyOrderIds = [];
            //Replace Buys
            for (let i = 0; i < 6; i++) {
                replaceBuyOrders[i].clientOrderId =await Utils.getClientOrderId(ethers.provider, trader1.address,i);
                replaceBuyOrders[i].price = (Utils.parseUnits((101.1 - i).toString(), quoteDecimals));
                replaceBuyOrders[i].quantity = Utils.parseUnits('2', baseDecimals);
            }

            // trader2 gets a silent cancel_reject on trader1 orders and then reverts when trying to add new orders for trader1
            await expect(tradePairs.connect(trader2).cancelAddListByClientIds(buyClientOrderIds, replaceBuyOrders)).to.be.revertedWith("T-OOCA-01");

            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1).cancelAddListByClientIds(buyClientOrderIds, replaceBuyOrders)).to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause()
            const tx2 = await tradePairs.connect(trader1).cancelAddListByClientIds(buyClientOrderIds, replaceBuyOrders);
            const receipt2 : any  = await tx2.wait();

            for (const e of receipt2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){

                    const order = buyOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                    if (order) {// previous orders are cancelled
                        expect(e.args.order.status).to.be.equal(4); // Canceled
                        expect(e.args.order.quantityFilled).to.be.equal(0);
                    } else {
                        RepBuyOrderIds.push(e.args.order.id);

                        const order = replaceBuyOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);
                        expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                        expect(e.args.pair).to.be.equal(order?.tradePairId);
                        expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                        expect(e.args.order.price).to.be.equal(order?.price);
                        expect(e.args.order.quantity).to.be.equal(order?.quantity);
                        expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                        expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                        expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                        if (replaceBuyOrders[0].clientOrderId === order?.clientOrderId ) { // very first order partially filled
                            expect(e.args.order.status).to.be.equal(2);            // status is PARTIAL = 2
                            expect(e.args.order.quantityFilled).to.be.equal(order?.quantity.div(2)); // filled half because all sells were 1 qty
                        } else {
                            expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                            expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                            expect(e.args.order.quantityFilled).to.be.equal(0);
                        }
                    }
                }
            }

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(5); // One of the sells got filled

            const replaceSellOrders = sellOrders.map(x => Object.assign({}, x));
            const RepSellOrderIds = [];
            //Replace Sells
            for (let i=0; i<6; i++) {
                replaceSellOrders[i].clientOrderId =await Utils.getClientOrderId(ethers.provider, trader2.address,i);
                replaceSellOrders[i].price = (Utils.parseUnits((100.1 + i).toString(), quoteDecimals));
                replaceSellOrders[i].quantity = Utils.parseUnits('2', baseDecimals);
            }

            const tx3 = await tradePairs.connect(trader2).cancelAddListByClientIds(sellClientOrderIds, replaceSellOrders);
            const receipt3 : any  = await tx3.wait();

            for (const e of receipt3.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader2.address){
                    const order = sellOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);
                    if (order) {// Found in the previous orders. It must be cancelled
                        expect(e.args.order.status).to.be.equal(4); // Canceled
                        expect(e.args.order.quantityFilled).to.be.equal(0);
                    } else {
                        RepSellOrderIds.push(e.args.order.id);
                        //orderIndex = RSclientOrderIds.indexOf(e.args.clientOrderId);
                        const order = replaceSellOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                        if (!order && e.args.order.status == 7) { // status is CANCEL_REJECT = 7
                            //Rejected order, can only find it in  orderId array
                            const sellOrder = sellOrders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);

                            //console.log ("Rejected", e.args.orderId, orderIndex2)
                            if (sellOrder?.clientOrderId === sellOrders[0].clientOrderId) {
                                expect(e.args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));
                                //console.log("1", sellOrder);
                            }
                        } else if (order?.clientOrderId === replaceSellOrders[0].clientOrderId // First 2 new orders are rejected
                                || order?.clientOrderId === replaceSellOrders[1].clientOrderId) {
                            //console.log("T-T2PO-01")
                            expect(e.args.order.status).to.be.equal(1); // status is REJECTED = 1
                            expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));

                        } else if (order) {
                            //console.log ("REGULAR", e.args.clientOrderId, orderIndex)
                            expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                            expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                            expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                            expect(e.args.pair).to.be.equal(order?.tradePairId);
                            expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                            expect(e.args.order.quantityFilled).to.be.equal(0);
                            expect(e.args.order.price).to.be.equal(order?.price);
                            expect(e.args.order.quantity).to.be.equal(order?.quantity);
                            expect(e.args.order.side).to.be.equal(order?.side);              // side is SELL=1
                            expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                            expect(e.args.order.type2).to.be.equal(order?.type2);   // type2 is GTC=0
                        }
                    }
                }
            }

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(6); // the Bestbid is partial
            expect(sellbook.length).to.equal(4); // One of the sells got filled, the other got canceled but it couldn't post a new one instead

        });

        it("PO & Limit Orders processed in the same block should match or revert depending on the order they are processed", async function () {
            const deposit_amount = '100'

            await alot.mint(trader1.address, Utils.toWei(deposit_amount));
            await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT,  deposit_amount);

            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            await f.addTradePair(exchange, pair, defaultPairSettings)
            expect((await tradePairs.getTradePairs()).length).to.be.equal(1);

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)


            let orders =[]
            //buy PO, followed by sell Limit at the same price
            const buyOrder = {
                traderaddress: trader1.address
                , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader1.address, 2)
                , tradePairId
                , price: Utils.parseUnits((100).toString(), quoteDecimals)
                , quantity: Utils.parseUnits('1', baseDecimals)
                , side: 0  // Buy
                , type1: 1 //Limit
                , type2: 3 //PO
                , stp : 3 // Cancel None
            }
            const sellOrder = Object.assign({}, buyOrder);
            sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 3);
            sellOrder.side = 1;
            sellOrder.type2 = 0; //GTC

            orders.push(buyOrder);
            orders.push(sellOrder);

            const tx = await tradePairs.connect(trader1).addOrderList(orders);
            const res2: any = await tx.wait();

            for (const e of res2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address
                    && e.args.order.status !== 0){ //ignore the first two status= new events

                    const order = orders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);
                    expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                    expect(e.args.pair).to.be.equal(order?.tradePairId);
                    expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                    expect(e.args.order.price).to.be.equal(order?.price);
                    expect(e.args.order.quantity).to.be.equal(order?.quantity);
                    expect(e.args.order.side).to.be.equal(order?.side);
                    expect(e.args.order.type1).to.be.equal(order?.type1);             // type1 is LIMIT=1
                    expect(e.args.order.type2).to.be.equal(order?.type2);
                    expect(e.args.code).to.be.equal(ethers.constants.HashZero);
                    expect(e.args.order.status).to.be.equal(3);            // status is FILLED = 3

                }
            }

            let buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            let sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            // No impact
            expect(buybook.length).to.equal(0);
            expect(sellbook.length).to.equal(0); //Only 4 more added to the orderbook 2 PO orders ignored

            // First Limit order then fallowed by PO order that should be REJECTED
            orders = [];
            sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 1);
            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 0);
            orders.push(sellOrder);
            orders.push(buyOrder);


            const tx1 = await tradePairs.connect(trader1).addOrderList(orders);
            const res1: any = await tx1.wait();


            for (const e of res1.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){
                    const order = orders.find((item: { clientOrderId: string }) => item.clientOrderId === e.args.order.clientOrderId);
                    expect(e.args.order.clientOrderId).to.be.equal(order?.clientOrderId);
                    expect(e.args.pair).to.be.equal(order?.tradePairId);
                    expect(e.args.traderaddress).to.be.equal(order?.traderaddress);
                    expect(e.args.order.price).to.be.equal(order?.price);
                    expect(e.args.order.quantity).to.be.equal(order?.quantity);
                    expect(e.args.order.side).to.be.equal(order?.side);
                    expect(e.args.order.type1).to.be.equal(order?.type1);
                    expect(e.args.order.type2).to.be.equal(order?.type2);

                    if (order?.clientOrderId ===orders[1].clientOrderId) {
                        expect(e.args.order.status).to.be.equal(1);            // status is REJECTED = 1
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));
                    } else {
                        expect(e.args.order.status).to.be.equal(0);            // status is NEW = 0
                        expect(e.args.code).to.be.equal(ethers.constants.HashZero );
                    }
                    expect(e.args.order.quantityFilled).to.be.equal(0);

                }
            }

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(0);
            expect(sellbook.length).to.equal(1);

        });

        it("Should get cancel status based on self trade Prevention mode", async function () {
            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            await f.addTradePair(exchange, pair, defaultPairSettings)
            expect((await tradePairs.getTradePairs()).length).to.be.equal(1);
            //console.log (Utils.toUtf8((await tradePairs.getTradePairs())[0]))
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals));
            // Deposit some base token for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits(defaultNativeDeposit, baseDecimals));

            // trader2 also buying AVAX selling QT
            // deposit some QT to portfolio for trader2
            await f.depositToken(portfolioMain, trader2, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader2.address, quoteSymbol))[0]).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals));

            const price = 10
            const qty = 2;

            const buyOrders = []

            //2 buy orders all 2  @10 & @112 / trader1 buying AVAX selling QT
            for (let i = 0; i < 2; i++) {
                const order = {
                    traderaddress: trader1.address
                    , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader1.address, i)
                    , tradePairId
                    , price: Utils.parseUnits((price + 2*i).toString(), quoteDecimals)
                    , quantity: Utils.parseUnits(qty.toString(), baseDecimals)
                    , side: 0  // Buy
                    , type1: 1 // Limit
                    , type2: 0   // GTC
                    , stp: 0 // Cancel Taker
                }
                buyOrders.push(order)
            }
            // another buy order from trader2 @11
            const buyOrder = {
                traderaddress: trader2.address
                , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader2.address)
                , tradePairId
                , price: Utils.parseUnits('11', quoteDecimals)
                , quantity: Utils.parseUnits(qty.toString(), baseDecimals)
                , side: 0 // Buy
                , type1: 1 // Limit
                , type2: 0   // GTC
                , stp: 0 // Cancel Taker
            }

            await tradePairs.connect(trader1).addOrderList(buyOrders);
            await tradePairs.connect(trader2).addNewOrder(buyOrder);

            const buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            const sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            //console.log(buyOrders.length);

            expect(buybook.length).to.equal(3);
            expect(sellbook.length).to.equal(0);

            //trader1 trying to sell
            const sellOrder = {
                traderaddress: trader1.address
                , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader1.address, 3)
                , tradePairId
                , price: Utils.parseUnits('12', quoteDecimals)
                , quantity: Utils.parseUnits(qty.toString(), baseDecimals)
                , side: 1 // Sell
                , type1: 1 // Limit
                , type2: 0   // GTC
                , stp: 0 // Cancel Taker
            }

            await addOrderAndVerify(trader1, sellOrder, 4, Utils.fromUtf8("T-STPR-01"));  // status is CANCELED = 4


            sellOrder.stp = 3 // Cancel NONE

            await addOrderAndVerify(trader1, sellOrder, 3, ethers.constants.HashZero, Utils.parseUnits((BigNumber.from(12).mul(qty)).toString(), quoteDecimals),
            buyOrder.quantity, BigNumber.from(72000));  // status is FILLED = 3

            // 2 buy orders left 2 @11, 2 @10

            // Try to Sell 4 @ 10 , should only get a partial for 2 at 11 and get a cancel for the remaining

            sellOrder.price =Utils.parseUnits('10', quoteDecimals)
            sellOrder.quantity = Utils.parseUnits('4', baseDecimals)
            sellOrder.stp = 0 // Cancel Taker
            //sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 5)
            await addOrderAndVerify(trader1, sellOrder, 4, Utils.fromUtf8("T-STPR-01"), Utils.parseUnits((BigNumber.from(11).mul(2)).toString(), quoteDecimals),
            buyOrder.quantity, BigNumber.from(66000));  // status is CANCLED = 4

        });



        it("Should get unsolicited cancel when maxNbrOfFills reached", async function () {
            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            await f.addTradePair(exchange, pair, defaultPairSettings)
            expect((await tradePairs.getTradePairs()).length).to.be.equal(1);
            //console.log (Utils.toUtf8((await tradePairs.getTradePairs())[0]))
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals));

            const maxNbrOfFills = 15;
            const matchPrice = '10'
            const qty = 2;

            const buyOrders = []

            await tradePairs.setMaxNbrOfFills(maxNbrOfFills);
            expect(await tradePairs.maxNbrOfFills()).to.be.equal(ethers.BigNumber.from(maxNbrOfFills));

            //buy orders all 1 unit @10  trader1 buying AVAX selling QT
            for (let i = 0; i < maxNbrOfFills + 1; i++) {
                const order = {
                    traderaddress: trader1.address
                    , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader1.address, i)
                    , tradePairId
                    , price: Utils.parseUnits(matchPrice, quoteDecimals)
                    , quantity: Utils.parseUnits(qty.toString(), baseDecimals)
                    , side: 0  // Buy
                    , type1: 1 // Limit
                    , type2: 0   // GTC
                    , stp: 0 // Cancel Taker
                }
                buyOrders.push(order)
            }


            await tradePairs.connect(trader1).addOrderList(buyOrders);

            const buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            const sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(1);
            expect(sellbook.length).to.equal(0);
            // console.log(Utils.formatUnits(buybook[0].price, quoteDecimals));
            // console.log(Utils.formatUnits(buybook[0].quantity, baseDecimals));
            expect(buybook[0].price).to.equal(Utils.parseUnits(matchPrice, quoteDecimals));
            expect(buybook[0].quantity).to.equal(Utils.parseUnits(((maxNbrOfFills + 1) * qty).toString(), baseDecimals));
            expect(buybook[0].total).to.equal(Utils.parseUnits(((maxNbrOfFills + 1) * qty).toString(), baseDecimals));

            // trader2 selling AVAX buying QT
            // deposit some native to portfolio for trader2
            await f.depositNative(portfolioMain, trader2, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader2.address, baseSymbol))[0]).to.equal(Utils.parseUnits(defaultNativeDeposit, baseDecimals));
            // Try to sell 1 more than maxNbrOfFills* qty
            const sellOrder = {
                traderaddress: trader2.address
                , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader2.address)
                , tradePairId
                , price: Utils.parseUnits(matchPrice, quoteDecimals)
                , quantity: Utils.parseUnits(((maxNbrOfFills + 1) * qty).toString(), baseDecimals)
                , side: 1  // SELL
                , type1: 1 // Limit
                , type2: 0   // GTC
                , stp: 0 // Cancel Taker
            }
            //console.log(sellOrder);
            const tx = await tradePairs.connect(trader2).addNewOrder(sellOrder);
            const res: any = await tx.wait();
            let fillCounter = 0;

            // const gasUsedInTx = Utils.formatUnits(res.cumulativeGasUsed.mul(res.effectiveGasPrice).div(10**9),18);
            // console.log("addOrderList Gas used", res.cumulativeGasUsed.toString(), res.effectiveGasPrice.toString());
            // console.log("Multiple fills gas usage", gasUsedInTx)

            for (const e of res.events) {
                if (e.event === "Executed"){
                    fillCounter++;
                }
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader2.address){
                    expect(e.event).to.be.equal('OrderStatusChanged');
                    expect(e.args.pair).to.be.equal(tradePairId);
                    expect(e.args.order.clientOrderId).to.be.equal(sellOrder.clientOrderId);
                    expect(e.args.traderaddress).to.be.equal(sellOrder.traderaddress);
                    expect(e.args.order.price).to.be.equal(sellOrder.price);
                    // console.log (e.args.price.toString(), Utils.formatUnits(e.args.price, quoteDecimals))
                    // console.log (e.args.quantity.toString(), Utils.formatUnits(e.args.quantity, baseDecimals))
                    // console.log (e.args.quantityfilled.toString(), Utils.formatUnits(e.args.quantityfilled, baseDecimals))
                    // console.log(e.args.totalamount.toString(), Utils.formatUnits(e.args.totalamount, quoteDecimals))
                    expect(e.args.order.totalAmount).to.be.equal(Utils.parseUnits((BigNumber.from(matchPrice).mul(maxNbrOfFills).mul(qty)).toString(), quoteDecimals));  // totalamount maxNbrOfFills * qty each
                    expect(e.args.order.quantity).to.be.equal(sellOrder.quantity);
                    expect(e.args.order.side).to.be.equal(sellOrder.side);              // side is SELL=1
                    expect(e.args.order.type1).to.be.equal(sellOrder.type1);             // type1 is LIMIT=1
                    expect(e.args.order.type2).to.be.equal(sellOrder.type2);         // type2 is GTC=0
                    expect(e.args.order.status).to.be.equal(4);            // status is CANCELED = 4
                    expect(e.args.order.quantityFilled).to.be.equal(Utils.parseUnits((maxNbrOfFills*qty).toString(), baseDecimals));

                    // console.log(e.args.totalfee.toString())
                    // console.log(Utils.formatUnits(e.args.totalfee, quoteDecimals))

                    const takerRate = ((await tradePairs.getTradePair(tradePairId))).takerRate;

                    // console.log(Number(matchPrice)* maxNbrOfFills * takerRate / 10000)
                    // console.log(Utils.parseUnits((Number(matchPrice)* maxNbrOfFills * takerRate / 10000).toString() ,quoteDecimals).toString())

                    expect(e.args.order.totalFee).to.be.equal(Utils.parseUnits((Number(matchPrice)* maxNbrOfFills * qty * takerRate / 10000).toString(),quoteDecimals));  // 0.2%

                }
            }

            expect(fillCounter).to.be.equal(maxNbrOfFills);

        });

        it("Should be able to add an order and then cancel it from the same trader account", async function () {

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // add a new order
            const tx = await tradePairs.connect(trader1).addNewOrder(buyOrder);

            const res1: any = await tx.wait();
            // get if of the order
            const id = res1.events[1].args.order.id;
            // cancel the order
            const tx2 = await tradePairs.connect(trader1).cancelOrder(id);
            const res2: any = await tx2.wait();
            expect(res2.events[1].args.order.status).to.be.equal(4);           // status is CANCELED = 4
            //Original order removed
            expect((await tradePairs.getOrder(id)).id).to.be.equal(ethers.constants.HashZero );
        });

        it("Should autofill kick-in when adding & canceling an order", async function () {
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            const AVAX = baseSymbol;
            const QT = quoteSymbol;
            await portfolio.setBridgeParam(QT, 0, Utils.parseUnits('1', quoteDecimals), true)
            await portfolio.setBridgeParam(AVAX, 0, Utils.toWei("0.1"), true)

            const params =await portfolio.bridgeParams(QT);
            expect(params.gasSwapRatio).to.equal(Utils.parseUnits('1', quoteDecimals));
            expect(params.fee).to.equal(0);
            expect(params.usedForGasSwap).to.equal(true);
            let gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address);
            const gasDeposited = await gasStation.gasAmount();
            const qtSwappedAmnt = (await portfolio.bridgeParams(QT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))
            // Test out addOrder autoFill using QT
            const WalBaltoReset = gasDeposited.div(2);
            await f.setHardhatBalance(trader1, WalBaltoReset);

            // add a buy order because it is AVAX/QT and when cancelled We make QT available to get gas for
            const tx1 = await tradePairs.connect(trader1).addNewOrder(buyOrder, {
                gasLimit: 10000000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei")
            });

            const res1: any = await tx1.wait();
            // get if of the order
            const id = res1.events[1].args.order.id;

            let gasUsedInTx = res1.cumulativeGasUsed.mul(res1.effectiveGasPrice);

            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset.add(gasDeposited))).to.lte(gasUsedInTx);
            expect((await portfolio.getBalance(trader1.address, QT)).total).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals).sub(qtSwappedAmnt));
            expect((await portfolio.getBalance(treasurySafe.address, QT)).total).to.equal(qtSwappedAmnt);
            expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited);
            gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address);

            // console.log ("gasStationBeforeBal", gasStationBeforeBal.toString(), "avaxswaped", qtSwappedAmnt.toString())
            // console.log ("wallet bal before", (await ethers.provider.getBalance(trader1.address)).toString())

            await f.setHardhatBalance(trader1, WalBaltoReset);
            //console.log ("wallet bal after",(await ethers.provider.getBalance(trader1.address)).toString())
            // cancel the order
            const tx2 = await tradePairs.connect(trader1).cancelOrder(id ,{gasLimit: 500000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res: any = await tx2.wait();
            expect(res.events[1].args.order.status).to.be.equal(4);           // status is CANCELED = 4
            gasUsedInTx = res.cumulativeGasUsed.mul(res.effectiveGasPrice);

            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset.add(gasDeposited))).to.lte(gasUsedInTx);

            // gasDeposited fully for QT
            // console.log ("wallet bal after2",(await ethers.provider.getBalance(trader1.address)).toString())
            // console.log ((await portfolio.getBalance(trader1.address, QT)).total.toString())
            // console.log ((await portfolio.getBalance(treasurySafe.address, QT)).total.toString())

            expect((await portfolio.getBalance(trader1.address, QT)).total).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals).sub(qtSwappedAmnt.mul(2)));
            expect((await portfolio.getBalance(treasurySafe.address, QT)).total).to.equal(qtSwappedAmnt.mul(2));
            expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited);

            //Reset trader1 balances for later tests
            const newBalance = ethers.utils.parseEther('1000000');
            await f.setHardhatBalance(trader1, newBalance);
        });

        it("Should autofill kick-in using ALOT when adding/canceling an order if ALOT is available", async function () {
            const deposit_amount = '100'

            await alot.mint(trader1.address, Utils.toWei(deposit_amount));
            await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT,  deposit_amount);

            expect((await portfolio.getBalance(trader1.address, ALOT))[0]).to.equal(Utils.parseUnits(deposit_amount, alot_decimals));
            expect((await portfolio.getBalance(trader1.address, ALOT))[1]).to.equal(Utils.parseUnits(deposit_amount, alot_decimals));
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)
            const AVAX = baseSymbol;
            const QT = quoteSymbol;
            await portfolio.setBridgeParam(QT, 0, Utils.parseUnits('1', quoteDecimals), true)
            await portfolio.setBridgeParam(AVAX, 0, Utils.toWei("0.1"), true)

            const params =await portfolio.bridgeParams(QT);
            expect(params.gasSwapRatio).to.equal(Utils.parseUnits('1', quoteDecimals));
            expect(params.fee).to.equal(0);
            expect(params.usedForGasSwap).to.equal(true);

            let gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
            const gasDeposited = await gasStation.gasAmount();
            const totalGasDeposited = gasDeposited.mul(alotWithdrawnToGasTankMultiplier);
            // console.log (await gasStation.gasAmount(), Utils.parseUnits('1', alot_decimals))
            const WalBaltoReset =gasDeposited.div(2);
            await f.setHardhatBalance(trader1, WalBaltoReset);
            // Test out addOrder autoFill using a sell order AVAX/QT
            const tx1 =  await tradePairs.connect(trader1).addNewOrder(sellOrder, {
                gasLimit: 10000000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei")
            });


            const res1: any = await tx1.wait();
            // get id of the order
            const id = res1.events[1].args.order.id;
            let gasUsedInTx = res1.cumulativeGasUsed.mul(res1.effectiveGasPrice);

            // Wallet balance increased
            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset.add(totalGasDeposited))).to.lte(gasUsedInTx);

            // gasDeposited fully for QT
            // console.log ("wallet bal after2",(await ethers.provider.getBalance(trader1.address)).toString())
            // console.log ((await portfolio.getBalance(trader1.address, QT)).total.toString())
            // console.log ((await portfolio.getBalance(treasurySafe.address, QT)).total.toString())

            // No change in QT
            expect((await portfolio.getBalance(trader1.address, QT)).total).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals));
            // No impact on treasury nor Gas Station
            expect((await portfolio.getBalance(treasurySafe.address, QT)).total).to.equal(0);
            expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);
            //Trader Portfolio ALOT Balance went down by 1 ALOT
            expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(Utils.parseUnits(deposit_amount, alot_decimals).sub(totalGasDeposited));
            //const qtSwappedAmnt = (await portfolio.bridgeParams(QT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

            // console.log ("gasStationBeforeBal", gasStationBeforeBal.toString(), "avaxswaped", qtSwappedAmnt.toString())
            // console.log ("wallet bal before", (await ethers.provider.getBalance(trader1.address)).toString())
            gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
            await f.setHardhatBalance(trader1, WalBaltoReset);
            //console.log ("wallet bal after",(await ethers.provider.getBalance(trader1.address)).toString())
            // cancel the order
            const tx2 = await tradePairs.connect(trader1).cancelOrder(id ,{gasLimit: 500000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res: any = await tx2.wait();
            expect(res.events[1].args.order.status).to.be.equal(4);           // status is CANCELED = 4
            gasUsedInTx = res.cumulativeGasUsed.mul(res.effectiveGasPrice);

            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset.add(totalGasDeposited))).to.lte(gasUsedInTx);

            // gasDeposited fully for QT
            // console.log ("wallet bal after2",(await ethers.provider.getBalance(trader1.address)).toString())
            // console.log ((await portfolio.getBalance(trader1.address, QT)).total.toString())
            // console.log ((await portfolio.getBalance(treasurySafe.address, QT)).total.toString())

            // No change in QT
            expect((await portfolio.getBalance(trader1.address, QT)).total).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals));
            // No impact on treasury nor Gas Station
            expect((await portfolio.getBalance(treasurySafe.address, QT)).total).to.equal(0);
            expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);
            //Trader Portfolio ALOT Balance went down by gasDeposited
            //We withdrew twice so far.
            expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(Utils.parseUnits(deposit_amount, alot_decimals).sub(totalGasDeposited.mul(2)));
            //Reset trader1 balances for later tests
            const newBalance = ethers.utils.parseEther('1000000');
            await f.setHardhatBalance(trader1, newBalance);
        });

        it("Should be able to add an multiple orders and cancel them from the same trader account", async function () {
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)



            // add the first new order
            const clientOrderid = buyOrder.clientOrderId
            buyOrder.quantity = Utils.parseUnits('5', baseDecimals);
            const tx1 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const res1: any = await tx1.wait();
            // get id of the first order
            const id1 = res1.events[1].args.order.id;


            // add the second new order
            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader1.address,2);
            buyOrder.clientOrderId = clientOrderid2;
            const tx2 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const res2: any = await tx2.wait();
            // get id of the second order
            const id2 = res2.events[1].args.order.id;

            // add the third new order
            const clientOrderid3 = await Utils.getClientOrderId(ethers.provider, trader1.address,3);
            buyOrder.clientOrderId = clientOrderid3;
            const tx3 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const res3: any = await tx3.wait();
            // get id of the second order
            const id3 = res3.events[1].args.order.id;

            // cancel the third order individually with cancelOrder before canceling the other two orders with cancelOrderList
            await tradePairs.connect(trader1).cancelOrder(id3);

            // fail paused
            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1).cancelOrderList([id1, id2])).to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause()

            // cancel all orders
            const tx4 = await tradePairs.connect(trader1).cancelOrderList([id1, id2, id3]);
            const res4: any = await tx4.wait();

            // verify cancellation of id1
            expect(res4.events[1].args.order.clientOrderId).to.be.equal(clientOrderid);
            expect(res4.events[1].args.order.status).to.be.equal(4);           // status is CANCELED = 4
            //Original order removed
            expect((await tradePairs.getOrder(id1)).id).to.be.equal(ethers.constants.HashZero );

            // verify cancellation of id2
            expect(res4.events[3].args.order.clientOrderId).to.be.equal(clientOrderid2);
            expect(res4.events[3].args.order.status).to.be.equal(4);           // status is CANCELED = 4\
             //Original order removed
            expect((await tradePairs.getOrder(id2)).id).to.be.equal(ethers.constants.HashZero );

            // Get a cancel reject on id3
            expect(res4.events[4].args.order.id).to.be.equal(id3);
            expect(res4.events[4].args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));
            expect(res4.events[4].args.order.status).to.be.equal(7);  // status is CANCEL_REJECT = 7
        });

        it("Should be able to cancelOrderListByClientIds", async function () {
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)



            // add the first new order
            const clientOrderid = buyOrder.clientOrderId
            buyOrder.quantity = Utils.parseUnits('5', baseDecimals);
            const tx1 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const res1: any = await tx1.wait();
            // get id of the first order
            const id1 = res1.events[1].args.order.id;


            // add the second new order
            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader1.address,2);
            buyOrder.clientOrderId = clientOrderid2;
            const tx2 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const res2: any = await tx2.wait();
            // get id of the second order
            const id2 = res2.events[1].args.order.id;

            // add the third new order
            const clientOrderid3 = await Utils.getClientOrderId(ethers.provider, trader1.address,3);
            buyOrder.clientOrderId = clientOrderid3;
            const tx3 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const res3: any = await tx3.wait();
            // get id of the second order
            const id3 = res3.events[1].args.order.id;

            // cancel the third order individually with cancelOrder before canceling the other two orders with cancelOrderList
            await tradePairs.connect(trader1).cancelOrderByClientId(clientOrderid3);

            // fail paused
            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1).cancelOrderListByClientIds([clientOrderid, clientOrderid2])).to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause()

            // cancel all orders
            const tx4 = await tradePairs.connect(trader1).cancelOrderListByClientIds([clientOrderid, clientOrderid2, clientOrderid3]);
            const res4: any = await tx4.wait();


            for (const e of res4.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address) {
                    if (e.args.order.clientOrderId == clientOrderid) {
                        expect(e.args.order.status).to.be.equal(4);
                        //Original order removed
                        expect((await tradePairs.getOrder(id1)).id).to.be.equal(ethers.constants.HashZero );// status is CANCELED = 4
                    }

                   if (e.args.order.clientOrderId == clientOrderid2) {
                        expect(e.args.order.status).to.be.equal(4);
                        //Original order removed
                        expect((await tradePairs.getOrder(id2)).id).to.be.equal(ethers.constants.HashZero );// status is CANCELED = 4
                    }
                    if (e.args.order.clientOrderId == clientOrderid3) {
                        expect(e.args.args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));
                        expect(e.args.order.status).to.be.equal(7);  // status is CANCEL_REJECT = 7
                    }
                }
            }

        });


    it("Should not pay any fee when admin accounts", async function () {

            const minTradeAmount = 1;
            const maxTradeAmount = 1500;
            const mode = 0;  // auction off

            const pairSettings = {
                minTradeAmount: minTradeAmount,
                maxTradeAmount: maxTradeAmount,
                mode: mode
            };

            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            await f.depositNative(portfolioMain, trader2, '3000');

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            await quoteToken.connect(trader2).approve(portfolioMain.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolioMain.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals), 0);

            await f.addTradePair(exchange, pair, pairSettings)

            await expect(portfolioSubHelper.addAdminAccountForRates(trader1.address, "trader1"))
                .to.emit(portfolioSubHelper, "RateChanged")
                .withArgs("ADMIN_RATES", "ADD", trader1.address, ethers.constants.HashZero,0,0);
            expect(await portfolioSubHelper.adminAccountsForRates(trader1.address)).to.be.true;
            expect(await portfolioSubHelper.isAdminAccountForRates(trader1.address)).to.be.true;

            await expect(portfolioSubHelper.addAdminAccountForRates(trader2.address, "trader2"))
                .to.emit(portfolioSubHelper, "RateChanged")
                .withArgs("ADMIN_RATES", "ADD", trader2.address, ethers.constants.HashZero,0,0);
            expect(await portfolioSubHelper.adminAccountsForRates(trader2.address)).to.be.true;
            expect(await portfolioSubHelper.isAdminAccountForRates(trader2.address)).to.be.true;

        // maker is a sell order
        sellOrder.clientOrderId = clientOrderid;
            sellOrder.type1 = 1; // limit
            sellOrder.price = Utils.parseUnits('100', quoteDecimals);
            sellOrder.quantity = Utils.parseUnits('15', baseDecimals);
            let tx = await tradePairs.connect(trader1).addNewOrder(sellOrder);
            await tx.wait();

            //taker is a buy order
            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader2.address);
            buyOrder.clientOrderId = clientOrderid2;
            buyOrder.price = Utils.parseUnits('100', quoteDecimals);
            buyOrder.traderaddress = trader2.address;

            tx = await tradePairs.connect(trader2).addNewOrder(buyOrder);

            const res: any = await tx.wait();

            for (const e of res.events) {
                if (e.event === "OrderStatusChanged" ){
                    if (e.args.traderaddress === trader1.address) {

                        expect(e.args.pair).to.be.equal(tradePairId);
                        expect(e.args.order.clientOrderId).to.be.equal(clientOrderid);
                        expect(e.args.traderaddress).to.be.equal(trader1.address);
                        expect(e.args.order.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
                        expect(e.args.order.totalAmount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
                        expect(e.args.order.quantity).to.be.equal(Utils.parseUnits('15', baseDecimals));
                        expect(e.args.order.side).to.be.equal(1);              // side is SELL=1
                        expect(e.args.order.type1).to.be.equal(1);             // type1 is LIMIT=1
                        expect(e.args.order.type2).to.be.equal(type2);            // type2 is GTC=0 ( FOK-is ignored!!!)
                        expect(e.args.order.status).to.be.equal(2);            // status is PARTIAL = 2
                        expect(e.args.order.quantityFilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
                        expect(e.args.order.totalFee).to.be.equal(0);

                        // getOrderByClientOrderId should return the same orders
                        const orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderid);
                        expect(e.args.order.id).to.be.equal(orderbyCl1.id);

                    } else if  (e.args.traderaddress === trader2.address) {
                        expect(e.args.pair).to.be.equal(tradePairId);
                        expect(e.args.order.clientOrderId).to.be.equal(clientOrderid2);
                        expect(e.args.traderaddress).to.be.equal(trader2.address);
                        expect(e.args.order.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
                        expect(e.args.order.totalAmount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
                        expect(e.args.order.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
                        expect(e.args.order.side).to.be.equal(0);              // side is BUY=0
                        expect(e.args.order.type1).to.be.equal(1);             // type1 is LIMIT=1
                        expect(e.args.order.type2).to.be.equal(0);            // type2 is GTC=0
                        expect(e.args.order.status).to.be.equal(3);            // status is FILLED = 3
                        expect(e.args.order.quantityFilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
                        expect(e.args.order.totalFee).to.be.equal(0);

                    }

                }

            }


            // Order filled(Closed) and removed from state, expect ZERO_BYTES
            const orderbyCl2= await tradePairs.getOrderByClientOrderId(trader2.address, clientOrderid2);
            expect(orderbyCl2.id).to.be.equal(ethers.constants.HashZero );
        });

        it("Should be able to add market buy order from the trader accounts", async function () {
            const minTradeAmount = 1;
            const maxTradeAmount = 1500;
            const mode = 0;  // auction off

            const pairSettings = {
                minTradeAmount: minTradeAmount,
                maxTradeAmount: maxTradeAmount,
                mode: mode
            };

            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            await f.depositNative(portfolioMain, trader2, '3000');

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            await quoteToken.connect(trader2).approve(portfolioMain.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolioMain.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals), 0);

            await f.addTradePair(exchange, pair, pairSettings)

            await tradePairs.connect(owner).addOrderType(tradePairId, 0);
            //Empty order book. Attempt a BUY Market order
            buyOrder.type1 = 0; // market
            buyOrder.clientOrderId = clientOrderid;
            buyOrder.price = 0;
            await addOrderAndVerify(trader1, buyOrder, 1, Utils.fromUtf8("T-LTMT-01"));  // status is REJECTED = 1
            //Empty order book. Attempt  a SELL Market order
            sellOrder.type1 = 0; // market
            sellOrder.clientOrderId = clientOrderid;
            sellOrder.price = 0;
            await addOrderAndVerify(trader1, sellOrder, 1, Utils.fromUtf8("T-LTMT-01"));  // status is REJECTED = 1

            sellOrder.type1 = 1; // limit
            sellOrder.price = Utils.parseUnits('100', quoteDecimals);
            sellOrder.quantity = Utils.parseUnits('15', baseDecimals);
            let tx = await tradePairs.connect(trader1).addNewOrder(sellOrder);
            await tx.wait();

            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader2.address);
            buyOrder.clientOrderId = clientOrderid2;
            buyOrder.price = Utils.parseUnits('100', quoteDecimals);
            buyOrder.traderaddress = trader2.address;

            tx = await tradePairs.connect(trader2).addNewOrder(buyOrder);

            const res: any = await tx.wait();

            for (const e of res.events) {
                if (e.event === "OrderStatusChanged" ){
                    if (e.args.traderaddress === trader1.address) {

                        expect(e.args.pair).to.be.equal(tradePairId);
                        expect(e.args.order.clientOrderId).to.be.equal(clientOrderid);
                        expect(e.args.traderaddress).to.be.equal(trader1.address);
                        expect(e.args.order.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
                        expect(e.args.order.totalAmount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
                        expect(e.args.order.quantity).to.be.equal(Utils.parseUnits('15', baseDecimals));
                        expect(e.args.order.side).to.be.equal(1);              // side is SELL=1
                        expect(e.args.order.type1).to.be.equal(1);             // type1 is LIMIT=1
                        expect(e.args.order.type2).to.be.equal(type2);            // type2 is GTC=0 ( FOK-is ignored!!!)
                        expect(e.args.order.status).to.be.equal(2);            // status is PARTIAL = 2
                        expect(e.args.order.quantityFilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
                        expect(e.args.order.totalFee).to.be.equal(Utils.parseUnits('2', quoteDecimals));  // 0.2% of 1000 = 2 QT

                        // getOrderByClientOrderId should return the same orders
                        const orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderid);
                        expect(e.args.order.id).to.be.equal(orderbyCl1.id);

                    }else if  (e.args.traderaddress === trader2.address) {
                        expect(e.args.pair).to.be.equal(tradePairId);
                        expect(e.args.order.clientOrderId).to.be.equal(clientOrderid2);
                        expect(e.args.traderaddress).to.be.equal(trader2.address);
                        expect(e.args.order.price).to.be.equal(0);  // MARKET PRICE = 0
                        expect(e.args.order.totalAmount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
                        expect(e.args.order.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
                        expect(e.args.order.side).to.be.equal(0);              // side is BUY=0
                        expect(e.args.order.type1).to.be.equal(0);             // type1 is MARKET=0
                        expect(e.args.order.type2).to.be.equal(0);            // type2 is GTC=0
                        expect(e.args.order.status).to.be.equal(3);            // status is FILLED = 3
                        expect(e.args.order.quantityFilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
                        expect(e.args.order.totalFee).to.be.equal(Utils.parseUnits('0.03', baseDecimals));  // 0.3% of 10 = 0.03 AVAX

                    }

                }

            }


            // Order filled(Closed) and removed from state, expect ZERO_BYTES
            const orderbyCl2= await tradePairs.getOrderByClientOrderId(trader2.address, clientOrderid2);
            expect(orderbyCl2.id).to.be.equal(ethers.constants.HashZero );
        });

        it("Should revert when price has more decimals than quote display decimals", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)
            sellOrder.price = Utils.parseUnits('100.1234', quoteDecimals);
            await addOrderAndVerify(trader1, sellOrder, 1, Utils.fromUtf8("T-TMDP-01"));  // status is REJECTED = 1

        });

        it("Should revert when quantity has more decimals then base display decimals", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            sellOrder.quantity = Utils.parseUnits('10.1234', baseDecimals);
            await addOrderAndVerify(trader1, sellOrder, 1, Utils.fromUtf8("T-TMDQ-01"));  // status is REJECTED = 1

        });

        it("Should set auction mode from the auction owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(exchange, pair, defaultPairSettings)

            const auctionMode = 4;
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setAuctionMode(tradePairId, auctionMode)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setAuctionMode(tradePairId, auctionMode);

            const tradePairData = await tradePairs.getTradePair(tradePairId);
            expect(tradePairData.auctionMode).to.be.equal(auctionMode);

        });

        it("Should pause and unpause TradePairs from the owner account", async function () {
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).pause()).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).pause();
            expect(await tradePairs.paused()).to.be.true;
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).unpause()).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).unpause();
            expect(await tradePairs.paused()).to.be.false;
        });

        it("Should switch TradePairs between postonly and normal trading from the owner account", async function () {
            const minTradeAmount = 1;
            const maxTradeAmount = 1000;
            const mode = 0;  // auction off

            const pairSettings = {
                minTradeAmount: minTradeAmount,
                maxTradeAmount: maxTradeAmount,
                mode: mode,
            }

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            expect(portfolioMain.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, quoteDecimals, quoteDecimals, '0', ethers.utils.parseUnits('0.5',quoteDecimals))).to.be.revertedWith("P-TSDM-01");
            expect(portfolio.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, srcChainId, quoteDecimals, quoteDecimals, mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals),Utils.fromUtf8(quoteTokenStr))).to.be.revertedWith("P-TSDM-01");

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, pairSettings)

            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).postOnly(pair.tradePairId, true)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).postOnly(pair.tradePairId, true);
            const tp1 = await tradePairs.getTradePair(pair.tradePairId);
            expect(tp1.postOnly).to.be.true;
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).postOnly(pair.tradePairId, false)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).postOnly(pair.tradePairId, false);
            const tp2 = await tradePairs.getTradePair(pair.tradePairId);
            expect(tp2.postOnly).to.be.false;
        });

        it("Should be able to add post only sell order from the trader accounts", async function () {
            const minTradeAmount = 1;
            const maxTradeAmount = 1500;
            const mode = 0;  // auction off

            const pairSettings = {
                minTradeAmount: minTradeAmount,
                maxTradeAmount: maxTradeAmount,
                mode: mode
            };
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            await f.depositNative(portfolioMain, trader2, '3000');
           // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            await quoteToken.connect(trader2).approve(portfolioMain.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolioMain.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals), 0);

            await f.addTradePair(exchange, pair, pairSettings)

            await tradePairs.connect(owner).addOrderType(tradePairId, 0);

            await tradePairs.connect(owner).postOnly(tradePairId, true);

            // fail if order type is not PO
            await addOrderAndVerify(trader1, sellOrder, 1, Utils.fromUtf8("T-POOA-01"));  // status is REJECTED = 1

            // succeed if order is a PO type
            sellOrder.type2=3; // PO
            await addOrderAndVerify(trader1, sellOrder, 0);

        });

        it("Should pause a trade pair from owner account", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).pauseTradePair(tradePairId, true)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).pauseTradePair(tradePairId, true);
            // fail addOrder
            await expect(tradePairs.connect(trader1).addNewOrder(buyOrder)).to.be.revertedWith("T-PPAU-01");


            // fail paused
            await tradePairs.connect(owner).pause();
            await expect(tradePairs.connect(trader1).addNewOrder(buyOrder)).to.be.revertedWith("Pausable: paused");

            await tradePairs.connect(owner).unpause();
            // unpause to succeed
            await tradePairs.connect(owner).pauseTradePair(tradePairId, false);
            // succeed addOrder
            await addOrderAndVerify(trader1, buyOrder, 0);  // status is NEW = 0
        });

        it("Should pause addOrder for a trade pair from owner account", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).pauseAddOrder(tradePairId, true)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).pauseAddOrder(tradePairId, true);
            await expect(tradePairs.connect(trader1).addNewOrder(buyOrder)).to.be.revertedWith("T-AOPA-01");

            await tradePairs.connect(owner).pauseAddOrder(tradePairId, false);

            await addOrderAndVerify(trader1, buyOrder, 0);  // status is NEW = 0

        });

        it("Should use setAuctionPrice correctly", async function () {
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // fail for non-admin account
            await expect(tradePairs.connect(trader1).setAuctionPrice(tradePairId, Utils.parseUnits('4.1', quoteDecimals)))
                         .to.be.revertedWith("AccessControl:");

            // fail because of too many decimals
            await expect(tradePairs.connect(owner).setAuctionPrice(tradePairId, Utils.parseUnits('4.1234', quoteDecimals)))
                         .to.be.revertedWith("T-AUCT-02");

            // succeed for owner
            await tradePairs.connect(owner).setAuctionPrice(tradePairId, Utils.parseUnits('4.1', quoteDecimals))
            expect((await tradePairs.getTradePair(tradePairId)).auctionPrice).to.equal(Utils.parseUnits('4.1', quoteDecimals))
        });

        it("Should be able to check if trade pair exists", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(exchange, pair, defaultPairSettings)

            expect(await tradePairs.tradePairExists(tradePairId)).to.be.true;
            expect(await tradePairs.tradePairExists(Utils.fromUtf8("DOES NOT EXIST"))).to.be.false;
        });

        it("Should not be able to add same trade pair", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // should emit NewTradePair
            await expect(exchange.connect(owner).addTradePair(tradePairId, baseSymbol,  baseDisplayDecimals,
                quoteSymbol,  quoteDisplayDecimals,
                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                        .to.emit(tradePairs, "NewTradePair");

            // should not emit NewTradePair
            await expect(exchange.connect(owner).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                quoteSymbol, quoteDisplayDecimals,
                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                        .to.not.emit(tradePairs, "NewTradePair");
        });

        it("Should be able to cancel orders", async function () {
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // add two buy orders

            const tx1 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.order.id;

            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address);
            let tx2= await tradePairs.connect(trader1).addNewOrder(buyOrder);
            let res2: any = await tx2.wait();
            const id2 = res2.events[1].args.order.id;

            // cannot cancel tradePairs is paused
            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1).cancelOrder(id1)).to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause()

            // 0address order will cancel reject from ownership check
            tx2 = await tradePairs.connect(trader1).cancelOrder(ethers.constants.HashZero);
            res2 = await tx2.wait();
            for (const e of res2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address) {
                        expect(e.args.order.id).to.be.equal(ethers.constants.HashZero)
                        expect(e.args.order.status).to.be.equal(7); // status is CANCEL_REJECT = 7
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));
                }
            }

            tx2 = await tradePairs.connect(trader1).cancelOrderByClientId(ethers.constants.HashZero);
            res2 = await tx2.wait();
            for (const e of res2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address) {
                        expect(e.args.order.id).to.be.equal(ethers.constants.HashZero)
                        expect(e.args.order.status).to.be.equal(7); // status is CANCEL_REJECT = 7
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));
                }
            }

            // Ignore empty orders
            await expect(tradePairs.connect(trader1).cancelOrderList([ethers.constants.HashZero, ethers.constants.HashZero]));
            // cannot cancel all for somebody else-- Get a cancel reject
            tx2 = await tradePairs.connect(owner).cancelOrderList([id1, id2])  //).to.be.revertedWith("T-OOCC-02");
            res2 = await tx2.wait();

            let i = 0;
            for (const e of res2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === owner.address) {
                    const orderId = i == 0 ? id1 : id2;
                    expect(e.args.order.id).to.be.equal(orderId)
                    expect(e.args.order.status).to.be.equal(7); // status is CANCEL_REJECT = 7
                    expect(e.args.code).to.be.equal(Utils.fromUtf8("T-OOCC-02"));
                    i++;

                }
            }

            await expect(tradePairs.connect(trader1).cancelOrderListByClientIds([ethers.constants.HashZero, ethers.constants.HashZero]));



        });

        it("Should be able to use cancelOrder(), cancelOrderList() and cancelReplaceOrder() correctly", async function () {
            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // add a buy order
            buyOrder.price = Utils.parseUnits('1', quoteDecimals);
            buyOrder.quantity = Utils.parseUnits('100', baseDecimals);
            const tx1 = await tradePairs.connect(trader1).addNewOrder(buyOrder);

            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.order.id;
            // set auction mode to OPEN
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 2);  // auction is OPEN

            // cannot cancel and replace tradePairs is paused
            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1)
                .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause()
            // cannot cancel and replace with empty order id
            await expect(tradePairs.connect(trader1)
                .cancelReplaceOrder(ethers.constants.HashZero , clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OAEX-01");
            // cannot cancel and replace with the same clientorderid(Technically can be not recommended)
            // await expect(tradePairs.connect(trader1)
            //     .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-CLOI-01");

            // you cannot cancel and replace for somebody else
            await expect(tradePairs.connect(owner)
                .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OOCC-01");
            // set auction mode to OFF
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 0);  // auction is OFF


            // trigger available funds not enough
            sellOrder.traderaddress = trader2.address;
            sellOrder.price = Utils.parseUnits('1', quoteDecimals);
            sellOrder.quantity = Utils.parseUnits('100', baseDecimals);
            // await expect(tradePairs.connect(trader2).addNewOrder(sellOrder))
            //     .to.be.revertedWith("P-AFNE-02");

            // mint some tokens for trader1
            await quoteToken.mint(trader2.address, Utils.parseUnits('20000', quoteDecimals));

            // deposit some native to portfolio for trader2
            await f.depositNative(portfolioMain, trader2, '3000');
            expect((await portfolio.getBalance(trader2.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader2.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader2
            await quoteToken.connect(trader2).approve(portfolioMain.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolioMain.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals), 0);
            expect((await portfolio.getBalance(trader2.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader2.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            sellOrder.quantity = Utils.parseUnits('150', baseDecimals);
            sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader2.address);
            sellOrder.type2 = 2; // IOC
            let tx2 = await tradePairs.connect(trader2).addNewOrder(sellOrder);

            let res2: any = await tx2.wait();
            expect(res2.events[6].args.order.clientOrderId).to.be.equal(sellOrder.clientOrderId); // make sure that this is our order
            expect(res2.events[6].args.order.quantityFilled).to.be.equal(buyOrder.quantity );  // 100 filled, 50 remaining but status canceled
            expect(res2.events[6].args.order.status).to.be.equal(4);  // status is CANCELED = 4

            // fail to cancel a matched order via cancelOrder()

            tx2 = await tradePairs.connect(trader1).cancelOrder(id1)
            res2 = await tx2.wait();
            for (const e of res2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address) {
                        expect(e.args.order.id).to.be.equal(id1)
                        expect(e.args.order.status).to.be.equal(7); // status is CANCEL_REJECT = 7
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));

                }
            }


            // get a cancel reject for a matched order via cancelOrderList()
            tx2 = await tradePairs.connect(trader1).cancelOrderList([id1])
            res2 = await tx2.wait();
            for (const e of res2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address) {
                        expect(e.args.order.id).to.be.equal(id1)
                        expect(e.args.order.status).to.be.equal(7); // status is CANCEL_REJECT = 7
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));

                }
            }

            // fail to cancel a matched order via cancelReplaceOrder()
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 2);  // auction is OPEN
            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            await expect(tradePairs.connect(trader1)
                 .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OAEX-01");


        });

        it("Should be able to use cancelReplaceOrder() even when Available==0", async function () {

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));
            // deposit only 100 native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, '100')
            let prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('100', baseDecimals));

            // deposit only 100 tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, '100')
            let prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);

            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('100', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('100', quoteDecimals));

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // add a buy order using the entire 100 token @price 1
            buyOrder.price = Utils.parseUnits('1', quoteDecimals);
            buyOrder.quantity = Utils.parseUnits('100', baseDecimals);
            let tx1 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            let res1: any = await tx1.wait();
            let id1 = res1.events[1].args.order.id;
            // console.log(id1);

            prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);
            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('100', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('0', quoteDecimals));

            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);

            // replace buy order at the same price but increase quantity to 110
            const tx = await tradePairs.connect(trader1)
                 .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('110', baseDecimals))
            const res: any  = await tx.wait();

            for (const e of res.events) {

                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address) {
                    //replace order rejected
                    if (e.args.order.clientOrderId == clientOrderid) {
                        expect(e.args.order.status).to.be.equal(1);           // status is REJECTED = 1
                        expect(e.args.order.quantityFilled).to.be.equal(0);   // not executed, yet, so quantityfilled is 0
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("P-AFNE-01"));         // error code
                    }
                    // original order canceled
                    if (e.args.order.id == id1) {
                      expect(e.args.order.status).to.be.equal(4);           // status is CANCELED = 4
                        expect(e.args.order.quantityFilled).to.be.equal(0);   // not executed, yet, so quantityfilled is 0
                    }
                }
            }

            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address,2 );
            tx1 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            res1 = await tx1.wait();
            id1 = res1.events[1].args.order.id;

            prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);
            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('100', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('0', quoteDecimals));

            // replace buy order at the same price and same quantity
            const tx2 = await tradePairs.connect(trader1).cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals));
            res1= await tx2.wait();
            const id2 = (await tradePairs.connect(trader1).getOrderByClientOrderId(trader1.address, clientOrderid)).id ;


            for (const e of res1.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address) {
                    //replace order rejected
                    if (e.args.order.id == id2) {
                        // console.log(e.args.order)
                        expect(e.args.order.status).to.be.equal(0);           // status is REJECTED = 1
                        expect(e.args.order.quantityFilled).to.be.equal(0);   // not executed, yet, so quantityfilled is 0
                       // expect(e.args.code).to.be.equal(Utils.fromUtf8("P-AFNE-01"));         // error code
                    }
                    // original order canceled
                    if (e.args.order.id == id1) {
                        expect(e.args.order.status).to.be.equal(4);           // status is CANCELED = 4
                        expect(e.args.order.quantityFilled).to.be.equal(0);   // not executed, yet, so quantityfilled is 0
                    }
                }
            }

            prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);
            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('100', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('0', quoteDecimals));

            //cancel the outstanding order
            await tradePairs.connect(trader1).cancelOrderByClientId(clientOrderid);

            sellOrder.price = Utils.parseUnits('1', quoteDecimals);
            sellOrder.quantity = Utils.parseUnits('100', baseDecimals);
            const tx3 = await tradePairs.connect(trader1).addNewOrder(sellOrder);
            const res3: any = await tx3.wait();
            const id3 = res3.events[1].args.order.id;
            // console.log(id3);
            prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('0', baseDecimals));

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            // replace sell order at the same price but decrease quantity to 90
            const tx4 = await tradePairs.connect(trader1).cancelReplaceOrder(id3, clientOrderid, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('90', baseDecimals));
            await tx4.wait();

            //Original order removed
            expect((await tradePairs.getOrder(id3)).id).to.be.equal(ethers.constants.HashZero );

            prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('10', baseDecimals));
        });

        it("Should cancel outstanding maker from the same trader when cancelReplaceOrder() (STP=CANCELMAKER)", async function () {

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));
            // deposit only 100 native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, '100')
            const prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('100', baseDecimals));

            // deposit only 100 tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, '1000')
            let prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);

            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('1000', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('1000', quoteDecimals));
            await f.depositNative(portfolioMain, trader2, '500')

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // add a buy order using the entire 100 token @price 1
            buyOrder.price = Utils.parseUnits('1', quoteDecimals);
            buyOrder.quantity = Utils.parseUnits('100', baseDecimals);
            const id1 = await addOrderAndVerify(trader1, buyOrder, 0);  // status is NEW = 0

            prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);
            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('1000', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('900', quoteDecimals));


            // add a sell order for trader1
            sellOrder.price = Utils.parseUnits('2', quoteDecimals);
            sellOrder.quantity = Utils.parseUnits('50', baseDecimals);

            await addOrderAndVerify(trader1, sellOrder, 0);  // status is NEW = 0
            // add a sell order for trader2
            sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader2.address, 3);
            sellOrder.traderaddress = trader2.address;
            await addOrderAndVerify(trader2, sellOrder, 0);  // status is NEW = 0


            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);

            // replace buy order at the same price but decrease quantity to 90
            const tx2 = await tradePairs.connect(trader1).cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('100', baseDecimals));
            const res: any  = await tx2.wait();
            const id2 = (await tradePairs.connect(trader1).getOrderByClientOrderId(trader1.address, clientOrderid)).id ;


            for (const e of res.events) {
                if (e.event === "OrderStatusChanged") {
                    if (e.args.traderaddress === trader1.address) {
                        if (e.args.order.id == id1) { // Buy maker order that should have been canceled
                            expect(e.args.order.status).to.be.equal(4);           // status is NEW = 4
                            expect(e.args.order.quantityFilled).to.be.equal(0);
                        }

                        if (e.args.order.id == id2) { // Sell taker order that should be partially filled with
                            expect(e.args.order.status).to.be.equal(2);           // status is PARTIAL = 2
                            expect(e.args.order.quantityFilled).to.be.equal(sellOrder.quantity); // only 50 should be filled
                        }
                    }

                    if (e.args.traderaddress === trader2.address) {
                        const id3 = (await tradePairs.connect(trader2).getOrderByClientOrderId(trader2.address, sellOrder.clientOrderId)).id;
                        if (e.args.order.id == id3) { // Sell maker order from trader2 that is fully filled
                            expect(e.args.order.status).to.be.equal(3);           // status is FILLED = 3
                            expect(e.args.order.quantityFilled).to.be.equal(sellOrder.quantity);
                        }
                    }
                }
            }

        });

        it("Should STP=CANCELTAKER, CANCELMAKER, CANCELBOTH during addNewOrder()", async function () {

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));
            // deposit only 100 native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, '100')
            const prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('100', baseDecimals));

            // deposit only 100 tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, '500')
            let prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);

            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('500', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('500', quoteDecimals));

            //trader2
            await f.depositNative(portfolioMain, trader2, '200')
            await quoteToken.mint(trader2.address, Utils.parseUnits('20000', quoteDecimals));
            // deposit only 500 tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader2, quoteToken, quoteDecimals, quoteSymbol, '500')


            await f.addTradePair(exchange, pair, defaultPairSettings)

            // add a buy order using the entire 100 token @price 1
            const firstBuyOrder = {
                traderaddress: trader1.address
                , clientOrderId : await Utils.getClientOrderId(ethers.provider, trader1.address)
                , tradePairId
                , price: Utils.parseUnits('1', quoteDecimals)
                , quantity: Utils.parseUnits('30', baseDecimals)
                , side :  0   // Buy
                , type1 : 1   // market orders not enabled
                , type2: 0   // GTC
                , stp : 0   // CancelTaker
            }

            const id1 = await addOrderAndVerify(trader1, firstBuyOrder, 0);  // status is NEW=0

            prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);
            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('500', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('470', quoteDecimals));

            // add a buy order for trader2
            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader2.address, 2);
            buyOrder.traderaddress = trader2.address;
            buyOrder.quantity = Utils.parseUnits('50', baseDecimals);
            buyOrder.price= Utils.parseUnits('1', quoteDecimals)
            await addOrderAndVerify(trader2, buyOrder, 0);  // status is NEW = 0

            // add a sell order for trader1
            sellOrder.price = Utils.parseUnits('1', quoteDecimals);
            sellOrder.quantity = Utils.parseUnits('50', baseDecimals);
            sellOrder.stp = 0 // CancelTaker
            // Sell order is canceled.
            await addOrderAndVerify(trader1, sellOrder, 4, Utils.fromUtf8("T-STPR-01"));  // sellOrder(taker) status is CANCELED = 4

            // buyOrder(maker) still intact
            let order1 = await tradePairs.getOrder(id1);
            expect(order1.id).to.be.equal(id1);
            expect(order1.status).to.be.equal(0);        // status is NEW = 0
            expect(order1.quantityFilled).to.be.equal(0);


            // add a new sell order for trader1 with CancelMaker this time
            sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 3);
            sellOrder.stp = 1// CancelMaker

            const id2 = await addOrderAndVerifyWithCancel(trader1, sellOrder, 3, firstBuyOrder, ethers.constants.HashZero
            , buyOrder.quantity, buyOrder.quantity, BigNumber.from(0));  // sellOrder(taker) status is NEW=0 , buyOrder(maker) canceled
            // orders filled. Nothing left in the orderbook

            await addOrderAndVerify(trader1, sellOrder, 0);
            // buy order has been removed
            order1 = await tradePairs.getOrder(id1);
            expect(order1.id).to.be.equal(ethers.constants.HashZero);

            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 4);
            buyOrder.traderaddress = trader1.address;
            buyOrder.stp = 2 // CancelBoth
            await addOrderAndVerifyWithCancel(trader1, buyOrder, 4, sellOrder, Utils.fromUtf8("T-STPR-01"));  // status is CANCELED = 4, sellOrder(maker) is CANCELED

            // sell order has been removed
            order1 = await tradePairs.getOrder(id2);
            expect(order1.id).to.be.equal(ethers.constants.HashZero);
        });

        it("Should STP cancel the 1st order when 2 opposing orders in the same block during addListOrder()", async function () {
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));
            // deposit only 100 native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, '100')
            const prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('100', baseDecimals));

            // deposit only 100 tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, '500')
            const prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);

            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('500', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('500', quoteDecimals));
            await f.addTradePair(exchange, pair, defaultPairSettings)

            const orders =[]
            //buy PO, followed by sell Limit at the same price
            const buyOrder = {
                traderaddress: trader1.address
                , clientOrderId: await Utils.getClientOrderId(ethers.provider, trader1.address, 2)
                , tradePairId
                , price: Utils.parseUnits((100).toString(), quoteDecimals)
                , quantity: Utils.parseUnits('1', baseDecimals)
                , side: 0  // Buy
                , type1: 1 //Limit
                , type2: 3 //PO
                , stp : 0 // Cancel Taker - will be entered to ob first hence will be ignored
            }
            const sellOrder = Object.assign({}, buyOrder);
            sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address, 3);
            sellOrder.side = 1;
            sellOrder.type2 = 0; //GTC
            sellOrder.stp = 2; // This will cancel both orders

            orders.push(buyOrder);
            orders.push(sellOrder);

            const tx = await tradePairs.connect(trader1).addOrderList(orders);
            const res: any = await tx.wait();
            let i = 0;
            for (const e of res.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){
                    //console.log(e.args.order)
                    expect(e.args.pair).to.be.equal(tradePairId);
                    //expect(e.args.order.clientOrderId).to.be.equal(sellOrder.clientOrderId);
                    expect(e.args.traderaddress).to.be.equal(sellOrder.traderaddress);
                    expect(e.args.order.price).to.be.equal(sellOrder.price);
                    expect(e.args.order.quantity).to.be.equal(sellOrder.quantity);
                    expect(e.args.order.type1).to.be.equal(sellOrder.type1);             // type1 is LIMIT=1
                    // 1st event raised is the buy order commit to the blockchain
                    // 2nd is the cancel of the buy order
                    // 3rd is the cancel of the sell
                    const expectedStatus = i == 0 ? 0 : 4;     // status is CANCELED = 4
                    const expectedSide = i == 2 ? 1 : 0;
                    const expectedType2 = i == 2 ? 0 : 3;
                    expect(e.args.order.side).to.be.equal(expectedSide);
                    expect(e.args.order.status).to.be.equal(expectedStatus);
                    expect(e.args.order.type2).to.be.equal(expectedType2);

                    expect(e.args.order.quantityFilled).to.be.equal(0);
                    expect(e.args.order.totalAmount).to.be.equal(0);
                    expect(e.args.order.totalFee).to.be.equal(0);
                    i++;
                }
            }
        });

        it("Should be able to use unsolicitedCancel() correctly", async function () {

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)

            await f.addTradePair(exchange, pair, defaultPairSettings)

            // add two buy orders
            buyOrder.price = Utils.parseUnits('1', quoteDecimals);
            buyOrder.quantity = Utils.parseUnits('100', baseDecimals);
            const tx1 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const clientOrderid = buyOrder.clientOrderId;
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.order.id;
            const blockNum1 = res1.blockNumber;


            buyOrder.price = Utils.parseUnits('2', quoteDecimals);
            buyOrder.quantity = Utils.parseUnits('200', baseDecimals);
            buyOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1.address);

            const tx2 = await tradePairs.connect(trader1).addNewOrder(buyOrder);
            const res2: any = await tx2.wait();
            const id2 = res2.events[1].args.order.id;
            const blockNum2 = res2.blockNumber;

            let order1 = await tradePairs.getOrder(id1);
            let order2 = await tradePairs.getOrder(id2);
            expect(order1.id).to.be.equal(id1);
            expect(order2.id).to.be.equal(id2);
            expect(order1.updateBlock).to.be.equal(blockNum1);
            expect(order2.updateBlock).to.be.equal(blockNum2);
            expect(order1.createBlock).to.be.equal(blockNum1);
            expect(order2.createBlock).to.be.equal(blockNum2);


            const orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderid);
            const orderbyCl2= await tradePairs.getOrderByClientOrderId(trader1.address, buyOrder.clientOrderId);

            expect(order1.id).to.be.equal(orderbyCl1.id);
            expect(order2.id).to.be.equal(orderbyCl2.id);
            expect(order1.status).to.be.equal(0);
            expect(order2.status).to.be.equal(0);

            const isBuyBook = true;
            // fail from non-owner account
            await expect(tradePairs.connect(trader1).unsolicitedCancel(tradePairId, isBuyBook, 10)).to.be.revertedWith("AccessControl:");

            await expect(tradePairs.unsolicitedCancel(tradePairId, isBuyBook, 10)).to.be.revertedWith("T-PPAU-04");
            // should succeed even when tradePairs is paused
            await tradePairs.pauseTradePair(tradePairId, true);

            const tx = await tradePairs.connect(owner).unsolicitedCancel(tradePairId, isBuyBook, 10);
            const res: any = await tx.wait();

            for (const e of res.events) {
                if (e.event ==='OrderStatusChanged') {
                    expect(e.args.order.status).to.be.equal(4);
                    expect(e.args.code).to.be.equal(Utils.fromUtf8("T-USCL-01"));
                    if (e.args.order.id == id1) {
                        expect(e.args.order.updateBlock).to.not.be.equal(blockNum1);
                        expect(e.args.order.createBlock).to.be.equal(blockNum1);
                        expect(e.args.previousUpdateBlock).to.be.equal(blockNum1);
                    } else {
                        expect(e.args.order.updateBlock).to.not.be.equal(blockNum2);
                        expect(e.args.order.createBlock).to.be.equal(blockNum2);
                        expect(e.args.previousUpdateBlock).to.be.equal(blockNum2);
                    }
                }
            }

            order1 = await tradePairs.getOrder(id1);
            order2 = await tradePairs.getOrder(id2);
            expect(order1.id).to.be.equal(ethers.constants.HashZero );
            expect(order2.id).to.be.equal(ethers.constants.HashZero );

            // sell book is empty but call the unsolicitedCancel anyway
            await tradePairs.connect(owner).unsolicitedCancel(tradePairId, !isBuyBook, 10);
        });

        it("Should reject sending gas token directly to trade pairs contract.", async () => {
            const balBefore = await ethers.provider.getBalance(owner.address);
            const msg = "Transaction reverted";
            try {
                await owner.sendTransaction({to: tradePairs.address,
                                             value: Utils.toWei('1')})
            } catch(err: any) {
                expect(err.reason?.includes(msg) || err.message?.includes(msg)).to.be.true;
             }
            const balAfter = await ethers.provider.getBalance(owner.address);
            expect(balBefore).to.be.equal(balAfter);
        });
    });
