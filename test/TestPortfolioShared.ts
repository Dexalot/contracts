/**
 * The test runner for Dexalot Portfolio Shared
 * Please do not test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    ExchangeSub,
    LZEndpointMock,
    LZEndpointMock__factory,
    OrderBooks,
    PortfolioBridge,
    PortfolioBridge__factory,
    PortfolioMain, PortfolioSub,
    TokenVestingCloneFactory,
    TokenVestingCloneable,
    TokenVestingCloneable__factory,
    PortfolioBridgeSub,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MockContract, smock } from '@defi-wonderland/smock';

describe("Portfolio Shared", () => {
    let portfolio: PortfolioMain;
    let portfolioSub: PortfolioSub;
    let portfolioBridge: PortfolioBridge;
    let portfolioBridgeSub: PortfolioBridgeSub;
    let exchange : ExchangeSub;
    let orderBooks: OrderBooks;

    let factory: TokenVestingCloneFactory;
    let TokenVestingCloneable: TokenVestingCloneable__factory;
    let tokenVesting: TokenVestingCloneable;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let lzEndpointMock: MockContract<LZEndpointMock>;
    let lzEndpoint: LZEndpointMock;

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    let bridgeFee: string;

    const srcChainId = 1;
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
        console.log("Trader1", trader2.address);

        TokenVestingCloneable = await ethers.getContractFactory("TokenVestingCloneable") as TokenVestingCloneable__factory;
    })

    beforeEach(async function () {
        const {portfolioMain: portfolioM, portfolioSub: portfolioS, lzEndpointMain, portfolioBridgeMain: pbrigeMain, lzEndpointMain: lzpoint} = await f.deployCompletePortfolio();
        portfolio = portfolioM;
        portfolioSub = portfolioS;
        lzEndpoint = lzEndpointMain;
        portfolioBridge = pbrigeMain;
        lzEndpoint =lzpoint;

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
        await expect(portfolio.connect(trader1).setBridgeFee(AVAX, 100))
        .to.be.revertedWith("AccessControl: account");

        // succeed for admin
        await expect(portfolio.setBridgeFee(AVAX, bridgeFee))
        .to.emit(portfolio, "ParameterUpdated")
        .withArgs(AVAX, "P-SET-BRIDGEFEE", 0, bridgeFee)
    });

    it("Should set bridge swap amount for Portfolio from the admin account", async function () {
        const { trader1, admin } = await f.getAccounts();

        const USDT = Utils.fromUtf8("USDT")

        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setBridgeSwapAmount(USDT, Utils.toWei("0.1"))).to.revertedWith("AccessControl: account");
        await expect(portfolio.connect(admin).setBridgeSwapAmount(USDT, Utils.toWei("0.1"))).to.revertedWith("AccessControl: account");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).setBridgeSwapAmount(USDT, Utils.toWei("0.1"));
        expect(await portfolio.getBridgeSwapAmount(USDT)).to.be.equal(Utils.toWei("0.1"));
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
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off
        await portfolioSub.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off
        await usdt.mint(owner.address, Utils.toWei('1000'));
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).pauseDeposit(true)).to.revertedWith("AccessControl: account");
        await expect(portfolio.connect(admin).pauseDeposit(true)).to.revertedWith("AccessControl: account");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).pauseDeposit(true);
        // fail when paused
        await expect(owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei('1000')})).to.revertedWith("P-NTDP-01");
        // fail depositToken() when paused
        await expect(portfolio.connect(owner).depositToken(owner.address, USDT, Utils.toWei('100'), 0)).to.revertedWith("P-ETDP-01");

        // fail depositTokenFromContract() when paused

        await portfolio.addTrustedContract(owner.address, "TESTING");
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, Utils.toWei('100'))).to.revertedWith("P-ETDP-01");
        // allow deposits
        await portfolio.connect(admin).pauseDeposit(false);
        // fail with 0 quantity for depositToken()
        await expect(portfolio.depositToken(owner.address, USDT, 0, 0)).to.revertedWith("P-ZETD-01");
        // fail for non-existent token for depositToken()
        await expect(portfolio.depositToken(owner.address, Utils.fromUtf8("NONE"), Utils.toWei('100'), 0)).to.revertedWith("P-ETNS-01");
        // fail for quantity more than balance for depositToken()
        await expect(portfolio.depositToken(owner.address, USDT, Utils.toWei('1001'), 0)).to.revertedWith("P-NETD-01");
        // fail with 0 quantity for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, 0)).to.revertedWith("P-ZETD-01");
        // fail for non-existent token for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, Utils.fromUtf8("NONE"), Utils.toWei('100'))).to.revertedWith("P-ETNS-01");
        // fail for quantity more than balance for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, Utils.toWei('1001'))).to.revertedWith("P-NETD-01");
        // succeed for native
        await owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei('1000')});
        const bal = await portfolioSub.getBalance(owner.address, AVAX);
        expect(bal.total).to.be.equal(Utils.toWei('1000'));
        expect(bal.available).to.be.equal(Utils.toWei('1000'));
    });

    it("Should add a trusted contract to Portfolio from the admin account", async function () {
        const start = await f.latestTime() + 10000;
        const cliff = 20000;
        const duration = 120000;
        const startPortfolioDeposits = start - 10000;
        const revocable = true;
        const percentage = 15;
        const period = 0;

        factory = await f.deployTokenVestingCloneFactory();
        await factory.createTokenVesting(trader2.address, start, cliff, duration, startPortfolioDeposits,
            revocable, percentage, period, portfolio.address, owner.address);
        const count = await factory.count();
        tokenVesting = TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        await usdt.deployed();
        const USDT = Utils.fromUtf8(await usdt.symbol());

        // fail from non-privileged account
        // trader1
        await expect(portfolio.connect(trader1).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode)).to.be.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(trader1).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode)).to.be.revertedWith("AccessControl:");
        // auctionAdmin when removed
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), trader2.address);        // adding trader2 so I can remove auctionAdmin
        await portfolioSub.grantRole(portfolioSub.DEFAULT_ADMIN_ROLE(), trader2.address);  // adding trader2 so I can remove auctionAdmin
        await portfolio.revokeRole(portfolio.DEFAULT_ADMIN_ROLE(), auctionAdmin.address);
        await portfolioSub.revokeRole(portfolioSub.DEFAULT_ADMIN_ROLE(), auctionAdmin.address);
        await expect(portfolio.connect(auctionAdmin).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode)).to.be.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(auctionAdmin).addToken(USDT, usdt.address, auctionMode, await usdt.decimals(), auctionMode)).to.be.revertedWith("AccessControl:");
        // succeed from privileged account
        // auctionAdmin when added
        // await portfolio.grantRole(portfolio.AUCTION_ADMIN_ROLE(), auctionAdmin.address);
        // await portfolioSub.grantRole(portfolioSub.AUCTION_ADMIN_ROLE(), auctionAdmin.address);
        await portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off
        await portfolioSub.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off

        await usdt.mint(owner.address, Utils.toWei('10000'));
        await expect(usdt.transfer(tokenVesting.address, 1000))
                .to.emit(usdt, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);

        // fail from non admin accounts
        await expect(portfolio.connect(trader1).addTrustedContract(tokenVesting.address, "Dexalot")).to.revertedWith("AccessControl:");
        expect(await portfolio.isTrustedContract(tokenVesting.address)).to.be.false;
        // succeed from admin accounts
        await portfolio.connect(owner).addTrustedContract(tokenVesting.address, "Dexalot");
        expect(await portfolio.isTrustedContract(tokenVesting.address)).to.be.true;

        await ethers.provider.send("evm_increaseTime", [5000]);
        await ethers.provider.send("evm_mine", []);

        await usdt.connect(trader2).approve(tokenVesting.address, '150');
        await usdt.connect(trader2).approve(portfolio.address, '150');
        await tokenVesting.connect(trader2).releaseToPortfolio(usdt.address);
        expect((await portfolioSub.getBalance(trader2.address, USDT))[0]).to.equal(150);
        expect(await usdt.balanceOf(trader2.address)).to.equal(0);
    });

    it("Should remove a trusted contract from Portfolio from the admin account", async function () {
        const start = await f.latestTime() + 10000;
        const cliff = 20000;
        const duration = 120000;
        const startPortfolioDeposits = start - 10000;
        const revocable = true;
        const percentage = 15;
        const period = 0;

        factory = await f.deployTokenVestingCloneFactory();
        await factory.createTokenVesting(trader2.address, start, cliff, duration, startPortfolioDeposits,
            revocable, percentage, period, portfolio.address, owner.address);
        const count = await factory.count();
        tokenVesting = TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        await usdt.deployed();
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off
        await portfolioSub.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off

        await usdt.mint(owner.address, Utils.toWei('10000'));
        await usdt.transfer(tokenVesting.address, 1000);

        // fail too add from non admin accounts
        await expect(portfolio.connect(trader1).addTrustedContract(tokenVesting.address, "Dexalot")).to.revertedWith("AccessControl:");
        // succeed to add from admin accounts
        await portfolio.connect(owner).addTrustedContract(tokenVesting.address, "Dexalot");
        expect(await portfolio.trustedContracts(tokenVesting.address)).to.be.true;
        // fail to remove from non admin accounts
        await expect(portfolio.connect(trader1).removeTrustedContract(tokenVesting.address)).to.revertedWith("AccessControl:");
        // succeed to add from admin accounts
        await portfolio.connect(owner).removeTrustedContract(tokenVesting.address);
        expect(await portfolio.trustedContracts(tokenVesting.address)).to.be.false;
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

    it("Should use forceResumeReceive correctly", async () => {
        const {admin,trader1} = await f.getAccounts();

        const MockLayerZeroEndpoint = await smock.mock<LZEndpointMock__factory>("LZEndpointMock");
        lzEndpointMock = await MockLayerZeroEndpoint.deploy(1);

        const portfolioBridge = await f.deployPortfolioBridge(lzEndpointMock as unknown as LZEndpointMock, portfolio);
        await portfolioBridge.grantRole(await portfolioBridge.DEFAULT_ADMIN_ROLE(), portfolio.address);

        const nonce = 0;
        const tx = 1;                // TX = 1 = DEPOSIT [main --> sub]

        const xChainMessageType = 0; // XChainMsgType = 0 = XFER

        const depositAvaxMessage = ethers.utils.defaultAbiCoder.encode(
            [
                "uint64",   // nonce,
                "uint8",    // TX = 1 = DEPOSIT [main --> sub]
                "address",  // trader
                "bytes32",  // symbol
                "uint256",  // quantity
                "uint256"   // timestamp
            ] ,
            [
                nonce,
                tx,
                trader1.address,
                AVAX,
                Utils.toWei("10"),
                await f.latestTime()
            ]
        )

        const depositAvaxPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            [xChainMessageType, depositAvaxMessage]
        )

        const srcChainId = 1;

        const srcAddress = "0x6d6f636b00000000000000000000000000000000";   // address in bytes for successful test
        await portfolioBridge.setLZTrustedRemoteAddress(1, srcAddress);
        const trustedRemote = await portfolioBridge.lzTrustedRemoteLookup(1);
        // fail for non-admin
        await expect(portfolio.connect(trader1).lzForceResumeReceive(1, trustedRemote)).to.be.revertedWith("AccessControl: account");

        // success for admin
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);



        const spPart1 = {
            payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-1),  // the string's byte representation in ts and in evm are different
            dstAddress: portfolioBridge.address,
            payloadHash: ethers.utils.keccak256(depositAvaxPayload)
        }
        const spPart2: any = {};
        spPart2[trustedRemote] = spPart1;
        const sp: any = {};
        sp[srcChainId] = spPart2;

        await lzEndpointMock.setVariable("storedPayload", sp);
        expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.true;
        await portfolio.connect(admin).lzForceResumeReceive(srcChainId, trustedRemote);
        expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.false;
    });

    it("Should use retryPayload correctly", async () => {
        const {admin,trader1} = await f.getAccounts();

        const MockLayerZeroEndpoint = await smock.mock<LZEndpointMock__factory>("LZEndpointMock");
        lzEndpointMock = await MockLayerZeroEndpoint.deploy(1);

        const portfolioBridge = await f.deployPortfolioBridge(lzEndpointMock as unknown as LZEndpointMock, portfolio);
        await portfolioBridge.grantRole(await portfolioBridge.DEFAULT_ADMIN_ROLE(), portfolio.address);
        await portfolioBridge.addToken(AVAX, ZERO_ADDRESS, 1, 18, auctionMode); //Auction mode off

        const nonce = 0;
        const tx = 0;                // TX = 0 = WITHDRAW [sub --> main]
        const srcChainId = 1;
        const symbolId = Utils.fromUtf8("AVAX"+ srcChainId)

        const xChainMessageType = 0; // XChainMsgType = 0 = XFER

        const depositAvaxMessage = ethers.utils.defaultAbiCoder.encode(
            [
                "uint64",   // nonce,
                "uint8",    // TX
                "address",  // trader
                "bytes32",  // symbol
                "uint256",  // quantity
                "uint256"   // timestamp
            ] ,
            [
                nonce,
                tx,
                trader1.address,
                symbolId,
                Utils.toWei("10"),
                await f.latestTime()
            ]
        )

        const depositAvaxPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            [xChainMessageType, depositAvaxMessage]
        )

        //const trustedRemote  = ethers.utils.solidityPack([ "address", "address" ], [ lzAppMock.address, lzAppMock.address ])
        const srcAddress = "0x6d6f636b00000000000000000000000000000000";   // address in bytes for successful test
        await portfolioBridge.setLZTrustedRemoteAddress(1, srcAddress);
        const trustedRemote = await portfolioBridge.lzTrustedRemoteLookup(srcChainId);
        // fail for non-admin
        await expect(portfolio.connect(trader1).lzRetryPayload(srcChainId, trustedRemote, depositAvaxPayload)).to.be.revertedWith("AccessControl: account");

        // fail as the account does not have money to actually withdraw, the success test is tested elsewhere
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);

        const spPart1 = {
            payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-1),  // the string's byte representation in ts and in evm are different
            dstAddress: portfolioBridge.address,
            payloadHash: ethers.utils.keccak256(depositAvaxPayload)
        }
        const spPart2: any = {};
        spPart2[trustedRemote] = spPart1;
        const sp: any = {};
        sp[srcChainId] = spPart2;

        await lzEndpointMock.setVariable("storedPayload", sp);
        expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.true;
        await expect(portfolio.connect(admin).lzRetryPayload(srcChainId, trustedRemote, depositAvaxPayload)).to.be.revertedWith("P-WNFA-01");
    });
});
