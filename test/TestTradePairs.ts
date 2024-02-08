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
    IPortfolio
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, ContractFactory } from "ethers";


describe("TradePairs", function () {
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
        tokenAddress: ethers.constants.AddressZero,
        auctionMode: 0,
        srcChainId:1111,
        symbol: ethers.constants.HashZero,
        symbolId: ethers.constants.HashZero,
        sourceChainSymbol:ethers.constants.HashZero,
        isVirtual:false
    };
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
        portfolioMain = portfolioContracts.portfolioAvax;
        portfolio = portfolioContracts.portfolioSub;
        gasStation = portfolioContracts.gasStation;
        alot = portfolioContracts.alot;

        orderBooks = await f.deployOrderBooks();
        exchange = await f.deployExchangeSub(portfolio, orderBooks)
        tradePairs = await f.deployTradePairs(orderBooks, portfolio, exchange);

        quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
        quoteAssetAddr = quoteToken.address;
        await f.addToken(portfolioMain, portfolio, quoteToken, 0.1, mode);

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

            //const mode = 0;  // auction off
            const type2 = 0 ;  // GTC
            const type1 = 1;   // market orders not enabled

            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            await f.addTradePair(exchange, pair, defaultPairSettings)
            expect((await tradePairs.getTradePairs()).length).to.be.equal(1);

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            const clientOrderidBuy = await Utils.getClientOrderId(ethers.provider, trader1.address);

            const tx = await tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderidBuy, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, type1, type2);
            const receipt = await tx.wait();

            //console.log("Gas used", Utils.formatUnits(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice).div(10**9),18));
            console.log("Gas used", receipt.cumulativeGasUsed.toString(), receipt.effectiveGasPrice.toString());
            const clientOrderidSell = await Utils.getClientOrderId(ethers.provider, trader1.address);
            await tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderidSell, tradePairId, Utils.parseUnits('101', quoteDecimals), Utils.parseUnits('10', baseDecimals), 1, type1, type2);

            const tpairId =Utils.fromUtf8(tradePairStr);

            await expect(tradePairs.connect(trader1).removeTradePair(tpairId))
                    .to.be.revertedWith("AccessControl:");

            await expect(tradePairs.removeTradePair(tpairId))
                   .to.be.revertedWith("T-RMTP-01");

            //Cancel buy order
            let orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderidBuy);
            await tradePairs.connect(trader1).cancelOrder(orderbyCl1.id);
            //Original order removed
            expect((await tradePairs.getOrder(orderbyCl1.id)).id).to.be.equal(ethers.constants.HashZero );
            //Still fails
            await expect(tradePairs.removeTradePair(tpairId))
                   .to.be.revertedWith("T-RMTP-01");
            //Cancel sell order
            orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderidSell);
            await tradePairs.connect(trader1).cancelOrder(orderbyCl1.id);
            //Original order removed
            expect((await tradePairs.getOrder(orderbyCl1.id)).id).to.be.equal(ethers.constants.HashZero );

            // Success
            await expect(tradePairs.removeTradePair(tpairId))
            .to.emit(tradePairs, "ParameterUpdated")
            .withArgs(1, tpairId, "T-REMOVETRADEPAIR", 0, 0);

            expect((await tradePairs.getTradePairs()).length).to.be.equal(0);
            expect(await tradePairs.tradePairExists(tpairId)).to.be.false;

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
            const minTradeAmount = 1;
            const maxTradeAmount = 1000;
            const mode = 0;  // auction off
            let type2 = 0 ;  // GTC
            let type1 = 1;   // market orders not enabled

            const pairSettings = {
                minTradeAmount: minTradeAmount,
                maxTradeAmount: maxTradeAmount,
                mode: mode,
            }

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            expect(portfolioMain.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, srcChainId, quoteDecimals, '0', ethers.utils.parseUnits('0.5',quoteDecimals),false)).to.be.revertedWith("P-TSDM-01");
            expect(portfolio.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, srcChainId, quoteDecimals, mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals),Utils.fromUtf8(quoteTokenStr))).to.be.revertedWith("P-TSDM-01");
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await f.addTradePair(exchange, pair, pairSettings)

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
            // {GTC, FOK, IOC, PO}

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
                    .to.be.revertedWith("T-LTMT-01");

            // add a limit order too big
            await expect(tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('10', quoteDecimals), Utils.parseUnits('1000', baseDecimals), side, type1, type2))
                    .to.be.revertedWith("T-MTMT-01");

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


        it("Should be able to send addLimitOrderList/ no autoFill", async function () {
            const type2 = 0 ;  // GTC
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

            let clientOrderIds=[];
            let prices=[];
            let quantities= [];
            let sides =[];
            let type2s =[];
            //buy orders
            for (let i=0; i<6; i++) {
                clientOrderIds.push(await Utils.getClientOrderId(ethers.provider, trader1.address,i));

                prices.push(Utils.parseUnits((100 - i).toString(), quoteDecimals)); //100, 99, 98
                quantities.push(Utils.parseUnits('1', baseDecimals));
                sides.push(0);
                type2s.push(type2);
            }

            const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address);
            const gasDeposited = await gasStation.gasAmount();

            // Autofill does not kick in for addLimitOrderList
            const WalBaltoReset =gasDeposited.div(2);
            await ethers.provider.send("hardhat_setBalance", [
                trader1.address,
                WalBaltoReset.toHexString(),
              ]);

            const tx1 = await tradePairs.connect(trader1)
                    .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s,{gasLimit: 3000000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res1: any = await tx1.wait();
            const gasUsedInTx = res1.cumulativeGasUsed.mul(res1.effectiveGasPrice);
            // No autoFill kicked in, wallet balance less than what we started with
            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset)).to.lte(gasUsedInTx);
            // No change in QT
            expect((await portfolio.getBalance(trader1.address, quoteSymbol)).total).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals));
            // No impact on treasury nor Gas Station
            expect((await portfolio.getBalance(treasurySafe.address, quoteSymbol)).total).to.equal(0);
            expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);
            //No impact on Trader Portfolio ALOT Balance
            expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(Utils.parseUnits(deposit_amount, alot_decimals));

            //Reset trader1 balances for later tests
            const newBalance = ethers.utils.parseEther('1000000');
            const newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
            await ethers.provider.send("hardhat_setBalance", [
                trader1.address,
                newBalanceHex,
              ]);

            let buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            let sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(6);
            expect(sellbook.length).to.equal(0);

            clientOrderIds=[];

            prices=[];
            quantities= [];
            sides =[];
            type2s =[];
            //Sell orders
            for (let i=0; i<6; i++) {
                clientOrderIds.push(await Utils.getClientOrderId(ethers.provider, trader1.address,i));

                prices.push(Utils.parseUnits((100 + i).toString(), quoteDecimals)); //100, 101, 102
                quantities.push(Utils.parseUnits('1', baseDecimals));
                sides.push(1);
                type2s.push(type2);
            }

            const tx = await tradePairs.connect(trader1)
                    .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s);
            const receipt = await tx.wait();

            //console.log("addLimitOrderList Gas used", Utils.formatUnits(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice).div(10**9),18));
            console.log("addLimitOrderList Gas used", receipt.cumulativeGasUsed.toString(), receipt.effectiveGasPrice.toString());
            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            // One got filled @100
            expect(buybook.length).to.equal(5);
            expect(sellbook.length).to.equal(5);
            // we have 99 - 101

            for (let i=0; i<6; i++) {
                clientOrderIds[i]=(await Utils.getClientOrderId(ethers.provider, trader1.address,i));
                prices[i]= Utils.parseUnits((100.5 + i).toString(), quoteDecimals); //100.5 , 101, 101.5
            }
            type2s[1]=1; //FOK

            // Only 1 order is unfilled FOK but the entire batch reverts
            await expect(tradePairs.connect(trader1)
                    .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s)).to.be.revertedWith("T-FOKF-01");

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            // No impact
            expect(buybook.length).to.equal(5);
            expect(sellbook.length).to.equal(5);

            type2s[1]=2 // IOC,
            // Only 1 order is IOC and it gets canceled
            await tradePairs.connect(trader1)
                    .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s);

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");
            // No impact
            expect(buybook.length).to.equal(5);
            expect(sellbook.length).to.equal(10); // 5 more added to the orderbook

            for (let i=0; i<6; i++) {
                clientOrderIds[i]=(await Utils.getClientOrderId(ethers.provider, trader1.address,i));
                prices[i]= Utils.parseUnits((97.9 + i).toString(), quoteDecimals);
                type2s[i]=3 // PO,
            }

            //First 2 PO orders will get a match hence they are rejected
            // the rest of the orders are processed
            const tx2 = await tradePairs.connect(trader1)
            .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s);
            const receipt2 : any  = await tx2.wait();

            for (const e of receipt2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){
                    expect(e.args.pair).to.be.equal(tradePairId);
                    const orderIndex = clientOrderIds.indexOf(e.args.clientOrderId);
                    expect(e.args.clientOrderId).to.be.equal(clientOrderIds[orderIndex]);
                    expect(e.args.traderaddress).to.be.equal(trader1.address);
                    expect(e.args.price).to.be.equal(prices[orderIndex]);
                    expect(e.args.side).to.be.equal(sides[orderIndex]);              // side is SELL=1
                    expect(e.args.type1).to.be.equal(1);             // type1 is LIMIT=1
                    expect(e.args.type2).to.be.equal(type2s[orderIndex]);   // type2 is GTC=0
                    if (orderIndex <=1) {
                        expect(e.args.status).to.be.equal(1);            // status is REJECTED = 1
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));
                    } else {
                        expect(e.args.status).to.be.equal(0);            // status is NEW = 0
                        expect(e.args.code).to.be.equal(ethers.constants.HashZero );
                    }
                    expect(e.args.quantityfilled).to.be.equal(0);

                }
            }

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            // for ( const p of sellbook) {
            //     console.log(p.price.toString(), "q", p.quantity.toString())
            // }

            // No impact
            expect(buybook.length).to.equal(5);
            expect(sellbook.length).to.equal(14); //Only 4 more added to the orderbook 2 PO orders ignored

            // fail paused
            await tradePairs.connect(owner).pause();
            await expect( tradePairs.connect(trader1)
                    .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s))
                    .to.be.revertedWith("Pausable: paused");

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

            let clientOrderIds=[];
            let prices=[];
            let quantities= [];
            let sides =[];
            let type2s =[];


            //buy PO, followed by sell Limit at the same price
            clientOrderIds.push(await Utils.getClientOrderId(ethers.provider, trader1.address,2));
            prices.push(Utils.parseUnits((100 ).toString(), quoteDecimals));
            quantities.push(Utils.parseUnits('1', baseDecimals));
            sides.push(0);
            type2s.push(3); //PO


            clientOrderIds.push(await Utils.getClientOrderId(ethers.provider, trader1.address,3));
            prices.push(Utils.parseUnits((100 ).toString(), quoteDecimals));
            quantities.push(Utils.parseUnits('1', baseDecimals));
            sides.push(1);
            type2s.push(0); //GTC

            const tx = await tradePairs.connect(trader1)
                    .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s);
            const res2: any = await tx.wait();

            for (const e of res2.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address
                    && e.args.status !== 0){ //ignore the first two status= new events
                    expect(e.args.pair).to.be.equal(tradePairId);
                    const orderIndex = clientOrderIds.indexOf(e.args.clientOrderId);
                    expect(e.args.clientOrderId).to.be.equal(clientOrderIds[orderIndex]);
                    expect(e.args.traderaddress).to.be.equal(trader1.address);
                    expect(e.args.price).to.be.equal(prices[orderIndex]);
                    expect(e.args.side).to.be.equal(sides[orderIndex]);              // side is SELL=1
                    expect(e.args.type1).to.be.equal(1);             // type1 is LIMIT=1
                    expect(e.args.type2).to.be.equal(type2s[orderIndex]);   // type2 is GTC=0
                    expect(e.args.status).to.be.equal(3);            // status is FILLED = 3
                    expect(e.args.code).to.be.equal(ethers.constants.HashZero );
                    expect(e.args.quantityfilled).to.be.equal(quantities[orderIndex]);

                }
            }

            let buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            let sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            // No impact
            expect(buybook.length).to.equal(0);
            expect(sellbook.length).to.equal(0); //Only 4 more added to the orderbook 2 PO orders ignored

            clientOrderIds  =[];
            prices=[];
            quantities= [];
            sides =[];
            type2s =[];

            // First Limit order then fallowed by PO order that should be REJECTED
            clientOrderIds.push(await Utils.getClientOrderId(ethers.provider, trader1.address,1));
            prices.push(Utils.parseUnits((100 ).toString(), quoteDecimals));
            quantities.push(Utils.parseUnits('1', baseDecimals));
            sides.push(1);
            type2s.push(0); //GTC

            //buy PO, followed by sell Limit at the same price
            clientOrderIds.push(await Utils.getClientOrderId(ethers.provider, trader1.address,0));
            prices.push(Utils.parseUnits((100 ).toString(), quoteDecimals));
            quantities.push(Utils.parseUnits('1', baseDecimals));
            sides.push(0);
            type2s.push(3); //PO

            const tx1 = await tradePairs.connect(trader1)
                    .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s,{gasLimit: 3000000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res1: any = await tx1.wait();


            for (const e of res1.events) {
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader1.address){
                    expect(e.args.pair).to.be.equal(tradePairId);
                    const orderIndex = clientOrderIds.indexOf(e.args.clientOrderId);
                    expect(e.args.clientOrderId).to.be.equal(clientOrderIds[orderIndex]);
                    expect(e.args.traderaddress).to.be.equal(trader1.address);
                    expect(e.args.price).to.be.equal(prices[orderIndex]);
                    expect(e.args.side).to.be.equal(sides[orderIndex]);              // side is SELL=1
                    expect(e.args.type1).to.be.equal(1);             // type1 is LIMIT=1
                    expect(e.args.type2).to.be.equal(type2s[orderIndex]);   // type2 is GTC=0
                    if (orderIndex ===1) {
                        expect(e.args.status).to.be.equal(1);            // status is REJECTED = 1
                        expect(e.args.code).to.be.equal(Utils.fromUtf8("T-T2PO-01"));
                    } else {
                        expect(e.args.status).to.be.equal(0);            // status is NEW = 0
                        expect(e.args.code).to.be.equal(ethers.constants.HashZero );
                    }
                    expect(e.args.quantityfilled).to.be.equal(0);

                }
            }

            buybook =  await Utils.getBookwithLoop(tradePairs, tradePairStr, "BUY");
            sellbook = await Utils.getBookwithLoop(tradePairs, tradePairStr, "SELL");

            expect(buybook.length).to.equal(0);
            expect(sellbook.length).to.equal(1);

        });



        it("Should get unsolicited cancel when maxNbrOfFills reached", async function () {
            const type2 = 0 ;  // GTC

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

            const clientOrderIds=[];
            const prices=[];
            const quantities= [];
            const sides =[];
            const type2s =[];

            await tradePairs.setMaxNbrOfFills(maxNbrOfFills);
            expect(await tradePairs.maxNbrOfFills()).to.be.equal(ethers.BigNumber.from(maxNbrOfFills));

            //buy orders all 1 unit @10  trader1 buying AVAX selling QT
            for (let i=0; i< maxNbrOfFills + 1; i++) {
                clientOrderIds.push(await Utils.getClientOrderId(ethers.provider, trader1.address,i));
                prices.push(Utils.parseUnits(matchPrice, quoteDecimals));
                quantities.push(Utils.parseUnits(qty.toString(), baseDecimals));
                sides.push(0);
                type2s.push(type2);
            }

            await tradePairs.connect(trader1)
                    .addLimitOrderList(tradePairId,clientOrderIds,prices,quantities,sides,type2s);

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


            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader2.address);
            // Try to buy 1 more than maxNbrOfFills* qty
            const tx = await tradePairs.connect(trader2)
                    .addOrder(trader2.address, clientOrderid2, tradePairId, Utils.parseUnits(matchPrice, quoteDecimals),
                    Utils.parseUnits(((maxNbrOfFills + 1) * qty).toString(), baseDecimals),1, 1, type2);  // SELL, LIMIT ORDER , GTC
            const res: any = await tx.wait();
            let fillCounter = 0;

            // const gasUsedInTx = Utils.formatUnits(res.cumulativeGasUsed.mul(res.effectiveGasPrice).div(10**9),18);
            console.log("addLimitOrderList Gas used", res.cumulativeGasUsed.toString(), res.effectiveGasPrice.toString());
            //console.log("Multiple fills gas usage", gasUsedInTx)

            for (const e of res.events) {
                if (e.event === "Executed"){
                    fillCounter++;
                }
                if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader2.address){
                    expect(e.event).to.be.equal('OrderStatusChanged');
                    expect(e.args.pair).to.be.equal(tradePairId);
                    expect(e.args.clientOrderId).to.be.equal(clientOrderid2);
                    expect(e.args.traderaddress).to.be.equal(trader2.address);
                    expect(e.args.price).to.be.equal(Utils.parseUnits(matchPrice, quoteDecimals));
                    // console.log (e.args.price.toString(), Utils.formatUnits(e.args.price, quoteDecimals))
                    // console.log (e.args.quantity.toString(), Utils.formatUnits(e.args.quantity, baseDecimals))
                    // console.log (e.args.quantityfilled.toString(), Utils.formatUnits(e.args.quantityfilled, baseDecimals))
                    // console.log(e.args.totalamount.toString(), Utils.formatUnits(e.args.totalamount, quoteDecimals))
                    expect(e.args.totalamount).to.be.equal(Utils.parseUnits((BigNumber.from(matchPrice).mul(maxNbrOfFills).mul(qty)).toString(), quoteDecimals));  // totalamount maxNbrOfFills * qty each
                    expect(e.args.quantity).to.be.equal(Utils.parseUnits(((maxNbrOfFills + 1) * qty).toString(), baseDecimals));
                    expect(e.args.side).to.be.equal(1);              // side is SELL=1
                    expect(e.args.type1).to.be.equal(1);             // type1 is LIMIT=1
                    expect(e.args.type2).to.be.equal(type2);         // type2 is GTC=0
                    expect(e.args.status).to.be.equal(4);            // status is CANCELED = 4
                    expect(e.args.quantityfilled).to.be.equal(Utils.parseUnits((maxNbrOfFills*qty).toString(), baseDecimals));

                    // console.log(e.args.totalfee.toString())
                    // console.log(Utils.formatUnits(e.args.totalfee, quoteDecimals))

                    const takerRate = ((await tradePairs.getTradePair(tradePairId))).takerRate;

                    // console.log(Number(matchPrice)* maxNbrOfFills * takerRate / 10000)
                    // console.log(Utils.parseUnits((Number(matchPrice)* maxNbrOfFills * takerRate / 10000).toString() ,quoteDecimals).toString())

                    expect(e.args.totalfee).to.be.equal(Utils.parseUnits((Number(matchPrice)* maxNbrOfFills * qty * takerRate / 10000).toString(),quoteDecimals));  // 0.2%

                }
            }

            expect(fillCounter).to.be.equal(maxNbrOfFills);

        });

        it("Should be able to add an order and cancel it from the trader accounts", async function () {
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

            // add a new order
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            // get if of the order
            const id = res1.events[1].args.orderId;
            // cancel the order
            const tx2 = await tradePairs.connect(trader1).cancelOrder(id);
            const res2: any = await tx2.wait();
            expect(res2.events[1].args.status).to.be.equal(4);           // status is CANCELED = 4
            //Original order removed
            expect((await tradePairs.getOrder(id)).id).to.be.equal(ethers.constants.HashZero );
        });

        it("Should autofill kick-in when adding & canceling an order", async function () {
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
            const WalBaltoReset =gasDeposited.div(2);
            await ethers.provider.send("hardhat_setBalance", [
                trader1.address,
                WalBaltoReset.toHexString(),
              ]);
            // add a buy order because it is AVAX/QT and when cancelled We make QT available to get gas for
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals)
            , Utils.parseUnits('10', baseDecimals), 0, 1, type2,{gasLimit: 600000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res1: any = await tx1.wait();
            // get if of the order
            const id = res1.events[1].args.orderId;

            let gasUsedInTx = res1.cumulativeGasUsed.mul(res1.effectiveGasPrice);

            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset.add(gasDeposited))).to.lte(gasUsedInTx);
            expect((await portfolio.getBalance(trader1.address, QT)).total).to.equal(Utils.parseUnits(defaultTokenDeposit, quoteDecimals).sub(qtSwappedAmnt));
            expect((await portfolio.getBalance(treasurySafe.address, QT)).total).to.equal(qtSwappedAmnt);
            expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited);
            gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address);

            // console.log ("gasStationBeforeBal", gasStationBeforeBal.toString(), "avaxswaped", qtSwappedAmnt.toString())
            // console.log ("wallet bal before", (await ethers.provider.getBalance(trader1.address)).toString())
            await ethers.provider.send("hardhat_setBalance", [
                trader1.address,
                WalBaltoReset.toHexString(),
              ]);

            //console.log ("wallet bal after",(await ethers.provider.getBalance(trader1.address)).toString())
            // cancel the order
            const tx2 = await tradePairs.connect(trader1).cancelOrder(id ,{gasLimit: 500000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res: any = await tx2.wait();
            expect(res.events[1].args.status).to.be.equal(4);           // status is CANCELED = 4
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
            const newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
            await ethers.provider.send("hardhat_setBalance", [
                trader1.address,
                newBalanceHex,
              ]);
        });

        it("Should autofill kick-in using ALOT when adding/canceling an order if ALOT is available", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC
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

            const WalBaltoReset =gasDeposited.div(2);
            await ethers.provider.send("hardhat_setBalance", [
                trader1.address,
                WalBaltoReset.toHexString(),
              ]);
            // Test out addOrder autoFill using a sell order AVAX/QT
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals)
            , Utils.parseUnits('10', baseDecimals), 1, 1, type2,{gasLimit: 600000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res1: any = await tx1.wait();
            // get id of the order
            const id = res1.events[1].args.orderId;
            let gasUsedInTx = res1.cumulativeGasUsed.mul(res1.effectiveGasPrice);

            // Wallet balance increased
            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset.add(gasDeposited))).to.lte(gasUsedInTx);

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
            expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(Utils.parseUnits(deposit_amount, alot_decimals).sub(gasDeposited));
            //const qtSwappedAmnt = (await portfolio.bridgeParams(QT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

            // console.log ("gasStationBeforeBal", gasStationBeforeBal.toString(), "avaxswaped", qtSwappedAmnt.toString())
            // console.log ("wallet bal before", (await ethers.provider.getBalance(trader1.address)).toString())
            gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
            await ethers.provider.send("hardhat_setBalance", [
                trader1.address,
                WalBaltoReset.toHexString(),
              ]);

            //console.log ("wallet bal after",(await ethers.provider.getBalance(trader1.address)).toString())
            // cancel the order
            const tx2 = await tradePairs.connect(trader1).cancelOrder(id ,{gasLimit: 500000, maxFeePerGas:ethers.utils.parseUnits("5", "gwei")});
            const res: any = await tx2.wait();
            expect(res.events[1].args.status).to.be.equal(4);           // status is CANCELED = 4
            gasUsedInTx = res.cumulativeGasUsed.mul(res.effectiveGasPrice);

            expect((await ethers.provider.getBalance(trader1.address)).sub(WalBaltoReset.add(gasDeposited))).to.lte(gasUsedInTx);

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
            expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(Utils.parseUnits(deposit_amount, alot_decimals).sub(gasDeposited.mul(2)));
            //Reset trader1 balances for later tests
            const newBalance = ethers.utils.parseEther('1000000');
            const newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
            await ethers.provider.send("hardhat_setBalance", [
                trader1.address,
                newBalanceHex,
              ]);
        });

        it("Should be able to add an order and cancel it from the trader accounts", async function () {
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
            // add the third new order
            const clientOrderid3 = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const tx3 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid3, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('5', baseDecimals), 0, 1, type2);
            const res3: any = await tx3.wait();
            // get id of the second order
            const id3 = res3.events[1].args.orderId;

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
            expect(res4.events[1].args.clientOrderId).to.be.equal(clientOrderid);
            expect(res4.events[1].args.status).to.be.equal(4);           // status is CANCELED = 4
            //Original order removed
            expect((await tradePairs.getOrder(id1)).id).to.be.equal(ethers.constants.HashZero );

            // verify cancellation of id2
            expect(res4.events[3].args.clientOrderId).to.be.equal(clientOrderid2);
            expect(res4.events[3].args.status).to.be.equal(4);           // status is CANCELED = 4\
             //Original order removed
            expect((await tradePairs.getOrder(id2)).id).to.be.equal(ethers.constants.HashZero );

            // Get a cancel reject on id3
            expect(res4.events[4].args.orderId).to.be.equal(id3);
            expect(res4.events[4].args.code).to.be.equal(Utils.fromUtf8("T-OAEX-01"));
            expect(res4.events[4].args.status).to.be.equal(7);  // status is CANCEL_REJECT = 7
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
            await trader2.sendTransaction({to: portfolioMain.address, value: Utils.toWei('3000')});

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            await quoteToken.connect(trader2).approve(portfolioMain.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolioMain.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals), 0);

            await f.addTradePair(exchange, pair, pairSettings)

            await tradePairs.connect(owner).addOrderType(tradePairId, 0);

            //Empty order book with a BUY Market order
            await expect(tradePairs.connect(trader1)
                .addOrder(trader1.address, clientOrderid, tradePairId, 0, Utils.parseUnits('10', baseDecimals), 0, 0, type2))
                        .to.be.revertedWith("T-LTMT-01");
            //Empty order book with a SELL Market order
            await expect(tradePairs.connect(trader1)
                .addOrder(trader1.address, clientOrderid, tradePairId, 0, Utils.parseUnits('10', baseDecimals), 0, 1, type2))
                        .to.be.revertedWith("T-LTMT-01");


            let tx = await tradePairs.connect(trader1)
                    .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('15', baseDecimals), 1, 1, type2);  // SELL, LIMIT ORDER

            const clientOrderid2 = await Utils.getClientOrderId(ethers.provider, trader1.address);
            tx = await tradePairs.connect(trader2)
                    .addOrder(trader2.address, clientOrderid2, tradePairId, 0, Utils.parseUnits('10', baseDecimals), 0, 0, 1);  // BUY, MARKET ORDER , FOK (FOK-Will be ignored)
            const res: any = await tx.wait();

            for (const e of res.events) {
                if (e.event === "OrderStatusChanged" ){
                    if (e.args.traderaddress === trader1.address) {

                        expect(e.args.pair).to.be.equal(tradePairId);
                        expect(e.args.clientOrderId).to.be.equal(clientOrderid);
                        expect(e.args.traderaddress).to.be.equal(trader1.address);
                        expect(e.args.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
                        expect(e.args.totalamount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
                        expect(e.args.quantity).to.be.equal(Utils.parseUnits('15', baseDecimals));
                        expect(e.args.side).to.be.equal(1);              // side is SELL=1
                        expect(e.args.type1).to.be.equal(1);             // type1 is LIMIT=1
                        expect(e.args.type2).to.be.equal(type2);            // type2 is GTC=0 ( FOK-is ignored!!!)
                        expect(e.args.status).to.be.equal(2);            // status is PARTIAL = 2
                        expect(e.args.quantityfilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
                        expect(e.args.totalfee).to.be.equal(Utils.parseUnits('2', quoteDecimals));  // 0.2% of 1000 = 2 QT

                        // getOrderByClientOrderId should return the same orders
                        const orderbyCl1= await tradePairs.getOrderByClientOrderId(trader1.address, clientOrderid);
                        expect(e.args.orderId).to.be.equal(orderbyCl1.id);

                    }else if  (e.args.traderaddress === trader2.address) {
                        expect(e.args.pair).to.be.equal(tradePairId);
                        expect(e.args.clientOrderId).to.be.equal(clientOrderid2);
                        expect(e.args.traderaddress).to.be.equal(trader2.address);
                        expect(e.args.price).to.be.equal(0);  // MARKET PRICE = 0
                        expect(e.args.totalamount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
                        expect(e.args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
                        expect(e.args.side).to.be.equal(0);              // side is BUY=0
                        expect(e.args.type1).to.be.equal(0);             // type1 is MARKET=0
                        expect(e.args.type2).to.be.equal(0);            // type2 is GTC=0
                        expect(e.args.status).to.be.equal(3);            // status is FILLED = 3
                        expect(e.args.quantityfilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
                        expect(e.args.totalfee).to.be.equal(Utils.parseUnits('0.03', baseDecimals));  // 0.3% of 10 = 0.03 AVAX

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

            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100.1234', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("T-TMDP-01");
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

            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10.1234', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("T-TMDQ-01");
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

            expect(portfolioMain.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, quoteDecimals,  '0', ethers.utils.parseUnits('0.5',quoteDecimals),false)).to.be.revertedWith("P-TSDM-01");
            expect(portfolio.addToken(Utils.fromUtf8(quoteTokenStr), quoteAssetAddr, srcChainId, quoteDecimals, mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals),Utils.fromUtf8(quoteTokenStr))).to.be.revertedWith("P-TSDM-01");

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

            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            let type2=0; // GTC

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));

            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)
            await trader2.sendTransaction({to: portfolioMain.address, value: Utils.toWei('3000')});

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)
            await quoteToken.connect(trader2).approve(portfolioMain.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolioMain.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals), 0);

            await f.addTradePair(exchange, pair, pairSettings)

            await tradePairs.connect(owner).addOrderType(tradePairId, 0);

            await tradePairs.connect(owner).postOnly(tradePairId, true);

            // fail if order type is not PO
            await expect(tradePairs.connect(trader1)
                .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('15', baseDecimals), 1, 1, type2))
                .to.be.revertedWith("T-POOA-01");  // SELL, LIMIT ORDER

            // succeed if order is a PO type
            type2=3; // PO
            await tradePairs.connect(trader1)
                .addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('15', baseDecimals), 1, 1, type2);  // SELL, PO ORDER
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
            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("T-PPAU-01");
            // fail paused
            await tradePairs.connect(owner).pause();
            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause();
            // unpause to succeed
            await tradePairs.connect(owner).pauseTradePair(tradePairId, false);
            // succeed addOrder
            await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2);
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
            await expect(tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2))
                .to.be.revertedWith("T-AOPA-01");

            await tradePairs.connect(owner).pauseAddOrder(tradePairId, false);
            await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1, type2);
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
            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
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

            // add two buy orders
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.orderId;

            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const tx2 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res2: any = await tx2.wait();
            const id2 = res2.events[1].args.orderId;
            // cannot cancel tradePairs is paused
            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1).cancelOrder(id1)).to.be.revertedWith("Pausable: paused");
            await tradePairs.connect(owner).unpause()
            // 0address order will revert from ownership check
            await expect(tradePairs.connect(trader1).cancelOrder(ethers.constants.HashZero )).to.be.revertedWith("T-OAEX-01");
            // cannot cancel order for somebody else
            await expect(tradePairs.connect(owner).cancelOrder(id1)).to.be.revertedWith("T-OOCC-01");
            // Ignore empty orders
            await expect(tradePairs.connect(trader1).cancelOrderList([ethers.constants.HashZero , ethers.constants.HashZero ]));
            // cannot cancel all for somebody else
            await expect(tradePairs.connect(owner).cancelOrderList([id1, id2])).to.be.revertedWith("T-OOCC-02");
        });

        it("Should be able to use cancelOrder(), cancelOrderList() and cancelReplaceOrders() correctly", async function () {
            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            let type2=0 ;// GTC
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
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.orderId;
            // set auction mode to OPEN
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 2);  // auction is OPEN

            // cannot cancel and replace tradePairs is paused
            await tradePairs.connect(owner).pause()
            await expect(tradePairs.connect(trader1)
                .cancelReplaceOrder(ethers.constants.HashZero , clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("Pausable: paused");
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
            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader2.address);
            await expect(tradePairs.connect(trader2).addOrder(trader2.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 1, 1, type2))
                .to.be.revertedWith("P-AFNE-02");

            // mint some tokens for trader1
            await quoteToken.mint(trader2.address, Utils.parseUnits('20000', quoteDecimals));

            // deposit some native to portfolio for trader2
            await trader2.sendTransaction({to: portfolioMain.address, value: Utils.toWei('3000')});
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
            // fail to cancel a matched order via cancelOrderList()
            await tradePairs.connect(trader1).cancelOrderList([id1]);
            // fail to cancel a matched order via cancelReplaceOrder()
            await tradePairs.connect(owner).setAuctionMode(tradePairId, 2);  // auction is OPEN
            clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            await expect(tradePairs.connect(trader1)
                 .cancelReplaceOrder(id1, clientOrderid, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OAEX-01");
        });

        it("Should be able to use cancelReplaceOrder() even when Available==0", async function () {
            let clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC

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
            const tx1 = await tradePairs.connect(trader1).addOrder(trader1.address, clientOrderid, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1, type2);
            const res1: any = await tx1.wait();
            const id1 = res1.events[1].args.orderId;
            console.log(id1);

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
console.log(id3);
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

            //Original order removed
            expect((await tradePairs.getOrder(id3)).id).to.be.equal(ethers.constants.HashZero );

            prtfBaseBalance = await portfolio.getBalance(trader1.address, baseSymbol);
            expect(prtfBaseBalance[0]).to.equal(Utils.parseUnits('100', baseDecimals));
            expect(prtfBaseBalance[1]).to.equal(Utils.parseUnits('10', baseDecimals));
        });

        it("Should be able to use unsolicitedCancel() correctly", async function () {
            const clientOrderid = await Utils.getClientOrderId(ethers.provider, trader1.address);
            const type2=0 ;// GTC
            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));
            // deposit some native to portfolio for trader1
            await f.depositNative(portfolioMain, trader1, defaultNativeDeposit)

            // deposit some tokens to portfolio for trader1
            await f.depositToken(portfolioMain, trader1, quoteToken, quoteDecimals, quoteSymbol, defaultTokenDeposit)

            await f.addTradePair(exchange, pair, defaultPairSettings)

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

            await expect(tradePairs.unsolicitedCancel(tradePairId, isBuyBook, 10)).to.be.revertedWith("T-PPAU-04");
            // should succeed even when tradePairs is paused
            await tradePairs.pauseTradePair(tradePairId, true);

            const tx = await tradePairs.connect(owner).unsolicitedCancel(tradePairId, isBuyBook, 10);
            const res: any = await tx.wait();

            for (const e of res.events) {
                if (e.event ==='OrderStatusChanged') {
                    expect(e.args.status).to.be.equal(4);
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
});
