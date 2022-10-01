/**
 * The test runner for Dexalot Exchange contract
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    ExchangeMain,
    MockToken,
    PortfolioMain,
    PriceFeedMock__factory
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";

describe("Exchange Main", function () {
    let PriceFeed: PriceFeedMock__factory;
    let mockToken: MockToken;
    let exchange: ExchangeMain;
    let portfolio: PortfolioMain;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

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
        const {portfolioMain: portfolioM} = await f.deployCompletePortfolio();
        portfolio = portfolioM;
        exchange = await f.deployExchangeMain(portfolio)

        mockToken = await f.deployMockToken("MOCK", 18);

        PriceFeed = await ethers.getContractFactory("PriceFeedMock");
    });

    describe("Exchange", function () {

        it("Should not initialize again after deployment", async function () {
            await expect(exchange.initialize()).to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("Should use addToken correctly by auction admin", async function () {
            const srcChainId = 1;
            const tokenDecimals = 18;
            const auctionMode: any = 0;

            // fail for non-admin & Admin
            await expect(exchange.connect(trader1).addToken(MOCK, mockToken.address, srcChainId, tokenDecimals, auctionMode)).to.be.revertedWith("AccessControl:");
            await expect(exchange.addToken(MOCK, mockToken.address, srcChainId, tokenDecimals, auctionMode)).to.be.revertedWith("AccessControl:");

            await exchange.removeAdmin(auctionAdmin.address);
            await expect(exchange.connect(auctionAdmin).addToken(MOCK, mockToken.address, srcChainId, tokenDecimals, auctionMode)).to.be.revertedWith("AccessControl:");

            // succeed for auctionAdmin
            await exchange.addAuctionAdmin(auctionAdmin.address);
            await exchange.connect(auctionAdmin).addToken(MOCK, mockToken.address, srcChainId, tokenDecimals, auctionMode);
        });


        it("Should set chainlink price feed correctly by auction admin", async function () {
            const priceFeed = await PriceFeed.deploy();
            const chainlinkTestAddress = priceFeed.address;
            // fail with non admin
            await expect(exchange.connect(trader1).setPriceFeed(chainlinkTestAddress)).to.revertedWith("AccessControl:");
            // fail with admin
            await  expect(exchange.setPriceFeed(chainlinkTestAddress)).to.be.revertedWith("AccessControl:");

            // succeed with auction admin
            await exchange.addAuctionAdmin(auctionAdmin.address);
            await exchange.connect(auctionAdmin).setPriceFeed(chainlinkTestAddress);
            //await exchange.setPriceFeed(chainlinkTestAddress)
            expect(await exchange.getPriceFeed()).to.be.equal(chainlinkTestAddress);
        });

        it("Should set up test price feed contract correctly", async function () {
            const priceFeed = await PriceFeed.deploy();
            expect(await priceFeed.decimals()).to.be.equal(18);
            expect(await priceFeed.description()).to.be.equal("Price Feed Test");
            expect(await priceFeed.version()).to.be.equal(1);
            const res = await priceFeed.latestRoundData();
            expect(res[0].toString()).to.be.equal("36893488147419156216");
            expect(res[1]).to.be.equal(7504070821);
            expect(res[2]).to.be.equal(1646589377);
            expect(res[3]).to.be.equal(1646589377);
            expect(res[4].toString()).to.be.equal("36893488147419156216");
        });

        it("Should use isHead() correctly", async function () {
            const priceFeed = await PriceFeed.deploy();
            const chainlinkTestAddress = priceFeed.address;
            await exchange.addAuctionAdmin(auctionAdmin.address);
            await exchange.connect(auctionAdmin).setPriceFeed(chainlinkTestAddress)
            // fail for owner
            await expect(exchange.isHead()).to.be.revertedWith("AccessControl:");
            // succeed for auction admin
            const res = await exchange.connect(auctionAdmin).isHead();
            // round id
            expect(res[0].toString()).to.be.equal('36893488147419156216');
            // price
            expect(res[1]).to.be.equal(7504070821);
            // outcome
            expect(res[2]).to.be.false;
        });

        it("Should use flipCoin() correctly", async function () {
            const priceFeed = await PriceFeed.deploy();
            const chainlinkTestAddress = priceFeed.address;
            await exchange.addAuctionAdmin(auctionAdmin.address);
            await exchange.connect(auctionAdmin).setPriceFeed(chainlinkTestAddress);
            await expect(exchange.connect(auctionAdmin).flipCoin())
                .to.emit(exchange, "CoinFlipped")
                .withArgs(ethers.BigNumber.from("36893488147419156216"), 7504070821, false);
        });

        it("Should pause for upgrading", async function () {
            await exchange.pauseForUpgrade(true)
            expect(await portfolio.paused()).to.be.true;
        });

    });
});
