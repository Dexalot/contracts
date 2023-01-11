/**
 * The test runner for Dexalot Exchange contract
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    ExchangeSub,
    MockToken,
    MockToken__factory,
    OrderBooks,
    PortfolioMain,
    PortfolioSub,
    TradePairs,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";

describe("Exchange Sub", function () {
    let MockToken: MockToken__factory;
    let exchange: ExchangeSub;
    let portfolio: PortfolioMain;
    let portfolioSub: PortfolioSub;
    let tradePairs: TradePairs;
    let orderBooks: OrderBooks;
    let baseToken: MockToken;
    let quoteToken: MockToken;
    let auctionToken: MockToken;


    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let quoteAssetAddr: any;

    const baseTokenStr = "Base Token";
    const baseSymbolStr = "BT"
    const baseSymbol = Utils.fromUtf8(baseSymbolStr);
    const baseDecimals = 18;
    const baseDisplayDecimals = 3;

    const quoteTokenStr = "Quote Token";
    const quoteSymbolStr = "QT"
    const quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
    const quoteDecimals = 6;
    const quoteDisplayDecimals = 3;

    const auctionTokenStr = "Auction Token";
    const auctionSymbolStr = "AT"
    const auctionSymbol = Utils.fromUtf8(auctionSymbolStr);
    const auctionDecimals = 18;
    const auctionDisplayDecimals = 3;

    const tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
    const tradePairId = Utils.fromUtf8(tradePairStr);

    const auctionTradePairId = Utils.fromUtf8(`${auctionSymbolStr}/${quoteSymbolStr}`);

    const srcChainId = 1;
    const minTradeAmount = 10;
    const maxTradeAmount = 100000;
    const mode: any = 0;  // auction off

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

    const auctionPair = {
        baseSymbol: auctionSymbol,
        baseDecimals: auctionDecimals,
        baseDisplayDecimals: auctionDisplayDecimals,
        quoteSymbol,
        quoteDecimals,
        quoteDisplayDecimals,
        tradePairId: auctionTradePairId
    }

    const auctionPairSettings = {
        minTradeAmount,
        maxTradeAmount,
        mode: 2
    }



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
        const {portfolioMain: portfolioM, portfolioSub: portfolioS} = await f.deployCompletePortfolio();
        portfolio = portfolioM;
        portfolioSub = portfolioS
        orderBooks = await f.deployOrderBooks()
        exchange = await f.deployExchangeSub(portfolioSub, orderBooks)
        tradePairs = await f.deployTradePairs(orderBooks, portfolioSub, exchange);
        await exchange.addAuctionAdmin(auctionAdmin.address);

        baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals);
        quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);


    });

    describe("Exchange", function () {
        it("Should not initialize again after deployment", async function () {
            await expect(exchange.initialize()).to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("Should pause and unpause for upgrade from the admin account", async function () {
            // fail from non admin accounts
            await expect(exchange.connect(trader1).pauseForUpgrade(true)).to.revertedWith("AccessControl:");
            // succeed from admin accounts
            await exchange.addAdmin(admin.address);
            await exchange.connect(admin).pauseForUpgrade(true);
            expect(await portfolioSub.paused()).to.be.true;
            expect(await tradePairs.paused()).to.be.true;
            await exchange.connect(admin).pauseForUpgrade(false);
            expect(await portfolioSub.paused()).to.be.false;
            expect(await tradePairs.paused()).to.be.false;
        });

        it("Should use setOrderBooks correctly", async function () {
            // fail from non admin accounts
            await expect(exchange.connect(trader1).setOrderBooks(orderBooks.address)).to.revertedWith("AccessControl:");
            // fail if address is zero
            const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
            await expect(exchange.setOrderBooks(ZERO_ADDRESS)).to.revertedWith("E-OIZA-01");
            // succeed from admin account
            await exchange.setOrderBooks(orderBooks.address);
            //.to.emit(Exchange, "GasAmountChanged");  // FIXME emit event in contract and check here
            expect(await exchange.getOrderBooks()).to.be.equal(orderBooks.address);
        });

        it("Should check if the base and quote assets are already added in addTradePair", async function () {
            await f.addToken(portfolioSub, baseToken, 0.1, mode);
            await f.addToken(portfolioSub, quoteToken, 0.1, mode);
            // non existing base symbol
            await expect(exchange.connect(auctionAdmin).addTradePair(tradePairId, Utils.fromUtf8("BTWD"), baseDisplayDecimals,
                                               quoteSymbol, quoteDisplayDecimals,
                                               Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                               Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                  .to.be.revertedWith("E-TNAP-01");

            // non existing quote symbol
            await expect(exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                                               Utils.fromUtf8("QTWD"), quoteDisplayDecimals,
                                               Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                               Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                .to.be.revertedWith("E-TNAP-01");
        });

        it("Should check if the base and quote display decimals <= evm decimals ", async function () {
            await f.addToken(portfolioSub, baseToken, 0.1, mode);
            await f.addToken(portfolioSub, quoteToken, 0.1, mode);
            // base symbol with 19 display decimals
            await expect(exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, 19,
                                               quoteSymbol, quoteDisplayDecimals,
                                               Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                               Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                  .to.be.revertedWith("E-TNAP-01");

            // quote symbol with 19 display decimals
            await expect(exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                                               quoteSymbol, 7,
                                               Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                               Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                .to.be.revertedWith("E-TNAP-01");
        });


        it("Should check if the base and quote assets are in correct auction modes in addTradePair", async function () {
            const mode2: any = 2;  // auction on

            await f.addToken(portfolioSub, baseToken, 0.1, mode2);
            await f.addToken(portfolioSub, quoteToken, 0.1, mode);

            const baseTokenWA = await MockToken.deploy("BToken WA", "BTWA", baseDecimals);   // for wrong auction mode
            const quoteTokenWA = await MockToken.deploy("QToken WA", "QTWA", quoteDecimals); // for wrong auction mode

            await f.addToken(portfolioSub, baseTokenWA, 0.1, mode);
            await f.addToken(portfolioSub, quoteTokenWA, 0.1, mode2);

            // fail due to non zero auction mode for quote
            await expect(exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                                               Utils.fromUtf8("QTWA"), quoteDisplayDecimals,
                                               Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                               Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                  .to.be.revertedWith("E-TNSA-01");

            // fail due to non zero auction mode for quote
            await expect(exchange.connect(auctionAdmin).addTradePair(tradePairId, Utils.fromUtf8("BTWA"), baseDisplayDecimals,
                                               Utils.fromUtf8("QTWA"), quoteDisplayDecimals,
                                               Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                               Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode2))
                  .to.be.revertedWith("E-TNSA-01");

            // succeed for the correct auction modes
            await exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                                        quoteSymbol, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode2)
        });

        it("Should be able to add native as base asset and ERC20 as quote asset", async function () {
            const baseSymbolStr = "AVAX";
            const baseSymbol = Utils.fromUtf8(baseSymbolStr);
            const baseDecimals = 18;
            const baseDisplayDecimals = 3;


            await f.addToken(portfolioSub, quoteToken, 0.1, mode);

            // fail from non-privileged account
            // trader1
            await expect(exchange.connect(trader1).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                        quoteSymbol, quoteDisplayDecimals,
                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                  .to.be.revertedWith("E-OACC-01");

            // auctionAdmin when removed
            await exchange.removeAdmin(auctionAdmin.address);
            await exchange.removeAuctionAdmin(auctionAdmin.address);
            await expect(exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                    quoteSymbol, quoteDisplayDecimals,
                     Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                     Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
              .to.be.revertedWith("E-OACC-01");

            // succeed from privileged account
            // auctionAdmin when added
            await exchange.addAuctionAdmin(auctionAdmin.address);
            await exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                                        quoteSymbol, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            expect(await exchange.getTradePairsAddr()).to.be.equal(tradePairs.address);
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
        });

        it("Should be able to add ERC20 as base asset and ERC20 as quote asset", async function () {

            const minTradeAmount = 10;
            const maxTradeAmount = 100000;
            await f.addToken(portfolioSub, baseToken, 0.1, mode);
            await f.addToken(portfolioSub, quoteToken, 0.1, mode);
            await exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                                        quoteSymbol, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            expect(await exchange.getTradePairsAddr()).to.be.equal(tradePairs.address);
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
        });

        it("Should be able to add ERC20 as base asset and native as quote asset", async function () {

            const quoteSymbolStr = "AVAX"
            const quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            const quoteDecimals = 18;
            const quoteDisplayDecimals = 3;

            const tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            const tradePairId = Utils.fromUtf8(tradePairStr);

            const minTradeAmount = 10;
            const maxTradeAmount = 100000;
            await f.addToken(portfolioSub, baseToken, 0.1, mode);

            await exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                                        quoteSymbol, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            expect(await exchange.getTradePairsAddr()).to.be.equal(tradePairs.address);
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
        });

        it("Should update maker and taker fee rates from the auction admin", async function () {

            await exchange.connect(auctionAdmin).addToken(baseSymbol, baseToken.address, srcChainId, await baseToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',baseDecimals))
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            auctionToken = await MockToken.deploy(auctionTokenStr, auctionSymbolStr, auctionDecimals);
            await exchange.connect(auctionAdmin).addToken(auctionSymbol, auctionToken.address, srcChainId, auctionDecimals, 2, '0', ethers.utils.parseUnits('0.5',auctionDecimals));
            await f.addTradePairFromExchange(exchange, auctionPair, auctionPairSettings)

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non owner accounts
            await expect(exchange.connect(trader1).updateRate(auctionTradePairId, mRate, 0)).to.be.revertedWith("AccessControl:");
            await expect(exchange.connect(trader2).updateRate(auctionTradePairId, tRate, 1)).to.be.revertedWith("AccessControl:");

            // Fail for non-auction pair
            await expect(exchange.connect(auctionAdmin).updateRate(tradePairId, mRate, 0)).to.be.revertedWith("E-OACC-04");
            await expect(exchange.connect(auctionAdmin).updateRate(tradePairId, tRate, 1)).to.be.revertedWith("E-OACC-04");

            // succeed from owner accounts
            await exchange.connect(auctionAdmin).updateRate(auctionTradePairId, mRate, 0);
            expect((await tradePairs.getTradePair(auctionTradePairId)).makerRate).to.be.equal(mRate);
            await exchange.connect(auctionAdmin).updateRate(auctionTradePairId, tRate, 1);
            expect((await tradePairs.getTradePair(auctionTradePairId)).takerRate).to.be.equal(tRate);

            // call with wrong rate type
            await expect(tradePairs.connect(owner).updateRate(auctionTradePairId, tRate, 2)).to.be.revertedWith("function was called with incorrect parameters");
        });

        it("Should update maker and taker fee rates simultaneously with updateRates() from the auction admin account", async function () {
            await exchange.connect(auctionAdmin).addToken(baseSymbol, baseToken.address, srcChainId, await baseToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',baseDecimals))
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            auctionToken = await MockToken.deploy(auctionTokenStr, auctionSymbolStr, auctionDecimals);
            await exchange.connect(auctionAdmin).addToken(auctionSymbol, auctionToken.address, srcChainId, auctionDecimals, 2, '0', ethers.utils.parseUnits('0.5',auctionDecimals));
            await f.addTradePairFromExchange(exchange, auctionPair, auctionPairSettings)

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non admin accounts
            await expect(exchange.connect(trader1).updateRates(auctionTradePairId, mRate, tRate)).to.revertedWith("AccessControl:");
            // auctionAdmin when removed
            await exchange.removeAdmin(auctionAdmin.address);
            await exchange.removeAuctionAdmin(auctionAdmin.address);
            await expect(exchange.connect(auctionAdmin).updateRates(auctionTradePairId, mRate, tRate)).to.revertedWith("AccessControl:");

            // succeed from admin accounts
            await exchange.addAuctionAdmin(auctionAdmin.address);  // add auctionAdmin as well
            // auctionAdmin
            // Fail for non-auction pair
            await expect(exchange.connect(auctionAdmin).updateRates(tradePairId, mRate, tRate)).to.revertedWith("E-OACC-04");
            await exchange.connect(auctionAdmin).updateRates(auctionTradePairId, mRate.mul(2), tRate.mul(2));
            expect((await tradePairs.getTradePair(auctionTradePairId)).makerRate).to.be.equal(mRate.mul(2));
            expect((await tradePairs.getTradePair(auctionTradePairId)).takerRate).to.be.equal(tRate.mul(2));

        });

        it("Should update all maker and taker fee rates from the admin account", async function () {

            await f.addToken(portfolioSub, baseToken, 0.1, mode);
            await f.addToken(portfolioSub, quoteToken, 0.1, mode);
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non admin accounts
            await expect(exchange.connect(trader1).updateAllRates(mRate, tRate)).to.revertedWith("AccessControl:");
            // succeed from admin accounts
            await exchange.updateAllRates(mRate, tRate);
            expect((await tradePairs.getTradePair(tradePairId)).makerRate).to.be.equal(mRate);
            expect((await tradePairs.getTradePair(tradePairId)).takerRate).to.be.equal(tRate);
        });

        it("Should set min trade amount from the auction admin", async function () {
            await exchange.connect(auctionAdmin).addToken(baseSymbol, baseToken.address, srcChainId, await baseToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',baseDecimals))
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            auctionToken = await MockToken.deploy(auctionTokenStr, auctionSymbolStr, auctionDecimals);
            await exchange.connect(auctionAdmin).addToken(auctionSymbol, auctionToken.address, srcChainId, auctionDecimals, 2, '0', ethers.utils.parseUnits('0.5',auctionDecimals));
            await f.addTradePairFromExchange(exchange, auctionPair, auctionPairSettings)

            const minTradeAmount1 = Utils.parseUnits('50', quoteDecimals);
            // fail from non owner accounts
            await expect(exchange.connect(trader1).setMinTradeAmount(auctionTradePairId, minTradeAmount1)).to.be.revertedWith("AccessControl:");
            // Fail for non-auction pair
            await expect(exchange.connect(auctionAdmin).setMinTradeAmount(tradePairId, minTradeAmount1)).to.revertedWith("E-OACC-04");
            // succeed from owner accounts
            await exchange.connect(auctionAdmin).setMinTradeAmount(auctionTradePairId, minTradeAmount1);
            expect(await exchange.getMinTradeAmount(auctionTradePairId)).to.be.equal(minTradeAmount1);
        });

        it("Should set max trade amount from the auction admin", async function () {
            await exchange.connect(auctionAdmin).addToken(baseSymbol, baseToken.address, srcChainId, await baseToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',baseDecimals))
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            auctionToken = await MockToken.deploy(auctionTokenStr, auctionSymbolStr, auctionDecimals);
            await exchange.connect(auctionAdmin).addToken(auctionSymbol, auctionToken.address, srcChainId, auctionDecimals, 2, '0', ethers.utils.parseUnits('0.5',auctionDecimals));
            await f.addTradePairFromExchange(exchange, auctionPair, auctionPairSettings)

            const maxTradeAmount1 = Utils.parseUnits('250', quoteDecimals);
            // fail from non owner accounts
            await expect(exchange.connect(trader1).setMaxTradeAmount(auctionTradePairId, maxTradeAmount1)).to.be.revertedWith("AccessControl:");
            // Fail for non-auction pair
            await expect(exchange.connect(auctionAdmin).setMaxTradeAmount(tradePairId, maxTradeAmount1)).to.revertedWith("E-OACC-04");
            // succeed from owner accounts
            await exchange.connect(auctionAdmin).setMaxTradeAmount(auctionTradePairId, maxTradeAmount1);
            expect(await exchange.getMaxTradeAmount(auctionTradePairId)).to.be.equal(maxTradeAmount1);
        });

        it("Should set and get tradepairs contract address correctly", async function () {
            // fail for non admin account
            await expect(exchange.connect(trader1).setTradePairs(tradePairs.address)).to.be.revertedWith("AccessControl:");
            // succeed for admin account
            await exchange.setTradePairs(tradePairs.address);
            expect(await exchange.getTradePairsAddr()).to.be.equal(tradePairs.address);
        });

        it("Should add token from the auction admin account", async function () {


            // fail from non admin accounts
            await expect(exchange.connect(trader1).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))).to.revertedWith("AccessControl:");
            await expect(exchange.addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))).to.be.revertedWith("AccessControl:");
            // succeed from admin accounts
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals));
            const tokenList = await portfolioSub.getTokenList();

            // AVAX is the first token in the list, refer deployPortfolioComplete
            expect(tokenList.length).to.be.equal(3);
            expect(tokenList[2]).to.be.equal(quoteSymbol);

        });

        it("Should set auction mode from the auction admin account", async function () {

            await exchange.connect(auctionAdmin).addToken(baseSymbol, baseToken.address, srcChainId, await baseToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',baseDecimals))
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            auctionToken = await MockToken.deploy(auctionTokenStr, auctionSymbolStr, auctionDecimals);
            await exchange.connect(auctionAdmin).addToken(auctionSymbol, auctionToken.address, srcChainId, auctionDecimals, 2, '0', ethers.utils.parseUnits('0.5',auctionDecimals));
            await f.addTradePairFromExchange(exchange, auctionPair, auctionPairSettings)

            const auctionMode = 4;
            // fail from non admin accounts
            await expect(exchange.connect(trader1).setAuctionMode(auctionTradePairId, auctionMode)).to.revertedWith("AccessControl:");

            // Fail for non-auction pair
            await expect(exchange.connect(auctionAdmin).setAuctionMode(tradePairId, auctionMode)).to.revertedWith("E-OACC-04");

            // succeed from admin accounts
            await exchange.connect(auctionAdmin).setAuctionMode(auctionTradePairId, auctionMode);
            const tradePairData = await tradePairs.getTradePair(auctionTradePairId) ;
            expect(tradePairData.auctionMode).to.be.equal(auctionMode);
        });

        it("Should set auction price from the auction admin account", async function () {

            await exchange.connect(auctionAdmin).addToken(baseSymbol, baseToken.address, srcChainId, await baseToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',baseDecimals))
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            auctionToken = await MockToken.deploy(auctionTokenStr, auctionSymbolStr, auctionDecimals);
            await exchange.connect(auctionAdmin).addToken(auctionSymbol, auctionToken.address, srcChainId, auctionDecimals, 2, '0', ethers.utils.parseUnits('0.5',auctionDecimals));
            await f.addTradePairFromExchange(exchange, auctionPair, auctionPairSettings)

            const auctionPrice = Utils.parseUnits("4.16", quoteDecimals);

            // fail from non admin accounts
            await expect(exchange.connect(trader1).setAuctionPrice(auctionTradePairId, auctionPrice)).to.revertedWith("AccessControl:");

            // Fail for non-auction pair
            await expect(exchange.connect(auctionAdmin).setAuctionPrice(tradePairId, auctionPrice)).to.revertedWith("E-OACC-04");

            // succeed from admin accounts
            await exchange.connect(auctionAdmin).setAuctionPrice(auctionTradePairId, auctionPrice);

            const tradePairData = await tradePairs.getTradePair(auctionTradePairId);
            expect(tradePairData.auctionMode).to.be.equal(auctionPairSettings.mode);
            expect(tradePairData.auctionPrice).to.be.equal(auctionPrice);

            // fail matchAuctionOrders() if not auction admin
            await expect(exchange.connect(admin).matchAuctionOrders(auctionTradePairId, 10)).to.be.revertedWith("AccessControl:");
        });

        it("Should pause and unpause all trading from the admin account", async function () {
            const {trader1} = await f.getAccounts();
            await f.addToken(portfolioSub, baseToken, 0.1, mode);
            await f.addToken(portfolioSub, quoteToken, 0.1, mode);
            quoteAssetAddr = quoteToken.address;
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            // fail from non admin accounts
            await expect(exchange.connect(trader1).pauseTrading(true)).to.be.revertedWith("AccessControl:");

            // // succeed from admin accounts
            await exchange.pauseTrading(true);
            expect(await tradePairs.paused()).to.be.true;
            await exchange.pauseTrading(false);
            expect(await tradePairs.paused()).to.be.false;
        });

        it("Should pause a specific trade pair from admin or auctionAdmin accounts based on mode", async function () {
            await exchange.connect(auctionAdmin).addToken(baseSymbol, baseToken.address, srcChainId, await baseToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',baseDecimals))
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))
            await f.addTradePair(tradePairs, pair, defaultPairSettings)

            auctionToken = await MockToken.deploy(auctionTokenStr, auctionSymbolStr, auctionDecimals);
            await exchange.connect(auctionAdmin).addToken(auctionSymbol, auctionToken.address, srcChainId, auctionDecimals, 2, '0', ethers.utils.parseUnits('0.5',auctionDecimals));
            await f.addTradePairFromExchange(exchange, auctionPair, auctionPairSettings)

            // fail as only admin can pause when auction is off (mode = 0)
            await exchange.removeAdmin(auctionAdmin.address);
            await expect(exchange.connect(trader1).pauseTradePair(tradePairId, false)).to.be.revertedWith("E-OACC-02");
            // fail as only admin can pause when auction is off (mode = 0)
            await expect(exchange.connect(auctionAdmin).pauseTradePair(tradePairId, false)).to.be.revertedWith("E-OACC-02");
            // succeed as only admin can pause when auction is off (mode = 0)
            await exchange.addAdmin(admin.address);
            await exchange.connect(admin).pauseTradePair(tradePairId, false);
            await exchange.connect(admin).pauseTradePair(tradePairId, true);
            // set auction mode to 4 (paused) by auction admin
            await expect(exchange.connect(admin).setAuctionMode(tradePairId,  4)).to.be.revertedWith("AccessControl:");
            // Fail for non-auction pair
            await expect(exchange.connect(auctionAdmin).setAuctionMode(tradePairId,  4)).to.revertedWith("E-OACC-04");


            // with auction mode set to 4 (paused) auction admin can pause a trade pair
            await expect(exchange.connect(admin).pauseTradePair(auctionTradePairId, false)).to.be.revertedWith("E-OACC-03");
            await exchange.connect(auctionAdmin).pauseTradePair(auctionTradePairId, false);
            await exchange.connect(auctionAdmin).pauseTradePair(auctionTradePairId, true);
        });

        it("Should fail matchAuctionOrder() for unauthorized access", async function () {
            const baseSymbolStr = "AVAX";
            const baseSymbol = Utils.fromUtf8(baseSymbolStr);
            const baseDecimals = 18;
            const baseDisplayDecimals = 3;
            const baseAssetAddr = "0x0000000000000000000000000000000000000000";
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));

            // add token to portfolio
            await f.addBaseAndQuoteTokens(portfolio, portfolioSub, baseSymbol, baseAssetAddr, baseDecimals, quoteSymbol, quoteAssetAddr, quoteDecimals, mode)

            await exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
                quoteSymbol, quoteDisplayDecimals,
                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            await expect(exchange.connect(trader1).matchAuctionOrders(tradePairId, 8)).to.be.revertedWith("AccessControl:");
            await expect(exchange.connect(owner).matchAuctionOrders(tradePairId, 8)).to.be.revertedWith("AccessControl:");
        });
    });
});
