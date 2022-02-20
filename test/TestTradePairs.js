/**
 * The test runner for Dexalot TradePairs contract
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const Utils = require('./utils.js');

describe("TradePairs", function () {
    let MockToken;
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
        Portfolio = await ethers.getContractFactory("Portfolio");
        TradePairs = await ethers.getContractFactory("TradePairs");
        OrderBooks = await ethers.getContractFactory("OrderBooks");
    });

    beforeEach(async function () {
        [owner, admin, auctionAdmin, trader1, trader2, foundationSafe] = await ethers.getSigners();

        portfolio = await upgrades.deployProxy(Portfolio);
        orderBooks = await upgrades.deployProxy(OrderBooks);
        tradePairs = await upgrades.deployProxy(TradePairs, [orderBooks.address, portfolio.address]);

        await portfolio.setFeeAddress(foundationSafe.address);

        await orderBooks.transferOwnership(tradePairs.address)
        await tradePairs.transferOwnership(admin.address)

        await portfolio.addAdmin(admin.address);
        await portfolio.addAdmin(tradePairs.address);
    });

    describe("TradePairs", function () {

        it("Should get owner correctly", async function () {
            expect(await tradePairs.owner()).to.be.equal(admin.address);
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
            quoteAssetAddr = quoteToken.address;

            await expect(tradePairs.addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                 quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                                                .to.revertedWith("Ownable: caller is not the owner");

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            expect((await tradePairs.getTradePairs())[0]).to.be.equal(tradePairId);

            expect(await tradePairs.getSymbol(tradePairId, 1)).to.be.equal(baseSymbol);
            expect(await tradePairs.getSymbol(tradePairId, 0)).to.be.equal(quoteSymbol);
            expect(await tradePairs.getDecimals(tradePairId, 1)).to.be.equal(baseDecimals);
            expect(await tradePairs.getDecimals(tradePairId, 0)).to.be.equal(quoteDecimals);
            expect(await tradePairs.getDisplayDecimals(tradePairId, 1)).to.be.equal(baseDisplayDecimals);
            expect(await tradePairs.getDisplayDecimals(tradePairId, 0)).to.be.equal(quoteDisplayDecimals);

            expect(await tradePairs.getMinTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(minTradeAmount.toString(), quoteDecimals));
            expect(await tradePairs.getMaxTradeAmount(tradePairId)).to.be.equal(Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals));

            expect((await tradePairs.getAuctionData(tradePairId))[0]).to.be.equal(mode);
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

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).updateRate(tradePairId, mRate, 0)).to.revertedWith("Ownable: caller is not the owner");
            await expect(tradePairs.connect(trader2).updateRate(tradePairId, tRate, 1)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).updateRate(tradePairId, mRate, 0);
            expect(await tradePairs.getMakerRate(tradePairId)).to.be.equal(mRate);
            await tradePairs.connect(admin).updateRate(tradePairId, tRate, 1);
            expect(await tradePairs.getTakerRate(tradePairId)).to.be.equal(tRate);
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

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);


            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).addOrderType(tradePairId, 0)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).addOrderType(tradePairId, ethers.BigNumber.from(0));
            await tradePairs.connect(admin).addOrderType(tradePairId, ethers.BigNumber.from(1));
            let allowedOrderTypes = await tradePairs.getAllowedOrderTypes(tradePairId);
            expect(allowedOrderTypes.length).to.be.equal(3);
            expect(allowedOrderTypes[0]).to.be.equal(ethers.BigNumber.from(1));
            expect(allowedOrderTypes[1]).to.be.equal(ethers.BigNumber.from(4));
            expect(allowedOrderTypes[2]).to.be.equal(ethers.BigNumber.from(0));
            await tradePairs.connect(admin).removeOrderType(tradePairId, ethers.BigNumber.from(0));
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

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let minTradeAmount1 = Utils.parseUnits('50', quoteDecimals);
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setMinTradeAmount(tradePairId, minTradeAmount1)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).setMinTradeAmount(tradePairId, minTradeAmount1);
            expect(await tradePairs.getMinTradeAmount(tradePairId)).to.be.equal(minTradeAmount1);
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

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let maxTradeAmount1 = Utils.parseUnits('250', quoteDecimals);
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setMinTradeAmount(tradePairId, maxTradeAmount1)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).setMinTradeAmount(tradePairId, maxTradeAmount1);
            expect(await tradePairs.getMinTradeAmount(tradePairId)).to.be.equal(maxTradeAmount1);
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

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let displayDecimals = 2;
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, 1)).to.revertedWith("Ownable: caller is not the owner");
            await expect(tradePairs.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, 0)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).setDisplayDecimals(tradePairId, displayDecimals, 1);
            expect(await tradePairs.getDisplayDecimals(tradePairId, 1)).to.be.equal(displayDecimals);
            await tradePairs.connect(admin).setDisplayDecimals(tradePairId, displayDecimals, 0);
            expect(await tradePairs.getDisplayDecimals(tradePairId, 0)).to.be.equal(displayDecimals);
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

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let allowedSlippagePercent = 25;
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setAllowedSlippagePercent(tradePairId, allowedSlippagePercent)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).setAllowedSlippagePercent(tradePairId, allowedSlippagePercent);
            expect(await tradePairs.getAllowedSlippagePercent(tradePairId)).to.be.equal(allowedSlippagePercent);
        });

        it("Should be able to add a new buy order from the trader accounts", async function () {
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

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let tx = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1);
            let res = await tx.wait();
            expect(res.events[1].event).to.be.equal('OrderStatusChanged');
            expect(res.events[1].args.pair).to.be.equal(tradePairId);
            expect(res.events[1].args.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
            expect(res.events[1].args.totalamount).to.be.equal(0);      // not executed, yet, so totalamount is 0
            expect(res.events[1].args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
            expect(res.events[1].args.side).to.be.equal(0);             // side is BUY=0
            expect(res.events[1].args.type1).to.be.equal(1);            // type1 is LIMIT=1
            expect(res.events[1].args.status).to.be.equal(0);           // status is NEW = 0
            expect(res.events[1].args.quantityfilled).to.be.equal(0);   // not executed, yet, so quantityfilled is 0
            expect(res.events[1].args.totalfee).to.be.equal(0);         // not executed, yet, so free is 0
        });

        it("Should be able to add a new sell order from the trader accounts", async function () {
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

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let tx = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 1, 1);
            let res = await tx.wait();
            expect(res.events[1].event).to.be.equal('OrderStatusChanged');
            expect(res.events[1].args.pair).to.be.equal(tradePairId);
            expect(res.events[1].args.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
            expect(res.events[1].args.totalamount).to.be.equal(0);      // not executed, yet, so totalamount is 0
            expect(res.events[1].args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
            expect(res.events[1].args.side).to.be.equal(1);             // side is SELL=1
            expect(res.events[1].args.type1).to.be.equal(1);            // type1 is LIMIT=1
            expect(res.events[1].args.status).to.be.equal(0);           // status is NEW = 0
            expect(res.events[1].args.quantityfilled).to.be.equal(0);   // not executed, yet, so quantityfilled is 0
            expect(res.events[1].args.totalfee).to.be.equal(0);         // not executed, yet, so free is 0
        });

        it("Should be able to add an order and cancel it from the trader accounts", async function () {
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

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            // add a new order
            let tx1 = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1);
            let res1 = await tx1.wait();
            // get if of the order
            let id = res1.events[1].args.id;
            // cancel the order
            let tx2 = await tradePairs.connect(trader1).cancelOrder(tradePairId, id);
            let res2 = await tx2.wait();
            expect(res2.events[1].args.status).to.be.equal(4);           // status is CANCELED = 4
        });

        it("Should be able to add an order and cancel it from the trader accounts", async function () {
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

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            // add the first new order
            let tx1 = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('5', baseDecimals), 0, 1);
            let res1 = await tx1.wait();
            // get id of the first order
            let id1 = res1.events[1].args.id;
            // add the second new order
            let tx2 = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('5', baseDecimals), 0, 1);
            let res2 = await tx2.wait();
            // get id of the second order
            let id2 = res2.events[1].args.id;
            // cancel all orders
            let tx3 = await tradePairs.connect(trader1).cancelAllOrders(tradePairId, [id1, id2]);
            let res3 = await tx3.wait();
            // verify cancellation of id1
            expect(res3.events[1].args.status).to.be.equal(4);           // status is CANCELED = 4
            // verify cancellation of id2
            expect(res3.events[3].args.status).to.be.equal(4);           // status is CANCELED = 4
        });

        it("Should revert when price has more decimals then quote display decimals", async function () {
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

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            await expect(tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100.1234', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1))
                .revertedWith("T-TMDP-01");
        });

        it("Should revert when quantity has more decimals then base display decimals", async function () {
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

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            await expect(tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10.1234', baseDecimals), 0, 1))
                .revertedWith("T-TMDQ-01");
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

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let auctionMode = 4;
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setAuctionMode(tradePairId, auctionMode)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).setAuctionMode(tradePairId, auctionMode);
            let auctionData = await tradePairs.getAuctionData(tradePairId);
            expect(auctionData[0]).to.be.equal(auctionMode);
        });

        it("Should pause and unpause TradePairs from the admin account", async function () {
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).pause()).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).pause();
            expect(await tradePairs.paused()).to.be.equal(true);
            await tradePairs.connect(admin).unpause();
            expect(await tradePairs.paused()).to.be.equal(false);
        });

        it("Should pause a trade pair from admin account", async function () {
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

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);


            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).pauseTradePair(tradePairId, true)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).pauseTradePair(tradePairId, true);
            await expect(tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1))
                .revertedWith("T-PPAU-01");
            await tradePairs.connect(admin).pauseTradePair(tradePairId, false);
            await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1);
        });

        it("Should pause addOrder for a trade pair from admin account", async function () {
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

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader1.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader1.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);


            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).pauseAddOrder(tradePairId, true)).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).pauseAddOrder(tradePairId, true);
            await expect(tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1))
                .revertedWith("T-AOPA-01");
            await tradePairs.connect(admin).pauseAddOrder(tradePairId, false);
            await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1);
        });

    });
});
