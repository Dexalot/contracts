/**
 * The test runner for Dexalot TradePairs contract
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const Utils = require('./utils.js');

const ZERO_ACCT_ADDR = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

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

        it("Should not accept via fallback()", async function () {
            let ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
            let iface = new ethers.utils.Interface(ABI)
            let calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader2.address, Utils.toWei('100')])
            await expect(owner.sendTransaction({to: tradePairs.address, data: calldata}))
                .to.be.revertedWith("T-NFUN-01")
        })

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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await expect(tradePairs.addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                 quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                                                .to.be.revertedWith("Ownable: caller is not the owner");

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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            const mRate = ethers.BigNumber.from(5);
            const tRate = ethers.BigNumber.from(10);
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).updateRate(tradePairId, mRate, 0)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(tradePairs.connect(trader2).updateRate(tradePairId, tRate, 1)).to.be.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).updateRate(tradePairId, mRate, 0);
            expect(await tradePairs.getMakerRate(tradePairId)).to.be.equal(mRate);
            await tradePairs.connect(admin).updateRate(tradePairId, tRate, 1);
            expect(await tradePairs.getTakerRate(tradePairId)).to.be.equal(tRate);

            // call with wrong rate type
            await expect(tradePairs.connect(admin).updateRate(tradePairId, tRate, 2)).to.be.revertedWith("function was called with incorrect parameters");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);


            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).addOrderType(tradePairId, 0)).to.be.revertedWith("Ownable: caller is not the owner");
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
            // cannot remove limit orders
            await expect(tradePairs.connect(admin).removeOrderType(tradePairId, ethers.BigNumber.from(1)))
                         .to.be.revertedWith("T-LONR-01");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let minTradeAmount1 = Utils.parseUnits('50', quoteDecimals);
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setMinTradeAmount(tradePairId, minTradeAmount1)).to.be.revertedWith("Ownable: caller is not the owner");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let maxTradeAmount1 = Utils.parseUnits('250', quoteDecimals);
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setMinTradeAmount(tradePairId, maxTradeAmount1)).to.be.revertedWith("Ownable: caller is not the owner");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let displayDecimals = 2;
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, 1)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(tradePairs.connect(trader1).setDisplayDecimals(tradePairId, displayDecimals, 0)).to.be.revertedWith("Ownable: caller is not the owner");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let allowedSlippagePercent = 25;
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setAllowedSlippagePercent(tradePairId, allowedSlippagePercent)).to.be.revertedWith("Ownable: caller is not the owner");
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

            let minTradeAmount = 1;
            let maxTradeAmount = 1000;
            let mode = 0;  // auction off

            baseAssetAddr = ZERO_ACCT_ADDR;

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

            let tx = await tradePairs.connect(trader1)
                    .addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1);
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

            // cannot add market order if not an allowed type
            let side = 0;   // buy side
            let type1 = 0;  // market orders not enabled
            await expect(tradePairs.connect(trader1)
                    .addOrder(tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), side, type1))
                    .to.be.revertedWith("T-IVOT-01");

            await expect(tradePairs.connect(trader1)
                    .addOrderFrom(trader1.address, tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), side, type1))
                    .to.be.revertedWith("T-IVOT-02");

            // cannot add market order if auction is on
            await tradePairs.connect(admin).addOrderType(tradePairId, 0);    // add market order first
            await tradePairs.connect(admin).setAuctionMode(tradePairId, 2);  // auction is OPEN
            await expect(tradePairs.connect(trader1)
                    .addOrder(tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), side, type1))
                    .to.be.revertedWith("T-AUCT-04");

            // add a limit order too small
            type1 = 1;  // limit order
            await tradePairs.connect(admin).setAuctionMode(tradePairId, 0);  // auction is OFF
            await expect(tradePairs.connect(trader1)
                    .addOrder(tradePairId, Utils.parseUnits('0.1', quoteDecimals), Utils.parseUnits('5', baseDecimals), side, type1))
                    .to.be.revertedWith("T-LTMT-02");

            // add a limit order too big
            await expect(tradePairs.connect(trader1)
                    .addOrder(tradePairId, Utils.parseUnits('10', quoteDecimals), Utils.parseUnits('1000', baseDecimals), side, type1))
                    .to.be.revertedWith("T-MTMT-02");

            // add a market order too small
            type1 = 0;  // market order
            await expect(tradePairs.connect(trader1)
                    .addOrder(tradePairId, Utils.parseUnits('0.1', quoteDecimals), Utils.parseUnits('5', baseDecimals), side, type1))
                    .to.be.revertedWith("T-LTMT-01");

            // add a market order too big
            side = 1; // sell side
            await expect(tradePairs.connect(trader1)
                    .addOrder(tradePairId, Utils.parseUnits('10', quoteDecimals), Utils.parseUnits('1000', baseDecimals), side, type1))
                    .to.be.revertedWith("T-MTMT-01");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

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

            baseAssetAddr = ZERO_ACCT_ADDR;

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

            baseAssetAddr = ZERO_ACCT_ADDR;

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

        it("Should be able to add market buy order from the trader accounts", async function () {
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

            let minTradeAmount = 1;
            let maxTradeAmount = 1000;
            let mode = 0;  // auction off

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals));
            await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});
            await trader2.sendTransaction({from: trader2.address, to: portfolio.address, value: Utils.toWei('3000')});

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            await quoteToken.connect(trader2).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            await tradePairs.connect(admin).addOrderType(tradePairId, 0);

            let tx = await tradePairs.connect(trader1)
                    .addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 1, 1);  // SELL, LIMIT ORDER

            tx = await tradePairs.connect(trader2)
                    .addOrderFrom(trader2.address, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 0);  // BUY, MARKET ORDER
            let res = await tx.wait();

            expect(res.events[5].event).to.be.equal('OrderStatusChanged');
            expect(res.events[5].args.pair).to.be.equal(tradePairId);
            expect(res.events[5].args.price).to.be.equal(Utils.parseUnits('100', quoteDecimals));
            expect(res.events[5].args.totalamount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
            expect(res.events[5].args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
            expect(res.events[5].args.side).to.be.equal(1);              // side is SELL=1
            expect(res.events[5].args.type1).to.be.equal(1);             // type1 is LIMIT=1
            expect(res.events[5].args.status).to.be.equal(3);            // status is FILLED = 3
            expect(res.events[5].args.quantityfilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
            expect(res.events[5].args.totalfee).to.be.equal(Utils.parseUnits('1', quoteDecimals));  // 0.1% of 1000 = 1 QT

            expect(res.events[6].event).to.be.equal('OrderStatusChanged');
            expect(res.events[6].args.pair).to.be.equal(tradePairId);
            expect(res.events[6].args.price).to.be.equal(0);  // MARKET PRICE = 0
            expect(res.events[6].args.totalamount).to.be.equal(Utils.parseUnits('1000', quoteDecimals));  // totalamount is 1000 QT
            expect(res.events[6].args.quantity).to.be.equal(Utils.parseUnits('10', baseDecimals));
            expect(res.events[6].args.side).to.be.equal(0);              // side is BUY=0
            expect(res.events[6].args.type1).to.be.equal(0);             // type1 is MARKET=0
            expect(res.events[6].args.status).to.be.equal(3);            // status is FILLED = 3
            expect(res.events[6].args.quantityfilled).to.be.equal(Utils.parseUnits('10', baseDecimals));   // quantityfilled is 10 AVAX
            expect(res.events[6].args.totalfee).to.be.equal(Utils.parseUnits('0.02', baseDecimals));  // 0.2% of 10 = 0.02 AVAX
        });

        it("Should revert when price has more decimals than quote display decimals", async function () {
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

            baseAssetAddr = ZERO_ACCT_ADDR;

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
                .to.be.revertedWith("T-TMDP-01");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

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
                .to.be.revertedWith("T-TMDQ-01");

            await expect(tradePairs.connect(trader1).addOrderFrom(trader1.address, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10.1234', baseDecimals), 0, 1))
                .to.be.revertedWith("T-TMDQ-02");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            let auctionMode = 4;
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).setAuctionMode(tradePairId, auctionMode)).to.be.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).setAuctionMode(tradePairId, auctionMode);
            let auctionData = await tradePairs.getAuctionData(tradePairId);
            expect(auctionData[0]).to.be.equal(auctionMode);
        });

        it("Should pause and unpause TradePairs from the admin account", async function () {
            // fail from non admin accounts
            await expect(tradePairs.connect(trader1).pause()).to.be.revertedWith("Ownable: caller is not the owner");
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

            baseAssetAddr = ZERO_ACCT_ADDR;

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
            await expect(tradePairs.connect(trader1).pauseTradePair(tradePairId, true)).to.be.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).pauseTradePair(tradePairId, true);
            // fail addOrder
            await expect(tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1))
                .to.be.revertedWith("T-PPAU-01");
            // fail addOrderFrom
            await expect(tradePairs.connect(trader1).addOrderFrom(owner.address, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1))
                .to.be.revertedWith("T-OODT-01");
            await expect(tradePairs.connect(trader1).addOrderFrom(trader1.address, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1))
                .to.be.revertedWith("T-PPAU-06");
            // unpause to succeed
            await tradePairs.connect(admin).pauseTradePair(tradePairId, false);
            // succeed addOrder
            await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1);
            // succeed addOrderFrom
            await tradePairs.connect(trader1).addOrderFrom(trader1.address, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1);
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

            baseAssetAddr = ZERO_ACCT_ADDR;

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
            await expect(tradePairs.connect(trader1).pauseAddOrder(tradePairId, true)).to.be.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await tradePairs.connect(admin).pauseAddOrder(tradePairId, true);
            await expect(tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1))
                .to.be.revertedWith("T-AOPA-01");
            await expect(tradePairs.connect(trader1).addOrderFrom(trader1.address, tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1))
                .to.be.revertedWith("T-AOPA-02");
            await tradePairs.connect(admin).pauseAddOrder(tradePairId, false);
            await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('100', quoteDecimals), Utils.parseUnits('10', baseDecimals), 0, 1);
        });

        it("Should use setAuctionPrice correctly", async function () {
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

            baseAssetAddr = ZERO_ACCT_ADDR;

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

            // too many decimals
            await expect(tradePairs.connect(admin).setAuctionPrice(tradePairId, Utils.parseUnits('4.1234', quoteDecimals), 20))
                         .to.be.revertedWith("T-AUCT-02");

            // percent is zero
            await expect(tradePairs.connect(admin).setAuctionPrice(tradePairId, Utils.parseUnits('4.123', quoteDecimals), 0))
                         .to.be.revertedWith("T-AUCT-12");
        });

        it("Should be able to check if trade pair exists", async function () {
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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            expect(await tradePairs.tradePairExists(tradePairId)).to.be.equal(true);
            expect(await tradePairs.tradePairExists(Utils.fromUtf8("DOES NOT EXIST"))).to.be.equal(false);
        });

        it("Should not be able to add same trade pair", async function () {
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

            baseAssetAddr = ZERO_ACCT_ADDR;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // should emit NewTradePair
            await expect(tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                        .to.emit(tradePairs, "NewTradePair");

            // should not emit NewTradePair
            await expect(tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                        quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode))
                        .to.not.emit(tradePairs, "NewTradePair");
        });

        it("Should be able to cancel orders", async function () {
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

            baseAssetAddr = ZERO_ACCT_ADDR;
            zero_bytes32 = ZERO_BYTES32;

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

            // add two buy orders
            const tx1 = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1);
            const res1 = await tx1.wait();
            const id1 = res1.events[1].args.id;
            const tx2 = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1);
            const res2 = await tx2.wait();
            const id2 = res2.events[1].args.id;
            // cannot cancel empty order
            await expect(tradePairs.connect(trader1).cancelOrder(tradePairId, zero_bytes32)).to.be.revertedWith("T-EOID-01");
            // cannot cancel order for somebody else
            await expect(tradePairs.connect(admin).cancelOrder(tradePairId, id1)).to.be.revertedWith("T-OOCC-01");
            // cannot cancel all with empty order
            await expect(tradePairs.connect(trader1).cancelAllOrders(tradePairId, [zero_bytes32, zero_bytes32])).to.be.revertedWith("T-OOCC-02");
            // cannot cancel all for somebody else
            await expect(tradePairs.connect(admin).cancelAllOrders(tradePairId, [id1, id2])).to.be.revertedWith("T-OOCC-02");
        });

        it("Should be able to use cancelOrder(), cancelAllOrders() and cancelReplaceOrders() correctly", async function () {
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

            baseAssetAddr = ZERO_ACCT_ADDR;
            zero_bytes32 = ZERO_BYTES32;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));

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

            // add two buy orders
            const tx1 = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1);
            const res1 = await tx1.wait();
            const id1 = res1.events[1].args.id;
            // set auction mode to OPEN
            await tradePairs.connect(admin).setAuctionMode(tradePairId, 2);  // auction is OPEN
            // cannot cancel and replace with empty order id
            await expect(tradePairs.connect(trader1)
                .cancelReplaceOrder(tradePairId, zero_bytes32, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-EOID-01");
            // you cannot cancel and replace for somebody else
            await expect(tradePairs.connect(admin)
                .cancelReplaceOrder(tradePairId, id1, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OOCC-01");
            // set auction mode to OFF
            await tradePairs.connect(admin).setAuctionMode(tradePairId, 0);  // auction is OFF
            // trigger available funds not enough
            await expect(tradePairs.connect(trader2).addOrder(tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 1, 1))
                .to.be.revertedWith("P-AFNE-02");

            // mint some tokens for trader1
            await quoteToken.mint(trader2.address, Utils.parseUnits('20000', quoteDecimals));

            // deposit some native to portfolio for trader2
            await trader2.sendTransaction({from: trader2.address, to: portfolio.address, value: Utils.toWei('3000')});
            expect((await portfolio.getBalance(trader2.address, baseSymbol))[0]).to.equal(Utils.parseUnits('3000', baseDecimals));
            expect((await portfolio.getBalance(trader2.address, baseSymbol))[1]).to.equal(Utils.parseUnits('3000', baseDecimals));

            // deposit some tokens to portfolio for trader2
            await quoteToken.connect(trader2).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader2).depositToken(trader2.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader2.address, quoteSymbol))[0]).to.equal(Utils.parseUnits('2000', quoteDecimals));
            expect((await portfolio.getBalance(trader2.address, quoteSymbol))[1]).to.equal(Utils.parseUnits('2000', quoteDecimals));

            // enter a matching sell order
            await tradePairs.connect(trader2).addOrder(tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 1, 1);

            // fail to cancel a matched order via cancelOrder()
            await expect(tradePairs.connect(trader1).cancelOrder(tradePairId, id1)).to.be.revertedWith("T-OAEX-01");
            // fail to cancel a matched order via cancelAllOrders()
            await tradePairs.connect(trader1).cancelAllOrders(tradePairId, [id1]);
            // fail to cancel a matched order via cancelReplaceOrder()
            await tradePairs.connect(admin).setAuctionMode(tradePairId, 2);  // auction is OPEN
            await expect(tradePairs.connect(trader1)
                 .cancelReplaceOrder(tradePairId, id1, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('50', baseDecimals))).to.be.revertedWith("T-OAEX-01");
        });

        it("Should be able to use unsolicitedCancel() correctly", async function () {
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

            baseAssetAddr = ZERO_ACCT_ADDR;
            zero_bytes32 = ZERO_BYTES32;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            // deposit some native to portfolio for trader1
            await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('3000')});

            // deposit some tokens to portfolio for trader1
            await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('2000', quoteDecimals));
            await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('2000', quoteDecimals));

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            // add two buy orders
            const tx1 = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('1', quoteDecimals), Utils.parseUnits('100', baseDecimals), 0, 1);
            const res1 = await tx1.wait();
            const id1 = res1.events[1].args.id;

            const tx2 = await tradePairs.connect(trader1).addOrder(tradePairId, Utils.parseUnits('2', quoteDecimals), Utils.parseUnits('200', baseDecimals), 0, 1);
            const res2 = await tx2.wait();
            const id2 = res2.events[1].args.id;

            let order1 = await tradePairs.getOrder(id1);
            let order2 = await tradePairs.getOrder(id2);
            expect(order1.id).to.be.equal(id1);
            expect(order2.id).to.be.equal(id2);
            expect(order1.status).to.be.equal(0);
            expect(order2.status).to.be.equal(0);

            const bookId = Utils.fromUtf8(`${tradePairStr}-BUYBOOK`);
            // fail from non-admin account
            await expect(tradePairs.connect(trader1).unsolicitedCancel(tradePairId, bookId, 10)).to.be.revertedWith("Ownable: caller is not the owner");
            // fail if tradePairs is not paused
            await tradePairs.connect(admin).pauseTradePair(tradePairId, false);
            await expect(tradePairs.connect(admin).unsolicitedCancel(tradePairId, bookId, 10)).to.be.revertedWith("T-PPAU-05");
            // succeed
            await tradePairs.connect(admin).pauseTradePair(tradePairId, true);
            await tradePairs.connect(admin).unsolicitedCancel(tradePairId, bookId, 10);

            order1 = await tradePairs.getOrder(id1);
            order2 = await tradePairs.getOrder(id2);
            expect(order1.id).to.be.equal(id1);
            expect(order2.id).to.be.equal(id2);
            expect(order1.status).to.be.equal(4);
            expect(order2.status).to.be.equal(4);
        });

        it("Should use matchAuctionOrder() correctly", async function () {
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

            baseAssetAddr = ZERO_ACCT_ADDR;
            zero_bytes32 = ZERO_BYTES32;

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);
            quoteAssetAddr = quoteToken.address;

            // mint some tokens for trader1
            await quoteToken.mint(trader1.address, Utils.parseUnits('20000', quoteDecimals));

            // add token to portfolio
            await portfolio.addToken(baseSymbol, baseAssetAddr, mode);
            await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode);

            await tradePairs.connect(admin).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
                                                         quoteSymbol, quoteDecimals, quoteDisplayDecimals,
                                                         Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                                                         Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

            // fail to use matchAuctionOrders() while not in matching mode (5)
            await expect(tradePairs.connect(admin).matchAuctionOrders(tradePairId, 8)).to.be.revertedWith("T-AUCT-01");
            // set auction mode to OPEN
            await tradePairs.connect(admin).setAuctionMode(tradePairId, 5);  // auction is OPEN
            await expect(tradePairs.connect(admin).matchAuctionOrders(tradePairId, 8)).to.be.revertedWith("T-AUCT-03");
        });

        it("Should floor correctly", async function () {
            expect(await tradePairs.floor(1245, 1)).to.be.equal(1240);
            expect(await tradePairs.floor(1245, 2)).to.be.equal(1200);
            expect(await tradePairs.floor(1245, 3)).to.be.equal(1000);
        });

        it("Should reject sending gas token directly to trade pairs contract.", async () => {
            const balBefore = await ethers.provider.getBalance(owner.address);
            const msg = "Transaction reverted:";
            try {
                await owner.sendTransaction({from: owner.address,
                                             to: tradePairs.address,
                                             value: Utils.toWei('1')})
            } catch(err) {
                expect(err.message.includes(msg)).to.be.equal(true);
             }
            const balAfter = await ethers.provider.getBalance(owner.address);
            expect(balBefore).to.be.equal(balAfter);
        });

    });
});
