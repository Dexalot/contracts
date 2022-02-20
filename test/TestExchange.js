/**
 * The test runner for Dexalot Exchange contract
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const Utils = require('./utils.js');

describe("Exchange", function () {
    let MockToken;
    let Exchange;
    let exchange;
    let Portfolio;
    let portfolio;
    let TradePairs;
    let tradePairs;
    let OrderBooks;
    let orderBooks;
    let baseToken;
    let quoteToken;
    let owner;
    let admin;
    let auctionAdmin;
    let trader1;
    let trader2;
    let foundationSafe;

    before(async function () {
        MockToken = await ethers.getContractFactory("MockToken");
        Exchange = await ethers.getContractFactory("Exchange");
        Portfolio = await ethers.getContractFactory("Portfolio");
        TradePairs = await ethers.getContractFactory("TradePairs");
        OrderBooks = await ethers.getContractFactory("OrderBooks");
    });

    beforeEach(async function () {
        [owner, admin, auctionAdmin, trader1, trader2, foundationSafe] = await ethers.getSigners();

        exchange = await upgrades.deployProxy(Exchange);
        portfolio = await upgrades.deployProxy(Portfolio);
        orderBooks = await upgrades.deployProxy(OrderBooks);
        tradePairs = await upgrades.deployProxy(TradePairs, [orderBooks.address, portfolio.address]);

        await portfolio.setFeeAddress(foundationSafe.address);
        await exchange.setPortfolio(portfolio.address);
        await exchange.setTradePairs(tradePairs.address);

        await orderBooks.transferOwnership(tradePairs.address)
        await tradePairs.transferOwnership(exchange.address)

        await portfolio.addAdmin(exchange.address);
        await portfolio.addAdmin(tradePairs.address);
    });

    describe("Exchange", function () {

        it("Should get owner correctly", async function () {
            expect(await exchange.owner()).to.be.equal(owner.address);
        });

        it("Should add and remove admin correctly", async function () {
            await exchange.addAdmin(trader1.address)
            expect(await exchange.isAdmin(trader1.address)).to.be.equal(true);
            await exchange.removeAdmin(trader1.address)
            expect(await exchange.isAdmin(trader1.address)).to.be.equal(false);
        });

        it("Should add and remove auction admin correctly", async function () {
            await exchange.addAuctionAdmin(trader2.address)
            expect(await exchange.isAuctionAdmin(trader2.address)).to.be.equal(true);
            await exchange.removeAuctionAdmin(trader2.address)
            expect(await exchange.isAuctionAdmin(trader2.address)).to.be.equal(false);
        });

        it("Should set chainlink price feed correctly by auction admin", async function () {
            let chainlinkMainnetAVAXUSD = "0x0A77230d17318075983913bC2145DB16C7366156";
            // fail before auction admin is added
            await expect(exchange.connect(auctionAdmin).setPriceFeed(chainlinkMainnetAVAXUSD)).to.revertedWith("E-OACC-24");
            await exchange.addAuctionAdmin(auctionAdmin.address);
            // succeed after auction admin is added
            await exchange.connect(auctionAdmin).setPriceFeed(chainlinkMainnetAVAXUSD)
            expect(await exchange.getPriceFeed()).to.be.equal(chainlinkMainnetAVAXUSD);
        });

        it("Should update deposit and withdrawal rates by admin correctly", async function () {
            const dRate = ethers.BigNumber.from(5);
            const wRate = ethers.BigNumber.from(10);
            // fail from non admin accounts
            await expect(exchange.connect(trader1).updateTransferFeeRate(dRate, 0)).to.revertedWith("E-OACC-03");
            await expect(exchange.connect(trader2).updateTransferFeeRate(dRate, 1)).to.revertedWith("E-OACC-03");
            // succeed from admin accounts
            await exchange.updateTransferFeeRate(dRate, 0);
            expect(await portfolio.getDepositFeeRate()).to.be.equal(dRate);
            await exchange.updateTransferFeeRate(wRate, 1);
            expect(await portfolio.getWithdrawFeeRate()).to.be.equal(wRate);
        });

        it("Should be able to add native as base asset and ERC20 as quote asset", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            //await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            //await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            expect(await exchange.getTradePairsAddr()).to.be.equal(tradePairs.address);
            expect((await exchange.getTradePairs())[0]).to.be.equal(tradePairId);

            expect(await exchange.getSymbol(tradePairId, 1)).to.be.equal(baseSymbol);
            expect(await exchange.getSymbol(tradePairId, 0)).to.be.equal(quoteSymbol);
            expect(await exchange.getDecimals(tradePairId, 1)).to.be.equal(baseDecimals);
            expect(await exchange.getDecimals(tradePairId, 0)).to.be.equal(quoteDecimals);
            expect(await exchange.getDisplayDecimals(tradePairId, 1)).to.be.equal(baseDisplayDecimals);
            expect(await exchange.getDisplayDecimals(tradePairId, 0)).to.be.equal(quoteDisplayDecimals);

            expect(await exchange.getMinTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(minTradeAmount.toString(), quoteDecimals));
            expect(await exchange.getMaxTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals));

            expect((await exchange.getAuctionData(tradePairId))[0]).to.be.equal(mode);
        });

        it("Should be able to add ERC20 as base asset and ERC20 as quote asset", async function () {
            let baseTokenStr = "Base Token";
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals);
            baseAssetAddr = baseToken.address;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            expect(await exchange.getTradePairsAddr()).to.be.equal(tradePairs.address);
            expect((await exchange.getTradePairs())[0]).to.be.equal(tradePairId);

            expect(await exchange.getSymbol(tradePairId, 1)).to.be.equal(baseSymbol);
            expect(await exchange.getSymbol(tradePairId, 0)).to.be.equal(quoteSymbol);
            expect(await exchange.getDecimals(tradePairId, 1)).to.be.equal(baseDecimals);
            expect(await exchange.getDecimals(tradePairId, 0)).to.be.equal(quoteDecimals);
            expect(await exchange.getDisplayDecimals(tradePairId, 1)).to.be.equal(baseDisplayDecimals);
            expect(await exchange.getDisplayDecimals(tradePairId, 0)).to.be.equal(quoteDisplayDecimals);

            expect(await exchange.getMinTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(minTradeAmount.toString(), quoteDecimals));
            expect(await exchange.getMaxTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals));

            expect((await exchange.getAuctionData(tradePairId))[0]).to.be.equal(mode);
        });

        it("Should be able to add ERC20 as base asset and native as quote asset", async function () {
            let baseTokenStr = "Base Token";
            let baseSymbolStr = "BT";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 6;
            let baseDisplayDecimals = 3;

            let quoteSymbolStr = "AVAX"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 18;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals);
            baseAssetAddr = baseToken.address;

            quoteAssetAddr = "0x0000000000000000000000000000000000000000";

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            expect(await exchange.getTradePairsAddr()).to.be.equal(tradePairs.address);
            expect((await exchange.getTradePairs())[0]).to.be.equal(tradePairId);

            expect(await exchange.getSymbol(tradePairId, 1)).to.be.equal(baseSymbol);
            expect(await exchange.getSymbol(tradePairId, 0)).to.be.equal(quoteSymbol);
            expect(await exchange.getDecimals(tradePairId, 1)).to.be.equal(baseDecimals);
            expect(await exchange.getDecimals(tradePairId, 0)).to.be.equal(quoteDecimals);
            expect(await exchange.getDisplayDecimals(tradePairId, 1)).to.be.equal(baseDisplayDecimals);
            expect(await exchange.getDisplayDecimals(tradePairId, 0)).to.be.equal(quoteDisplayDecimals);

            expect(await exchange.getMinTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(minTradeAmount.toString(), quoteDecimals));
            expect(await exchange.getMaxTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals));

            expect((await exchange.getAuctionData(tradePairId))[0]).to.be.equal(mode);
        });

        it("Should update maker and taker fee rates from the admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non admin accounts
            await expect(exchange.connect(trader1).updateRate(tradePairId, mRate, 0)).to.revertedWith("E-OACC-04");
            await expect(exchange.connect(trader2).updateRate(tradePairId, tRate, 1)).to.revertedWith("E-OACC-04");
            // succeed from admin accounts
            await exchange.updateRate(tradePairId, mRate, 0);
            expect(await exchange.getMakerRate(tradePairId)).to.be.equal(mRate);
            await exchange.updateRate(tradePairId, tRate, 1);
            expect(await exchange.getTakerRate(tradePairId)).to.be.equal(tRate);
        });

        it("Should update all maker and taker fee rates from the admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non admin accounts
            await expect(exchange.connect(trader1).updateAllRates(mRate, tRate)).to.revertedWith("E-OACC-21");
            // succeed from admin accounts
            await exchange.updateAllRates(mRate, tRate);
            expect(await exchange.getMakerRate(tradePairId)).to.be.equal(mRate);
            expect(await exchange.getTakerRate(tradePairId)).to.be.equal(tRate);
        });

        it("Should add and remove order types from the admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            // fail from non admin accounts
            await expect(exchange.connect(trader1).addOrderType(tradePairId, 0)).to.revertedWith("E-OACC-13");
            // succeed from admin accounts
            await exchange.addOrderType(tradePairId, ethers.BigNumber.from(0));
            await exchange.addOrderType(tradePairId, ethers.BigNumber.from(1));
            let allowedOrderTypes = await tradePairs.getAllowedOrderTypes(tradePairId);
            expect(allowedOrderTypes.length).to.be.equal(3);
            expect(allowedOrderTypes[0]).to.be.equal(ethers.BigNumber.from(1));
            expect(allowedOrderTypes[1]).to.be.equal(ethers.BigNumber.from(4));
            expect(allowedOrderTypes[2]).to.be.equal(ethers.BigNumber.from(0));
            await exchange.removeOrderType(tradePairId, ethers.BigNumber.from(0));
            allowedOrderTypes = await tradePairs.getAllowedOrderTypes(tradePairId);
            expect(allowedOrderTypes.length).to.be.equal(2);
            expect(allowedOrderTypes[0]).to.be.equal(ethers.BigNumber.from(1));
            expect(allowedOrderTypes[1]).to.be.equal(ethers.BigNumber.from(4));
        });

        it("Should set min trade amount from the admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let minTradeAmount1 = Utils.parseUnits('50', quoteDecimals);
            // fail from non admin accounts
            await expect(exchange.connect(trader1).setMinTradeAmount(tradePairId, minTradeAmount1)).to.revertedWith("E-OACC-15");
            // succeed from admin accounts
            await exchange.setMinTradeAmount(tradePairId, minTradeAmount1);
            expect(await exchange.getMinTradeAmount(tradePairId)).to.be.equal(minTradeAmount1);
        });

        it("Should set max trade amount from the admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let maxTradeAmount1 = Utils.parseUnits('10000', quoteDecimals);
            // fail from non admin accounts
            await expect(exchange.connect(trader1).setMaxTradeAmount(tradePairId, maxTradeAmount1)).to.revertedWith("E-OACC-16");
            // succeed from admin accounts
            await exchange.setMaxTradeAmount(tradePairId, maxTradeAmount1);
            expect(await exchange.getMaxTradeAmount(tradePairId)).to.be.equal(maxTradeAmount1);
        });

        it("Should set display decimals from the admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let displayDecimals = 2;
            // fail from non admin accounts
            await expect(exchange.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, 1)).to.revertedWith("E-OACC-17");
            await expect(exchange.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, 0)).to.revertedWith("E-OACC-17");
            // succeed from admin accounts
            await exchange.setDisplayDecimals(tradePairId, displayDecimals, 1);
            expect(await exchange.getDisplayDecimals(tradePairId, 1)).to.be.equal(displayDecimals);
            await exchange.setDisplayDecimals(tradePairId, displayDecimals, 0);
            expect(await exchange.getDisplayDecimals(tradePairId, 0)).to.be.equal(displayDecimals);
        });

        it("Should set allowed slippage percentage from the admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let allowedSlippagePercent = 25;
            // fail from non admin accounts
            await expect(exchange.connect(trader1).setAllowedSlippagePercent(tradePairId, allowedSlippagePercent)).to.revertedWith("E-OACC-18");
            // succeed from admin accounts
            await exchange.setAllowedSlippagePercent(tradePairId, allowedSlippagePercent);
            expect(await exchange.getAllowedSlippagePercent(tradePairId)).to.be.equal(allowedSlippagePercent);
        });

        it("Should add token from the admin account", async function () {
            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteDecimals = 6;
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let mode = 0;  // auction off

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);

            // fail from non admin accounts
            await expect(exchange.connect(trader1).addToken(quoteSymbol, quoteToken.address, mode)).to.revertedWith("E-OACC-19");
            // succeed from admin accounts
            await exchange.addToken(quoteSymbol, quoteToken.address, mode);
            let tokenList = await portfolio.getTokenList();
            expect(tokenList.length).to.be.equal(1);
            expect(tokenList[0]).to.be.equal(quoteSymbol);
        });

        it("Should set auction mode from the auction admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            await exchange.addAuctionAdmin(auctionAdmin.address);
            let auctionMode = 4;
            // fail from non admin accounts
            await expect(exchange.connect(trader1).setAuctionMode(tradePairId, auctionMode)).to.revertedWith("E-OACC-25");
            // succeed from admin accounts
            await exchange.connect(auctionAdmin).setAuctionMode(tradePairId, auctionMode);
            let auctionData = await exchange.getAuctionData(tradePairId);
            expect(auctionData[0]).to.be.equal(auctionMode);
        });

        it("Should set auction price from the auction admin account", async function () {
            let baseSymbolStr = "AVAX";
            let baseSymbol = Utils.fromUtf8(baseSymbolStr);
            let baseDecimals = 18;
            let baseDisplayDecimals = 3;

            let quoteTokenStr = "Quote Token";
            let quoteSymbolStr = "QT"
            let quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            let quoteDecimals = 6;
            let quoteDisplayDecimals = 3;

            let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`;
            let tradePairId = Utils.fromUtf8(tradePairStr);

            let minTradeAmount = 10;
            let maxTradeAmount = 100000;
            let mode = 0;  // auction off

            baseAssetAddr = "0x0000000000000000000000000000000000000000";

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await exchange.addTradePair(tradePairId, baseAssetAddr, baseDisplayDecimals,
                                        quoteAssetAddr, quoteDisplayDecimals,
                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            await exchange.addAuctionAdmin(auctionAdmin.address);
            let auctionPrice = Utils.parseUnits("4.16", quoteDecimals);
            let auctionPct = ethers.BigNumber.from(15);
            // fail from non admin accounts
            await expect(exchange.connect(trader1).setAuctionPrice(tradePairId, auctionPrice, auctionPct)).to.revertedWith("E-OACC-27");
            // succeed from admin accounts
            await exchange.connect(auctionAdmin).setAuctionPrice(tradePairId, auctionPrice, auctionPct);
            let auctionData = await exchange.getAuctionData(tradePairId);
            expect(auctionData[0]).to.be.equal(mode);
            expect(auctionData[1]).to.be.equal(auctionPrice);
            expect(auctionData[2]).to.be.equal(auctionPct);
        });

        it("Should convert string to bytes32 correctly", async function () {
            let test_text = "IS THIS CORRECT";
            expect(await exchange.stringToBytes32(test_text)).to.be.equal(ethers.utils.formatBytes32String(test_text));
        });

        it("Should convert bytes32 to string correctly", async function () {
            let test_text = "IS THIS CORRECT";
            expect(await exchange.bytes32ToString(ethers.utils.formatBytes32String(test_text))).to.be.equal(test_text);
        });

        it("Should pause and unpause portfolio from the admin account", async function () {
            // fail from non admin accounts
            await expect(exchange.connect(trader1).pausePortfolio(true)).to.revertedWith("E-OACC-08");
            // succeed from admin accounts
            await exchange.addAdmin(admin.address);
            await exchange.connect(admin).pausePortfolio(true);
            expect(await portfolio.paused()).to.be.equal(true);
            await exchange.connect(admin).pausePortfolio(false);
            expect(await portfolio.paused()).to.be.equal(false);
        });

        it("Should pause and unpause Portfolio deposit from the admin account", async function () {
            // fail from non admin accounts
            await expect(exchange.connect(trader1).pauseDeposit(true)).to.revertedWith("E-OACC-09");
            // succeed from admin accounts
            await exchange.addAdmin(admin.address);
            await exchange.connect(admin).pauseDeposit(true);
            await expect(owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei('1000')})).to.revertedWith("P-NTDP-01");
            await exchange.connect(admin).pauseDeposit(false);
            await owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei('1000')});
            let bal = await portfolio.getBalance(owner.address, Utils.fromUtf8("AVAX"));
            expect(bal.total).to.be.equal(Utils.toWei('1000'));
            expect(bal.available).to.be.equal(Utils.toWei('1000'));
        });

        it("Should pause and unpause TradePairs from the admin account", async function () {
            // fail from non admin accounts
            await expect(exchange.connect(trader1).pauseTrading(true)).to.revertedWith("E-OACC-10");
            // succeed from admin accounts
            await exchange.addAdmin(admin.address);
            await exchange.connect(admin).pauseTrading(true);
            expect(await tradePairs.paused()).to.be.equal(true);
            await exchange.connect(admin).pauseTrading(false);
            expect(await tradePairs.paused()).to.be.equal(false);
        });

        it("Should pause and unpause for upgrade from the admin account", async function () {
            // fail from non admin accounts
            await expect(exchange.connect(trader1).pauseForUpgrade(true)).to.revertedWith("E-OACC-08");
            // succeed from admin accounts
            await exchange.addAdmin(admin.address);
            await exchange.connect(admin).pauseForUpgrade(true);
            expect(await portfolio.paused()).to.be.equal(true);
            expect(await tradePairs.paused()).to.be.equal(true);
            await exchange.connect(admin).pauseForUpgrade(false);
            expect(await portfolio.paused()).to.be.equal(false);
            expect(await tradePairs.paused()).to.be.equal(false);
        });

    });
});
