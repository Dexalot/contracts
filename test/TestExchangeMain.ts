/**
 * The test runner for Dexalot Exchange contract
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    ExchangeMain,
    MockToken,
    PortfolioMain,
    MainnetRFQ,
    TokenVestingCloneable__factory,
    TokenVestingCloneFactory,
    TokenVestingCloneable,

} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { ContractFactory } from 'ethers';

describe("Exchange Main", function () {
    let PriceFeed: ContractFactory;
    let mockToken: MockToken;
    let exchange: ExchangeMain;
    let mainnetRFQAvax: MainnetRFQ;

    let portfolio: PortfolioMain;
    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let factory: TokenVestingCloneFactory;
    let TokenVestingCloneable: TokenVestingCloneable__factory;
    let tokenVesting: TokenVestingCloneable;

    const MOCK = Utils.fromUtf8("MOCK");

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
    });

    beforeEach(async function () {
        const portfolioContracts = await f.deployCompletePortfolio(true);
        portfolio = portfolioContracts.portfolioMainnet;
        mainnetRFQAvax = portfolioContracts.mainnetRFQ;

        exchange = await f.deployExchangeMain(portfolio, mainnetRFQAvax)
        mockToken = await f.deployMockToken("MOCK", 18);
        TokenVestingCloneable = await ethers.getContractFactory("TokenVestingCloneable") as TokenVestingCloneable__factory;
    });

    describe("Exchange", function () {

        it("Should not initialize again after deployment", async function () {
            await expect(exchange.initialize()).to.be.revertedWith("Initializable: contract is already initialized");

        });

        it("Should be initialized correctly", async function () {
            expect(await exchange.getMainnetRfq()).to.be.equal(mainnetRFQAvax.address);
            expect(await exchange.getPortfolio()).to.be.equal(portfolio.address);
        });

        it("Should use addToken correctly by auction admin", async function () {
            const token_decimals = 18;

            // fail for non-admin & Admin
            await expect(exchange.connect(trader1).addToken(MOCK, mockToken.address,  token_decimals, token_decimals, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
            await expect(exchange.addToken(MOCK, mockToken.address, token_decimals, token_decimals, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");

            await exchange.removeAdmin(auctionAdmin.address);
            await expect(exchange.connect(auctionAdmin).addToken(MOCK, mockToken.address, token_decimals, token_decimals,  '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");

            // succeed for auctionAdmin
            await exchange.addAuctionAdmin(auctionAdmin.address);
            await exchange.connect(auctionAdmin).addToken(MOCK, mockToken.address, token_decimals, token_decimals, '0', ethers.utils.parseUnits('0.5',token_decimals));
        });

        it("Should fail to pause mainnetrfq if not admin", async function () {
            await expect(exchange.connect(trader1).pauseMainnetRfq(true)).to.be.revertedWith("AccessControl:");
        });

        it("Should pause for upgrading", async function () {
            await exchange.pauseForUpgrade(true)
            expect(await portfolio.paused()).to.be.true;
            expect(await mainnetRFQAvax.paused()).to.be.true;

        });

        it("Should set and get mainnetRFQ contract address correctly", async function () {
            // fail for non admin account
            await expect(exchange.connect(trader1).setMainnetRFQ(mainnetRFQAvax.address)).to.be.revertedWith("AccessControl:");
            // succeed for admin account
            await exchange.setMainnetRFQ(mainnetRFQAvax.address);
            expect(await exchange.getMainnetRfq()).to.be.equal(mainnetRFQAvax.address);
        });


        it("Should pause and unpause Portfolio & mainnetRFQ when out of synch", async function () {
            await expect(mainnetRFQAvax.connect(trader1).pause()).to.be.revertedWith("AccessControl: account");

            await mainnetRFQAvax.grantRole(await mainnetRFQAvax.DEFAULT_ADMIN_ROLE(), owner.address);
            await mainnetRFQAvax.connect(owner).pause();
            expect(await mainnetRFQAvax.paused()).to.be.true;

            await exchange.pauseForUpgrade(true);
            expect(await portfolio.paused()).to.be.true;
            expect(await mainnetRFQAvax.paused()).to.be.true;

            await mainnetRFQAvax.connect(owner).unpause();
            expect(await mainnetRFQAvax.paused()).to.be.false;

            await exchange.pauseForUpgrade(false);
            expect(await portfolio.paused()).to.be.false;
            expect(await mainnetRFQAvax.paused()).to.be.false;

            // they are in synch
            await exchange.pauseForUpgrade(true);
            expect(await portfolio.paused()).to.be.true;
            expect(await mainnetRFQAvax.paused()).to.be.true;

            await exchange.pauseForUpgrade(false);
            expect(await portfolio.paused()).to.be.false;
            expect(await mainnetRFQAvax.paused()).to.be.false;
        });


        it("Should set, check and remove trusted contract address ONLY from Auction Admin correctly", async function () {

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


            const auction_role_admin = await exchange.AUCTION_ADMIN_ROLE();
            // ADD exchange as a default admin to portfolio,
            await portfolio.grantRole(auction_role_admin, exchange.address)
            // fail for non admin account
            await expect(exchange.connect(trader1).addTrustedContract(tokenVesting.address, "TestingTrusted")).to.be.revertedWith("AccessControl:");
            // succeed for auction admin account
            //Add an auction admin to Exchange
            await exchange.addAuctionAdmin(auctionAdmin.address)
            await exchange.connect(auctionAdmin).addTrustedContract(tokenVesting.address, "TestingTrusted");
            expect(await exchange.isTrustedContract(tokenVesting.address)).to.be.true;
            // REMOVE
            // fail for non admin account
            await expect(exchange.connect(trader1).removeTrustedContract(tokenVesting.address)).to.be.revertedWith("AccessControl:");
            // succeed for admin account
            await exchange.connect(auctionAdmin).removeTrustedContract(tokenVesting.address);
            expect(await exchange.isTrustedContract(tokenVesting.address)).to.be.false;
        });

    });
});
