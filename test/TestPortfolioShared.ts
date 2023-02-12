/**
 * The test runner for Dexalot Portfolio Shared
 * Please do not test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    ExchangeSub,
    LZEndpointMock,
    MockToken,
    OrderBooks,
    PortfolioBridge,
    PortfolioBridge__factory,
    PortfolioMain, PortfolioSub,


} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Portfolio Shared", () => {
    let portfolio: PortfolioMain;
    let portfolioSub: PortfolioSub;
    let exchange : ExchangeSub;
    let orderBooks: OrderBooks;


    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let lzEndpoint: LZEndpointMock;

    let alot : MockToken;
    let avax : MockToken;
    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    let bridgeFee: string;

    const auctionMode: any = 0;

    before(async () => {
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
        console.log("Trader2", trader2.address);


    })

    beforeEach(async function () {
        const {portfolioMain: portfolioM, portfolioSub: portfolioS, lzEndpointMain, portfolioBridgeMain: pbrigeMain, lzEndpointMain: lzpoint} = await f.deployCompletePortfolio();
        portfolio = portfolioM;
        portfolioSub = portfolioS;
        lzEndpoint = lzEndpointMain;
        lzEndpoint =lzpoint;
        alot = await f.deployMockToken("ALOT", 18)
        avax = await f.deployMockToken("AVAX", 18)
        bridgeFee = ethers.utils.parseEther("0.01").toString();
    });

    it("Should add and remove admin correctly", async function () {
        const role = await portfolio.DEFAULT_ADMIN_ROLE();
        // fail for non-admin
        await expect(portfolio.connect(trader1).grantRole(role, trader1.address)).to.be.revertedWith("AccessControl: account");
        // succeed for admin
        await portfolio.grantRole(role, trader1.address)
        expect(await portfolio.hasRole(role, trader1.address)).to.be.true;
        // fail for non-admin
        await expect(portfolio.connect(trader2).revokeRole(role, trader1.address)).to.be.revertedWith("AccessControl: account");

        // fail for zero address
        await expect(portfolio.revokeRole(role, ZERO_ADDRESS)).to.revertedWith("P-OACC-02");
        // succeed for admin
        await portfolio.revokeRole(role, trader1.address)
        expect(await portfolio.hasRole(role, trader1.address)).to.be.false;
        // cannot remove the last admin
        await expect(portfolio.revokeRole(role, owner.address)).to.be.revertedWith("P-ALOA-01");
        await expect(portfolio.revokeRole(portfolio.PORTFOLIO_BRIDGE_ROLE(), owner.address)).to.be.revertedWith("P-ALOA-02");
        // silent fail for non-existing role value
        const NO_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("NO_ROLE"));
        await expect(portfolio.revokeRole(NO_ROLE, owner.address))
            .to.emit(portfolio, "RoleUpdated")
            .withArgs("PORTFOLIO", "REMOVE-ROLE", NO_ROLE, owner.address);
    });

    it("Should have gas Swap Amount 1 and bridgeFee 0 for ALOT both in PMain and PSub", async () => {
        //Add alot to main
        await f.addToken(portfolio, alot, 1);
        let params =await portfolio.bridgeParams(ALOT);
        expect(params.gasSwapRatio).to.equal(Utils.toWei("1"));
        expect(params.fee).to.equal(0);
        expect(params.usedForGasSwap).to.equal(true); // always true for ALOT even in the mainnet (redundant)


        let params2 =await portfolioSub.bridgeParams(ALOT);
        expect(params2.gasSwapRatio).to.equal(Utils.toWei("1"));
        expect(params2.fee).to.equal(0);
        expect(params2.usedForGasSwap).to.equal(true);

        //  ALOT brigeFee can be changed, but Can't change ALOT gasSwapRatio(Silent fail)
        await portfolio.setBridgeParam(ALOT, Utils.toWei("0.2"), Utils.toWei("0.1"), true)
        params =await portfolio.bridgeParams(ALOT);
        expect(params.gasSwapRatio).to.equal(Utils.toWei("1"));
        expect(params.fee).to.equal(Utils.toWei("0.2"));
        expect(params.usedForGasSwap).to.equal(true);

        await portfolioSub.setBridgeParam(ALOT,  Utils.toWei("0.2"), Utils.toWei("0.1"), true)
        params2 =await portfolioSub.bridgeParams(ALOT);
        expect(params2.gasSwapRatio).to.equal(Utils.toWei("1"));
        expect(params2.fee).to.equal(Utils.toWei("0.2"));
        expect(params2.usedForGasSwap).to.equal(true);

        const minAmounts= await portfolio.getMinDepositAmounts();
        expect(minAmounts[0]).includes(ALOT);
        expect(minAmounts[0]).includes(AVAX);


    });

    it("Should have gas Swap Amount 0.01 and bridgeFee 0 for AVAX both in PMain and PSub", async () => {

        let params =await portfolio.bridgeParams(AVAX);
        expect(params.gasSwapRatio).to.equal(Utils.toWei("0.01"));
        expect(params.fee).to.equal(0);
        expect(params.usedForGasSwap).to.equal(false); // always false in the mainnet

        // Avax is added with 0 gas in the subnet
        let  params2 =await portfolioSub.bridgeParams(AVAX);
        expect(params2.gasSwapRatio).to.equal(Utils.toWei("0"));
        expect(params2.fee).to.equal(0);
        expect(params2.usedForGasSwap).to.equal(false);

        await expect ( portfolio.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0"), true)).to.revertedWith("P-GSRO-01")
        await portfolio.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0.1"), true)
        params =await portfolio.bridgeParams(AVAX);
        expect(params.gasSwapRatio).to.equal(Utils.toWei("0.1"));
        expect(params.fee).to.equal(Utils.toWei("0.3"));
        expect(params.usedForGasSwap).to.equal(false); // always false in the mainnet

        await expect (portfolioSub.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0"), true)).to.revertedWith("P-GSRO-01")
        await portfolioSub.setBridgeParam(AVAX,  Utils.toWei("0.2"), Utils.toWei("0.1"), true)
        params2 =await portfolioSub.bridgeParams(AVAX);
        expect(params2.gasSwapRatio).to.equal(Utils.toWei("0.1"));
        expect(params2.fee).to.equal(Utils.toWei("0.2"));
        expect(params2.usedForGasSwap).to.equal(true); // always false in the mainnet

        const minAmounts= await portfolio.getMinDepositAmounts();
        expect(minAmounts[0]).not.includes(ALOT);
        expect(minAmounts[0]).includes(AVAX);

    });

    it("Should be able to set gasSwap Ratio to 0 in PortfolioSub for an auctionToken but not In PortfolioMain", async () => {

        const token_symbol = "USDT";
        const token_decimals = 6;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        // Can not add erc20 to portfolioMain with 0 gasSwapRatio
        await expect (f.addToken(portfolio, usdt, 0, 0)).to.revertedWith("P-GSRO-01");
        expect ( (await portfolio.getTokenDetails(USDT)).auctionMode).to.be.equal(0);

        //  add erc20 to portfolioMain with 0.1 gasSwapRatio with an auctionmode 2
        await f.addToken(portfolio, usdt, 0.1, 2);
        //  auctionmode 2 ignored in the mainnet
        expect ( (await portfolio.getTokenDetails(USDT)).auctionMode).to.be.equal(0);
        const params =await portfolio.bridgeParams(USDT);
        expect(params.gasSwapRatio).to.equal(Utils.parseUnits('0.1', token_decimals));
        expect(params.fee).to.equal(0);

        //  add erc20 to portfolioMain with 0.1 gasSwapRatio with an auctionmode 0
        await f.addToken(portfolioSub, usdt, 0, 2);
        expect ( (await portfolioSub.getTokenDetails(USDT)).auctionMode).to.be.equal(2);
        let  params2 =await portfolioSub.bridgeParams(USDT);
        expect(params2.gasSwapRatio).to.equal(0);
        expect(params2.fee).to.equal(0);


        await portfolioSub.setBridgeParam(USDT, Utils.parseUnits('0.3', token_decimals), Utils.parseUnits('0.1', token_decimals), true)
        params2 =await portfolioSub.bridgeParams(USDT);
        expect(params2.gasSwapRatio).to.equal(Utils.parseUnits('0.1', token_decimals));
        expect(params2.fee).to.equal(Utils.parseUnits('0.3', token_decimals));

    });

    it("Should add, check and remove an PORTFOLIO_BRIDGE_ROLE correctly", async function () {
        orderBooks = await f.deployOrderBooks()
        exchange = await f.deployExchangeSub(portfolioSub, orderBooks)
        const tradePairs = await f.deployTradePairs(orderBooks, portfolioSub, exchange);

        const role = portfolio.PORTFOLIO_BRIDGE_ROLE();
        // ADD
        // fail for non-admin
        await expect(portfolio.connect(trader1).grantRole(role, tradePairs.address)).to.be.revertedWith("AccessControl: account");
        // succeed for admin
        await portfolio.grantRole(role, tradePairs.address)
        expect(await portfolio.hasRole(role, tradePairs.address)).to.be.true;
        // fail for non-admin
        await expect(portfolio.connect(trader1).revokeRole(role, tradePairs.address)).to.be.revertedWith("AccessControl: account");
        // succeed for admin
        await portfolio.grantRole(role, trader1.address)  // add one more so you can remove the first the other one
        expect(await portfolio.hasRole(role, trader1.address)).to.be.true;
        await portfolio.revokeRole(role, trader1.address)
        expect(await portfolio.hasRole(role, trader1.address)).to.be.false;
    });

    it("Should set portfolio bridge correctly", async function () {

        expect(await portfolio.getChainId()).to.be.equal(1)

        const PortfolioBridge = await ethers.getContractFactory("PortfolioBridge") as PortfolioBridge__factory;
        const portfolioBridge = await upgrades.deployProxy(
            PortfolioBridge, [lzEndpoint.address]) as PortfolioBridge;
        await portfolioBridge.deployed();

        await portfolioBridge.setPortfolio(portfolio.address);

        // fail for non-admin
        await expect(portfolio.connect(trader1).setPortfolioBridge(portfolioBridge.address)).to.be.revertedWith("AccessControl: account");

        // succeed
        await expect(portfolio.setPortfolioBridge(portfolioBridge.address))
        .to.emit(portfolio, "RoleRevoked")
        .to.emit(portfolio, "RoleGranted")
        .to.emit(portfolio, "AddressSet")
    });


    it("Should enable bridge correctly", async () => {
        // fail for non-admin
        await expect(portfolio.connect(trader1).enableBridgeProvider(1, true)).to.be.revertedWith("P-OACC-01");

        // succeed
        await expect(portfolio.enableBridgeProvider(1, true))
        .to.emit(portfolio, "ParameterUpdated")
        .withArgs(Utils.fromUtf8("Portfolio"), "P-BRIDGE-ENABLE", 0, 1);
    })

    it("Should set and get bridgeFee", async () => {
        // fail for non-admin
        await expect(portfolio.connect(trader1).setBridgeParam(AVAX, bridgeFee, 0, true))
        .to.be.revertedWith("P-OACC-01");

        // 0 gasSwapRatio Fail
        await expect(portfolio.setBridgeParam(AVAX, Utils.toWei("0.1"), 0, true)).to.revertedWith("P-GSRO-01");

        // succeed for admin
        await portfolio.setBridgeParam(AVAX, Utils.toWei("0.1"), Utils.toWei("0.1"), true)

        expect( (await portfolio.bridgeParams(AVAX)).fee).to.be.equal(Utils.toWei("0.1"));
    });

    it("Should set bridgeParam gas swap amount for Portfolio from the admin account", async function () {
        const { trader1, admin } = await f.getAccounts();

        const USDT = Utils.fromUtf8("USDT")

        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setBridgeParam(USDT, 0, Utils.toWei("0.1"), true)).to.revertedWith("P-OACC-01");
        await expect(portfolioSub.connect(admin).setBridgeParam(USDT, 0, Utils.toWei("0.1"), true)).to.revertedWith("P-OACC-01");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await expect (portfolio.connect(admin).setBridgeParam(USDT, 0, Utils.toWei("0.1"), true))
        .to.emit(portfolio, "ParameterUpdated")
        .withArgs(USDT, "P-SET-BRIDGEPARAM", 0, Utils.toWei("0.1"))

        expect((await portfolio.bridgeParams(USDT)).gasSwapRatio).to.be.equal(Utils.toWei("0.1"));

        await portfolioSub.grantRole(portfolioSub.DEFAULT_ADMIN_ROLE(), admin.address);
        await expect (portfolioSub.connect(admin).setBridgeParam(USDT, 0, Utils.toWei("0.1"), true))
        .to.emit(portfolioSub, "ParameterUpdated")
        .withArgs(USDT, "P-SET-BRIDGEPARAM", 0, Utils.toWei("0.1"))

        expect((await portfolioSub.bridgeParams(USDT)).gasSwapRatio).to.be.equal(Utils.toWei("0.1"));


    });

    it("Should set bridgeParam gas swap amount for Portfolio from the admin account", async function () {
        const { trader1, admin } = await f.getAccounts();

        const USDT = Utils.fromUtf8("USDT")

        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setBridgeParam(USDT, 0, Utils.toWei("0.1"), true)).to.revertedWith("P-OACC-01");
        await expect(portfolioSub.connect(admin).setBridgeParam(USDT, 0, Utils.toWei("0.1"), true)).to.revertedWith("P-OACC-01");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await expect (portfolio.connect(admin).setBridgeParam(USDT, 0, Utils.toWei("0.1"), true))
        .to.emit(portfolio, "ParameterUpdated")
        .withArgs(USDT, "P-SET-BRIDGEPARAM", 0, Utils.toWei("0.1"))

        expect((await portfolio.bridgeParams(USDT)).gasSwapRatio).to.be.equal(Utils.toWei("0.1"));

        await portfolioSub.grantRole(portfolioSub.DEFAULT_ADMIN_ROLE(), admin.address);
        await expect (portfolioSub.connect(admin).setBridgeParam(USDT, 0, Utils.toWei("0.1"), true))
        .to.emit(portfolioSub, "ParameterUpdated")
        .withArgs(USDT, "P-SET-BRIDGEPARAM", 0, Utils.toWei("0.1"))

        expect((await portfolioSub.bridgeParams(USDT)).gasSwapRatio).to.be.equal(Utils.toWei("0.1"));


    });


    it("Should pause and unpause Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).pause()).to.revertedWith("P-OACC-01");
        await expect(portfolio.connect(admin).pause()).to.revertedWith("P-OACC-01");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).pause();
        expect(await portfolio.paused()).to.be.true;
        // fail for non-admin
        await expect(portfolio.connect(trader1).unpause()).to.be.revertedWith("P-OACC-01");
        // succeed for admin
        await portfolio.connect(admin).unpause();
        expect(await portfolio.paused()).to.be.false;
    });

    it("Should pause and unpause Portfolio deposit from the admin account", async function () {
        const token_symbol = "USDT";
        const token_decimals = 6;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await f.addToken(portfolio, usdt, 0.5, auctionMode);
        await f.addToken(portfolioSub, usdt, 0.5, auctionMode);

        await usdt.mint(owner.address, Utils.parseUnits('1000', token_decimals));
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).pauseDeposit(true)).to.revertedWith("AccessControl: account");
        await expect(portfolio.connect(admin).pauseDeposit(true)).to.revertedWith("AccessControl: account");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).pauseDeposit(true);
        // fail when paused for native
        await expect(owner.sendTransaction({to: portfolio.address, value: Utils.parseUnits('10', 18)})).to.revertedWith("P-NTDP-01");

        // fail depositToken() when paused
        await expect(f.depositToken(portfolio, owner, usdt, token_decimals, USDT,  '10')).to.revertedWith("P-NTDP-01");

        // fail depositTokenFromContract() when paused
        await portfolio.addTrustedContract(owner.address, "TESTING");
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, Utils.parseUnits('10', token_decimals))).to.revertedWith("P-NTDP-01");
        // allow deposits
        await portfolio.connect(admin).pauseDeposit(false);
        // fail with 0 quantity for depositToken()
        await expect(portfolio.depositToken(owner.address, USDT, 0, 0)).to.revertedWith("P-DUTH-01");
        // fail for non-existent token for depositToken()

        await expect(portfolio.depositToken(owner.address, Utils.fromUtf8("NONE"), Utils.parseUnits('10', token_decimals), 0)).to.revertedWith("P-ETNS-01");
        // fail for quantity more than balance for depositToken()
        await expect(portfolio.depositToken(owner.address, USDT, Utils.toWei('1001'), 0)).to.revertedWith("P-NETD-01");
        // fail with 0 quantity for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, 0)).to.revertedWith("P-DUTH-01");
        // fail for non-existent token for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, Utils.fromUtf8("NONE"), Utils.parseUnits('10', token_decimals))).to.revertedWith("P-ETNS-01");
        // fail for quantity more than balance for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, Utils.parseUnits('1001', token_decimals))).to.revertedWith("P-NETD-01");
        // succeed for native
        await owner.sendTransaction({to: portfolio.address, value: Utils.toWei('1000')});
        const bal = await portfolioSub.getBalance(owner.address, AVAX);
        expect(bal.total).to.be.equal(Utils.toWei('1000'));
        expect(bal.available).to.be.equal(Utils.toWei('1000'));
    });


    it("Should return native tokens", async () => {
        expect(await portfolio.getNative()).to.equal(AVAX);
        expect(await portfolioSub.getNative()).to.equal(ALOT);
    })

    it("Should revert with non-existing function call", async () => {
        // try calling a scam addMyContract via a modified abi call
        const bogusAbi = "[{\"inputs\":[{\"internalType\":\"address\",\"name\":\"_contract\",\"type\":\"address\"}," +
                       "{\"internalType\":\"string\",\"name\":\"_organization\",\"type\":\"string\"}]," +
                       "\"name\":\"addMyContract\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]";
        const contract = new ethers.Contract(portfolio.address, bogusAbi, owner);
        await expect(contract.addMyContract(trader2.address, "SCAMMER")).to.be.revertedWith("");
    });

});
