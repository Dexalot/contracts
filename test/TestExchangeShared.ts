/**
 * The test runner for Dexalot Exchange contract
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    ExchangeMain,
    ExchangeSub,
    MockToken,
    MockToken__factory,
    OrderBooks,
    PortfolioMain,
    PortfolioSub,
    TradePairs
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";

describe("Exchange Shared", function () {
    let MockToken: MockToken__factory;
    let exchange: ExchangeMain;
    let portfolio: PortfolioMain;

    let quoteToken: MockToken;
    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;
    let treasurySafe: SignerWithAddress;

    before(async function () {
        MockToken = await ethers.getContractFactory("MockToken");
    });

    beforeEach(async function () {
        [owner, admin, auctionAdmin, trader1, trader2, treasurySafe] = await ethers.getSigners();

        const {portfolioMain: portfolioM} = await f.deployCompletePortfolio();
        portfolio = portfolioM;
        exchange = await f.deployExchangeMain(portfolio)

    });

    describe("Exchange", function () {

        it("Should set and get portfolio contract address correctly", async function () {
            // fail for non admin account
            await expect(exchange.connect(trader1).setPortfolio(portfolio.address)).to.be.revertedWith("AccessControl:");
            // succeed for admin account
            await exchange.setPortfolio(portfolio.address);
            expect(await exchange.getPortfolio()).to.be.equal(portfolio.address);
        });

        it("Should add and remove admin correctly", async function () {
            // fail for non admin account
            await expect(exchange.connect(trader1).addAdmin(trader1.address)).to.be.revertedWith("AccessControl:");
            // succeed for admin account
            await exchange.addAdmin(trader1.address)
            expect(await exchange.isAdmin(trader1.address)).to.be.true;
            // fail for non admin account
            await expect(exchange.connect(trader2).removeAdmin(trader1.address)).to.be.revertedWith("AccessControl:");
            // succeed for admin account
            await exchange.connect(trader1).removeAdmin(trader1.address);
            expect(await exchange.isAdmin(trader1.address)).to.be.false;
            // fail to remove last admin
            await exchange.removeAdmin(treasurySafe.address)
            await exchange.removeAdmin(admin.address)
            await expect(exchange.removeAdmin(owner.address)).to.be.revertedWith("E-ALOA-01");
            expect(await exchange.isAdmin(owner.address)).to.be.true;
        });

        it("Should add and remove auction admin correctly", async function () {
            // fail for non admin account
            await expect(exchange.connect(trader1).addAuctionAdmin(trader1.address)).to.be.revertedWith("AccessControl:");
            // succeed for admin account
            await exchange.addAuctionAdmin(trader2.address)
            expect(await exchange.isAuctionAdmin(trader2.address)).to.be.true;
            // fail for non admin account
            await expect(exchange.connect(trader1).removeAuctionAdmin(trader1.address)).to.be.revertedWith("AccessControl:");
            // succeed for admin account
            await exchange.removeAuctionAdmin(trader2.address)
            expect(await exchange.isAuctionAdmin(trader2.address)).to.be.false;
        });



        it("Should not accept via fallback()", async function () {
            const ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
            const iface = new ethers.utils.Interface(ABI)
            const calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader2.address, Utils.toWei('100')])
            await expect(owner.sendTransaction({to: exchange.address, data: calldata}))
                .to.be.revertedWith("E-NFUN-01")
        })

        it("Should add token from the Auction Admin account", async function () {
            const srcChainId = 1;
            const quoteTokenStr = "Quote Token";
            const quoteSymbolStr = "QT"
            const quoteDecimals = 6;
            const quoteSymbol = Utils.fromUtf8(quoteSymbolStr);
            const mode: any = 0;  // auction off

            quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals);

            // fail from non admin accounts
            await expect(exchange.connect(trader1).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))).to.revertedWith("AccessControl:");
            await expect(exchange.addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals))).to.revertedWith("AccessControl:");
            //Add an auction admin to Exchange
            await exchange.addAuctionAdmin(auctionAdmin.address)
            // succeed from admin accounts
            await exchange.connect(auctionAdmin).addToken(quoteSymbol, quoteToken.address, srcChainId, await quoteToken.decimals(), mode, '0', ethers.utils.parseUnits('0.5',quoteDecimals));
            const tokenList = await portfolio.getTokenList();

            expect(tokenList.length).to.be.equal(2);
            expect(tokenList[1]).to.be.equal(quoteSymbol);
        });

        it("Should convert string to bytes32 correctly", async function () {
            const test_text = "IS THIS CORRECT";
            const zero_str = "";
            const zero_str_bytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
            expect(await exchange.stringToBytes32(test_text)).to.be.equal(ethers.utils.formatBytes32String(test_text));
            expect(await exchange.stringToBytes32(zero_str)).to.be.equal(zero_str_bytes32);
        });

        it("Should convert bytes32 to string correctly", async function () {
            const test_text = "IS THIS CORRECT";
            expect(await exchange.bytes32ToString(ethers.utils.formatBytes32String(test_text))).to.be.equal(test_text);
        });

        it("Should pause and unpause portfolio from the admin account", async function () {
            // fail from non admin accounts
            await expect(exchange.connect(trader1).pausePortfolio(true)).to.revertedWith("AccessControl:");
            // succeed from admin accounts
            await exchange.addAdmin(admin.address);
            await exchange.connect(admin).pausePortfolio(true);
            expect(await portfolio.paused()).to.be.true;
            await exchange.connect(admin).pausePortfolio(false);
            expect(await portfolio.paused()).to.be.false;
        });

        it("Should reject sending gas token directly to exchange contract.", async () => {
            const balBefore = await ethers.provider.getBalance(owner.address);
            const msg = "Transaction reverted:";
            try {
                await owner.sendTransaction({to: exchange.address,
                                             value: Utils.toWei('1')})
            } catch(err: any) {
                expect(err.message.includes(msg)).to.be.true;
             }
            const balAfter = await ethers.provider.getBalance(owner.address);
            expect(balBefore).to.be.equal(balAfter);
        });

    });
});
