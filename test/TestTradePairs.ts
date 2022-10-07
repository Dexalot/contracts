/**
 * The test runner for Dexalot TradePairs contract
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    LZEndpointMock,
    MockToken__factory,
    OrderBooks,
    PortfolioBridge,
    PortfolioMain,
    PortfolioSub,
    TradePairs,
    ExchangeSub,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";

const ZERO_ACCT_ADDR = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("TradePairs", function () {
    let MockToken: MockToken__factory;
    let portfolio: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let exchange: ExchangeSub;
    let tradePairs: TradePairs;
    let orderBooks: OrderBooks;

    let quoteToken: any;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let quoteAssetAddr: any;

    const baseSymbolStr = "AVAX";
    const baseSymbol = Utils.fromUtf8(baseSymbolStr);
    const baseDecimals = 18;
    const baseDisplayDecimals = 3;
    const baseAssetAddr = ZERO_ACCT_ADDR;

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

    before(async function () {
        const { owner: owner1, admin: admin1, auctionAdmin: admin2, trader1: t1, trader2: t2 } = await f.getAccounts();
        owner = owner1;
        admin = admin1;
        auctionAdmin = admin2;
        trader1 = t1;
        trader2 = t2;

        console.log("Owner", owner.address);
        console.log("Admin", admin.address );
        console.log("AuctionAdmin", auctionAdmin.address);
        console.log("Trader1", trader1.address);
        console.log("Trader1", trader2.address);

        MockToken = await ethers.getContractFactory("MockToken");
    });

    beforeEach(async function () {
        const {portfolioMain: portfolioM, portfolioSub: portfolioS, lzEndpointMain, portfolioBridgeMain: pbrigeMain, portfolioBridgeSub: pbrigeSub, gasStation: gStation} = await f.deployCompletePortfolio(false);
        portfolioMain = portfolioM;
        portfolio = portfolioS;


        orderBooks = await f.deployOrderBooks();
        exchange = await f.deployExchangeSub(portfolio, orderBooks)
        tradePairs = await f.deployTradePairs(orderBooks, portfolio, exchange);

    });

    describe("TradePairs", function () {
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
            const quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await expect(tradePairs.connect(trader1).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                 quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                                                .to.be.revertedWith("T-OACC-01");

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            expect((await tradePairs.getTradePairs())[0]).to.be.equal(tradePairId);

            expect(await tradePairs.getSymbol(tradePairId, Boolean(1))).to.be.equal(baseSymbol);
            expect(await tradePairs.getSymbol(tradePairId, Boolean(0))).to.be.equal(quoteSymbol);
            expect(await tradePairs.getDecimals(tradePairId, Boolean(1))).to.be.equal(baseDecimals);
            expect(await tradePairs.getDecimals(tradePairId, Boolean(0))).to.be.equal(quoteDecimals);
            expect(await tradePairs.getDisplayDecimals(tradePairId, Boolean(1))).to.be.equal(baseDisplayDecimals);
            expect(await tradePairs.getDisplayDecimals(tradePairId, Boolean(0))).to.be.equal(quoteDisplayDecimals);

            expect(await tradePairs.getMinTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(minTradeAmount.toString(), quoteDecimals));
            expect(await tradePairs.getMaxTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals));

            expect((await tradePairs.getAuctionData(tradePairId))[0]).to.be.equal(mode);
        });

        it("Should update maker and taker fee rates from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).updateRate(tradePairId, mRate, 0)).to.be.revertedWith("AccessControl:");
            await expect(tradePairs.connect(trader2).updateRate(tradePairId, tRate, 1)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).updateRate(tradePairId, mRate, 0);
            expect(await tradePairs.getMakerRate(tradePairId)).to.be.equal(mRate);
            await tradePairs.connect(owner).updateRate(tradePairId, tRate, 1);
            expect(await tradePairs.getTakerRate(tradePairId)).to.be.equal(tRate);

            // call with wrong rate type
            await expect(tradePairs.connect(owner).updateRate(tradePairId, tRate, 2)).to.be.revertedWith("function was called with incorrect parameters");
        });

        it("Should add and remove order types from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

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

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            const minTradeAmount1 = Utils.parseUnits('50', quoteDecimals);
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setMinTradeAmount(tradePairId, minTradeAmount1)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setMinTradeAmount(tradePairId, minTradeAmount1);
            expect(await tradePairs.getMinTradeAmount(tradePairId)).to.be.equal(minTradeAmount1);
        });

        it("Should set max trade amount from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            const maxTradeAmount1 = Utils.parseUnits('250', quoteDecimals);
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setMaxTradeAmount(tradePairId, maxTradeAmount1)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setMaxTradeAmount(tradePairId, maxTradeAmount1);
            expect(await tradePairs.getMaxTradeAmount(tradePairId)).to.be.equal(maxTradeAmount1);
        });

        it("Should set display decimals from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            const displayDecimals = 2;
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, Boolean(1))).to.be.revertedWith("AccessControl:");
            await expect(tradePairs.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, Boolean(0))).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setDisplayDecimals(tradePairId, displayDecimals, Boolean(1));
            expect(await tradePairs.getDisplayDecimals(tradePairId, Boolean(1))).to.be.equal(displayDecimals);
            await tradePairs.connect(owner).setDisplayDecimals(tradePairId, displayDecimals, Boolean(0));
            expect(await tradePairs.getDisplayDecimals(tradePairId, Boolean(0))).to.be.equal(displayDecimals);
        });

        it("Should set allowed slippage percentage from the owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            const allowedSlippagePercent = 25;
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setAllowedSlippagePercent(tradePairId, allowedSlippagePercent)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setAllowedSlippagePercent(tradePairId, allowedSlippagePercent);
            expect(await tradePairs.getAllowedSlippagePercent(tradePairId)).to.be.equal(allowedSlippagePercent);
        });

        it("Should be able to add a new buy order from the trader accounts", async function () {
            const minTradeAmount = 1;
            const maxTradeAmount = 1000;
            const mode = 0;  // auction off
            let type2=0 ;// GTC
            let type1 = 1;  // market orders not enabled

            const pairSettings = {
                minTradeAmount: minTradeAmount,
                maxTradeAmount: maxTradeAmount,
                mode: mode,
            }

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            expect(portfolioMain.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, srcChainId, quoteDecimals, mode)).to.be.revertedWith("P-TSDM-01");
            expect(portfolio.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, srcChainId, quoteDecimals, mode)).to.be.revertedWith("P-TSDM-01");

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, pairSettings)

            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);

            const tx = await tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, type1, type2);
            const res:any = await tx.wait();
            expect(res.events[1].event).to.be.equal('OrderStatusChanged');
            expect(res.events[1].args.clientOrderId).to.be.equal(clientOrderid);
            expect(res.events[1].args.traderaddress).to.be.equal(trader1.address);
            expect(res.events[1].args.pair).to.be.equal(tradePairId);
            expect(res.events[1].args.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
            expect(res.events[1].args.totalamount).to.be.equal(0);      // not executed, yet, so totalamount is 0
            expect(res.events[1].args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
            expect(res.events[1].args.side).to.be.equal(0);             // side is BUY=0
            expect(res.events[1].args.type1).to.be.equal(1);            // type1 is LIMIT=1
            expect(res.events[1].args.type2).to.be.equal(0);            // type2 is GTC=0
            expect(res.events[1].args.status).to.be.equal(0);           // status is NEW = 0
            expect(res.events[1].args.quantityfilled).to.be.equal(0);   // not executed, yet, so quantityfilled is 0
            expect(res.events[1].args.totalfee).to.be.equal(0);         // not executed, yet, so free is 0

            let side = 0;   // buy side
            //Clientorderid not unique
            await expect(tradePairs.connect(trader1)
                .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('99', quoteDecimals), Utils.parseUnits('10', baseDecimals), side, type1, type2))
                        .to.be.revertedWith("T-CLOI-01");
            //{GTC, FOK, IOC, PO}

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            type2 = 1; // FOK
            await expect(tradePairs.connect(trader1)
                .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('98', quoteDecimals), Utils.parseUnits('10', baseDecimals), side, type1, type2))
                        .to.be.revertedWith("T-FOKF-01");

            side = 1
            type2 = 3; // PO
            await expect(tradePairs.connect(trader1)
            .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-T2PO-01");

            side = 0;
            // cannot add market order if not an allowed type
            type1 = 0;  // market orders not enabled
            type2 = 0; // GTC
            //No need to get new clientorderid as it will revert for other reasons first
            await expect(tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-IVOT-01");

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader2.address);
            await expect(tradePairs.connect(trader1)
                    .addOrder(trader2.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-OOCA-01");

            // cannot add market order if auction is on
            await tradePairs.connect(owner).addOrderType(tradePairId, 0);    // add market order first
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 2);  // auction is OPEN
            await expect(tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-AUCT-04");

            // add a limit order too small
            type1 = 1;  // limit order
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 0);  // auction is OFF
            await expect(tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid,tradePairId, Utils.parseUnits('0.1', quoteDecimals), Utils.parseUnits('5', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-LTMT-02");

            // add a limit order too big
            await expect(tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('10', quoteDecimals), Utils.parseUnits('1000', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-MTMT-02");

            // add a market order too small
            type1 = 0;  // market order
            await expect(tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('0.1', quoteDecimals), Utils.parseUnits('5', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-LTMT-01");

            // add a market order too big
            side = 1; // sell side
            await expect(tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('10', quoteDecimals), Utils.parseUnits('1000', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-MTMT-01");
        });

        it("Should be able to add a new sell order from the trader accounts", async function () {
            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            let type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            const tx = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 1, 1, type2);
            const res: any = await tx.wait();
            expect(res.events[1].event).to.be.equal('OrderStatusChanged');
            expect(res.events[1].args.pair).to.be.equal(tradePairId);
            expect(res.events[1].args.clientOrderId).to.be.equal(clientOrderid);
            expect(res.events[1].args.traderaddress).to.be.equal(trader1.address);
            expect(res.events[1].args.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
            expect(res.events[1].args.totalamount).to.be.equal(0);      // not executed, yet, so totalamount is 0
            expect(res.events[1].args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
            expect(res.events[1].args.side).to.be.equal(1);             // side is SELL=1
            expect(res.events[1].args.type1).to.be.equal(1);            // type1 is LIMIT=1
            expect(res.events[1].args.type2).to.be.equal(0);            // type2 is GTC=0
            expect(res.events[1].args.status).to.be.equal(0);           // status is NEW = 0
            expect(res.events[1].args.quantityfilled).to.be.equal(0);   // not executed, yet, so quantityfilled is 0
            expect(res.events[1].args.totalfee).to.be.equal(0);         // not executed, yet, so free is 0

            const type1 = 1;  // limit order
            const side = 0;   // buy side
            //{GTC, FOK, IOC, PO}

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            type2 = 1; // FOK
            await expect(tradePairs.connect(trader1)
                .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('98', quoteDecimals), Utils.parseUnits('10', baseDecimals), side, type1, type2))
                        .to.be.revertedWith("T-FOKF-01");

            type2 = 3; // PO
            await expect(tradePairs.connect(trader1)
            .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-T2PO-01");
        });

        it("Should be able to add an order and cancel it from the trader accounts", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // add a new order
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            // get if of the order
            const id = res1.events[1].args.orderId;
            // cancel the order
            const tx2 = await tradePairs.connect(trader1).cancelOrder(id);
            const res2: any = await tx2.wait();
            expect(res2.events[1].args.status).to.be.equal(4);           // status is CANCELED = 4
        });

        it("Should be able to add an order and cancel it from the trader accounts", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // add the first new order
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('5', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            // get id of the first order
            const id1 = res1.events[1].args.orderId;
            // add the second new order
            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const tx2 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid2, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('5', baseDecimals), 0, 1, type2);
            const res2: any = await tx2.wait();
            // get id of the second order
            const id2 = res2.events[1].args.orderId;
            // cancel all orders
            const tx3 = await tradePairs.connect(trader1).cancelAllOrders([id1, id2]);
            const res3: any = await tx3.wait();
            // verify cancellation of id1
            expect(res3.events[1].args.clientOrderId).to.be.equal(clientOrderid);
            expect(res3.events[1].args.status).to.be.equal(4);           // status is CANCELED = 4
            // verify cancellation of id2
            expect(res3.events[3].args.clientOrderId).to.be.equal(clientOrderid2);
            expect(res3.events[3].args.status).to.be.equal(4);           // status is CANCELED = 4
        });

        it("Should be able to add market buy order from the trader accounts", async function () {
            const minTradeAmount = 1;
            const maxTradeAmount = 1000;
            const mode = 0;  // auction off

            const pairSettings = {
                minTradeAmount: minTradeAmount,
                maxTradeAmount: maxTradeAmount,
                mode: mode
            };

            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            await trader2.sendTransaction({from: trader2.address, to: portfolioMain.address, value: Utils.toWei('3000')});

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            await quoteToken.connect(trader2).approve(portfolioMain.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolioMain.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals), 0);

            await f.addTradePair(tradePairs, pair, pairSettings)

            await tradePairs.connect(owner).addOrderType(tradePairId, 0);

            let tx = await tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 1, 1, type2);  // SELL, LIMIT ORDER

            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader1.address);
            tx = await tradePairs.connect(trader2)
                    .addOrder(trader2.address, clientOrderid2, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 0, type2);  // BUY, MARKET ORDER
            const res: any = await tx.wait();

            expect(res.events[5].event).to.be.equal('OrderStatusChanged');
            expect(res.events[5].args.pair).to.be.equal(tradePairId);
            expect(res.events[5].args.clientOrderId).to.be.equal(clientOrderid);
            expect(res.events[5].args.traderaddress).to.be.equal(trader1.address);
            expect(res.events[5].args.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
            expect(res.events[5].args.totalamount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
            expect(res.events[5].args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
            expect(res.events[5].args.side).to.be.equal(1);              // side is SELL=1
            expect(res.events[5].args.type1).to.be.equal(1);             // type1 is LIMIT=1
            expect(res.events[5].args.type2).to.be.equal(0);            // type2 is GTC=0
            expect(res.events[5].args.status).to.be.equal(3);            // status is FILLED = 3
            expect(res.events[5].args.quantityfilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
            expect(res.events[5].args.totalfee).to.be.equal(Utils.parseUnits('1', quoteDecimals));  // 0.1% of 1000 = 1 QT

            expect(res.events[6].event).to.be.equal('OrderStatusChanged');
            expect(res.events[6].args.pair).to.be.equal(tradePairId);
            expect(res.events[6].args.clientOrderId).to.be.equal(clientOrderid2);
            expect(res.events[6].args.traderaddress).to.be.equal(trader2.address);
            expect(res.events[6].args.price).to.be.equal(0);  // MARKET PRICE = 0
            expect(res.events[6].args.totalamount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
            expect(res.events[6].args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
            expect(res.events[6].args.side).to.be.equal(0);              // side is BUY=0
            expect(res.events[6].args.type1).to.be.equal(0);             // type1 is MARKET=0
            expect(res.events[6].args.type2).to.be.equal(0);            // type2 is GTC=0
            expect(res.events[6].args.status).to.be.equal(3);            // status is FILLED = 3
            expect(res.events[6].args.quantityfilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
            expect(res.events[6].args.totalfee).to.be.equal(Utils.parseUnits('0.02', baseDecimals));  // 0.2% of 10 = 0.02 AVAX

            // getOrderByClientOrderId should return the same orders
            const orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderid);
            const orderbyCl2= await tradePairs.getOrderByClientOrderId(trader2.address, clientOrderid2);

            expect(res.events[5].args.orderId).to.be.equal(orderbyCl1.id);
            expect(res.events[6].args.orderId).to.be.equal(orderbyCl2.id);
        });

        it("Should revert when price has more decimals than quote display decimals", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100.1234', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("T-TMDP-01");
        });

        it("Should revert when quantity has more decimals then base display decimals", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10.1234', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("T-TMDQ-01");
        });

        it("Should set auction mode from the auction owner account", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            const auctionMode = 4;
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).setAuctionMode(tradePairId, auctionMode)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).setAuctionMode(tradePairId, auctionMode);
            const auctionData = await tradePairs.getAuctionData(tradePairId);
            expect(auctionData[0]).to.be.equal(auctionMode);
        });

        it("Should pause and unpause TradePairs from the owner account", async function () {
            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).pause()).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).pause();
            expect(await tradePairs.paused()).to.be.true;
            await tradePairs.connect(owner).unpause();
            expect(await tradePairs.paused()).to.be.false;
        });

        it("Should pause a trade pair from owner account", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).pauseTradePair(tradePairId, true)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).pauseTradePair(tradePairId, true);
            // fail addOrder
            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("T-PPAU-01");
            // unpause to succeed
            await tradePairs.connect(owner).pauseTradePair(tradePairId, false);
            // succeed addOrder
            await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2);
        });

        it("Should pause addOrder for a trade pair from owner account", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // fail from non owner accounts
            await expect(tradePairs.connect(trader1).pauseAddOrder(tradePairId, true)).to.be.revertedWith("AccessControl:");
            // succeed from owner accounts
            await tradePairs.connect(owner).pauseAddOrder(tradePairId, true);
            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("T-AOPA-01");

            await tradePairs.connect(owner).pauseAddOrder(tradePairId, false);
            await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2);
        });

        it("Should use setAuctionPrice correctly", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // too many decimals
            await expect(tradePairs.connect(owner).setAuctionPrice(tradePairId, Utils.parseUnits('4.1234', quoteDecimals)))
                         .to.be.revertedWith("T-AUCT-02");
        });

        it("Should be able to check if trade pair exists", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            expect(await tradePairs.tradePairExists(tradePairId)).to.be.true;
            expect(await tradePairs.tradePairExists(Utils.fromUtf8("DOES NOT EXIST"))).to.be.false;
        });

        it("Should not be able to add same trade pair", async function () {
            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // should emit NewTradePair
            await expect(tradePairs.connect(owner).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                        .to.emit(tradePairs, "NewTradePair");

            // should not emit NewTradePair
            await expect(tradePairs.connect(owner).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                        .to.not.emit(tradePairs, "NewTradePair");
        });

        it("Should be able to cancel orders", async function () {
            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // add two buy orders
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.orderId;

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const tx2 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res2: any = await tx2.wait();
            const id2 = res2.events[1].args.orderId;
            // 0address order will revert from ownership check
            await expect(tradePairs.connect(trader1).cancelOrder(ZERO_BYTES32)).to.be.revertedWith("T-OOCC-01");
            // cannot cancel order for somebody else
            await expect(tradePairs.connect(owner).cancelOrder(id1)).to.be.revertedWith("T-OOCC-01");
            // cannot cancel all with empty order
            await expect(tradePairs.connect(trader1).cancelAllOrders([ZERO_BYTES32, ZERO_BYTES32])).to.be.revertedWith("T-OOCC-02");
            // cannot cancel all for somebody else
            await expect(tradePairs.connect(owner).cancelAllOrders([id1, id2])).to.be.revertedWith("T-OOCC-02");
        });

        it("Should be able to use cancelOrder(), cancelAllOrders() and cancelReplaceOrders() correctly", async function () {
            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            let type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // add a buy order
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.orderId;
            // set auction mode to OPEN
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 2);  // auction is OPEN
            // cannot cancel and replace with empty order id
            await expect(tradePairs.connect(trader1)
                .cancelReplaceOrder(ZERO_BYTES32, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OOCC-01");

            // cannot cancel and replace with the same clientorderid
            await expect(tradePairs.connect(trader1)
                .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-CLOI-01");
            // you cannot cancel and replace for somebody else
            await expect(tradePairs.connect(owner)
                .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OOCC-01");
            // set auction mode to OFF
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 0);  // auction is OFF
            // trigger available funds not enough
            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader2.address);
            await expect(tradePairs.connect(trader2).addOrder(trader2.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 1, 1, type2))
                .to.be.revertedWith("P-AFNE-02");

            // mint some tokens for trader1
            await quoteToken.mint(trader2.address, Utils.parseUnits('20000', quoteDecimals));

            // deposit some native to portfolio for trader2
            await trader2.sendTransaction({from: trader2.address, to: portfolioMain.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader2.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader2.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader2
            await quoteToken.connect(trader2).approve(portfolioMain.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolioMain.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals), 0);
            expect((await portfolio.getBalance(trader2.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader2.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader2.address);
            type2 = 2; // IOC
            // enter a sell order with higher quantity but type2= Immediate or cancel.
            const tx2 = await tradePairs.connect(trader2).addOrder(trader2.address, clientOrderid2, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('150', baseDecimals), 1, 1, type2);
            const res2: any = await tx2.wait();
            expect(res2.events[6].args.clientOrderId).to.be.equal(clientOrderid2); // make sure that this is our order
            expect(res2.events[6].args.quantityfilled).to.be.equal(Utils.parseUnits('100', baseDecimals));  // 100 filled, 50 remaining but status canceled
            expect(res2.events[6].args.status).to.be.equal(4);  // status is CANCELED = 4

            // fail to cancel a matched order via cancelOrder()
            await expect(tradePairs.connect(trader1).cancelOrder(id1)).to.be.revertedWith("T-OAEX-01");
            // fail to cancel a matched order via cancelAllOrders()
            await tradePairs.connect(trader1).cancelAllOrders([id1]);
            // fail to cancel a matched order via cancelReplaceOrder()
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 2);  // auction is OPEN
            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            await expect(tradePairs.connect(trader1)
                 .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OAEX-01");
        });

        it("Should be able to use cancelReplaceOrder() even when Available==0", async function () {
            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

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

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // add a buy order using the entire 100 token @price 1
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.orderId;

            prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);
            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('100', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('0', quoteDecimals));

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);

            // replace buy order at the same price but increase quantity to 110
            await expect(tradePairs.connect(trader1)
                 .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('110', baseDecimals))).to.be.revertedWith("P-AFNE-01");

            // replace buy order at the same price but decrease quantity to 90
            const tx2 = await tradePairs.connect(trader1).cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('90', baseDecimals));
            await tx2.wait();
            const id2 = (await tradePairs.connect(trader1).getOrderByClientOrderId(trader1.address, clientOrderid)).id ;

            prtfQuoteBalance = await portfolio.getBalance(trader1.address, quoteSymbol);
            expect(prtfQuoteBalance[0]).to.equal(Utils.parseUnits('100', quoteDecimals));
            expect(prtfQuoteBalance[1]).to.equal(Utils.parseUnits('10', quoteDecimals));
            //cancel the outstanding order
            await tradePairs.connect(trader1).cancelOrder(id2);

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            // add a sell order using the entire 100 native @price 1
            const tx3 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 1, 1, type2);
            const res3: any = await tx3.wait();
            const id3 = res3.events[1].args.orderId;

            prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('0', baseDecimals));

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            // replace sell order at the same price but increase quantity to 110
            await expect(tradePairs.connect(trader1)
                 .cancelReplaceOrder(id3, clientOrderid, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('110', baseDecimals))).to.be.revertedWith("P-AFNE-01");

            // replace buy order at the same price but decrease quantity to 90
            const tx4 = await tradePairs.connect(trader1).cancelReplaceOrder(id3, clientOrderid, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('90', baseDecimals));
            await tx4.wait();

            prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('10', baseDecimals));
        });

        it("Should be able to use unsolicitedCancel() correctly", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolioMain, portfolio, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)

            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // add two buy orders
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.orderId;

            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const tx2 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid2, tradePairId, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('200', baseDecimals), 0, 1, type2);
            const res2: any = await tx2.wait();
            const id2 = res2.events[1].args.orderId;

            let order1 = await tradePairs.getOrder(id1);
            let order2 = await tradePairs.getOrder(id2);
            expect(order1.id).to.be.equal(id1);
            expect(order2.id).to.be.equal(id2);

            const orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderid);
            const orderbyCl2= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderid2);

            expect(order1.id).to.be.equal(orderbyCl1.id);
            expect(order2.id).to.be.equal(orderbyCl2.id);
            expect(order1.status).to.be.equal(0);
            expect(order2.status).to.be.equal(0);

            const isBuyBook = true;
            // fail from non-owner account
            await expect(tradePairs.connect(trader1).unsolicitedCancel(tradePairId, isBuyBook, 10)).to.be.revertedWith("AccessControl:");
            // should succeed even when tradePairs is paused
            await tradePairs.connect(owner).pauseTradePair(tradePairId, true);
            await tradePairs.connect(owner).unsolicitedCancel(tradePairId, isBuyBook, 10);

            order1 = await tradePairs.getOrder(id1);
            order2 = await tradePairs.getOrder(id2);
            expect(order1.id).to.be.equal(id1);
            expect(order2.id).to.be.equal(id2);
            expect(order1.status).to.be.equal(4);
            expect(order2.status).to.be.equal(4);
        });

        // it("Should floor correctly", async function () {
        //     expect(await tradePairs.floor(1245, 1)).to.be.equal(1240);
        //     expect(await tradePairs.floor(1245, 2)).to.be.equal(1200);
        //     expect(await tradePairs.floor(1245, 3)).to.be.equal(1000);
        // });

        it("Should reject sending gas token directly to trade pairs contract.", async () => {
            const balBefore = await ethers.provider.getBalance(owner.address);
            const msg = "Transaction reverted:";
            try {
                await owner.sendTransaction({from: owner.address,
                                             to: tradePairs.address,
                                             value: Utils.toWei('1')})
            } catch(err: any) {
                expect(err.message.includes(msg)).to.be.true;
             }
            const balAfter = await ethers.provider.getBalance(owner.address);
            expect(balBefore).to.be.equal(balAfter);
        });
    });
});
