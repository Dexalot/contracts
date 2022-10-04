/**
 * The test runner for Dexalot PortfolioMain contract
 * Please do not test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import {
    LZEndpointMock,
    PortfolioBridge,
    PortfolioBridgeSub,
    PortfolioMain,
    PortfolioSub
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";

describe("Portfolio Main", () => {
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let portfolioBridgeMain: PortfolioBridge;

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");

    const srcChainId: any = 1;

    const tokenDecimals = 18;
    const auctionMode: any = 0;

    beforeEach(async function () {

        const {portfolioMain: portfolioM, portfolioSub: portfolioS, lzEndpointMain, portfolioBridgeMain: pbrigeMain, portfolioBridgeSub: pbrigeSub, gasStation: gStation} = await f.deployCompletePortfolio();
        portfolioMain = portfolioM;
        portfolioSub = portfolioS;
        portfolioBridgeMain =pbrigeMain;


    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolioMain.initialize(AVAX, srcChainId)).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should add and remove ERC20 token to portfolio main", async () => {
        const {trader1} = await f.getAccounts();
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        // fail for non-admin
        await expect(portfolioMain.connect(trader1).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode)).to.be.revertedWith("AccessControl:");
        // succeed for admin
        await portfolioMain.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off
        const tokens = await portfolioMain.getTokenList();
        expect(tokens[1]).to.equal(USDT);

        await expect(portfolioMain.removeToken(USDT)).to.be.revertedWith("Pausable: not paused");
        await portfolioMain.pause();
        await expect(portfolioMain.connect(trader1).removeToken(USDT)).to.be.revertedWith("AccessControl: account");

        await expect(portfolioMain.removeToken(USDT))
        .to.emit(portfolioMain, "ParameterUpdated")
        .withArgs(USDT, "P-REMOVETOKEN", 0, 0);

        // do nothing for non-existent token
        await portfolioMain.removeToken(Utils.fromUtf8("MOCK"))
    });

    it("Should not add ERC20 token to portfolio main if parameters are incorrect", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        portfolioMain.removeToken(AVAX); // silent fail

        //await expect(portfolioMain.addToken(AVAX, "0x0000000000000000000000000000000000000000", srcChainId, 2, auctionMode)).to.be.revertedWith("P-CNAT-01");

        await expect(portfolioMain.addToken(USDT, usdt.address, srcChainId, 0, auctionMode)).to.be.revertedWith("P-CNAT-01");
        await expect(portfolioMain.addToken(USDT, "0x0000000000000000000000000000000000000000", srcChainId, tokenDecimals, auctionMode)).to.be.revertedWith("P-CNAT-01");
        await expect(portfolioMain.addToken(Utils.fromUtf8("MOCK"), usdt.address, srcChainId, tokenDecimals, auctionMode)).to.be.revertedWith("P-TSDM-01");
        await expect(portfolioMain.addToken(USDT, usdt.address, srcChainId, 2, auctionMode)).to.be.revertedWith("P-TDDM-01");
    });

    it("Should not remove erc20 if it has deposits", async () => {
        const {trader1} = await f.getAccounts();
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        await usdt.mint(trader1.address, ethers.utils.parseEther("100"))

        await f.addToken(portfolioMain, usdt, 1);
        await f.addToken(portfolioSub, usdt, 1);

        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, "100")

        expect((await portfolioSub.getBalance(trader1.address, USDT)).total.toString()).to.equal(Utils.parseUnits("100", token_decimals));
        await portfolioMain.pause();
        await expect(portfolioMain.removeToken(USDT))
        .to.be.revertedWith("P-NZBL-01");
    });

    it("Should get token details", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await f.addToken(portfolioMain, usdt, 0);
        await f.addToken(portfolioSub, usdt, 0);

        let tokenDetails = await portfolioMain.getTokenDetails(USDT);
        expect(tokenDetails.tokenAddress).to.equal(usdt.address);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);

        tokenDetails = await portfolioMain.getTokenDetails(AVAX);
        expect(tokenDetails.tokenAddress).to.equal("0x0000000000000000000000000000000000000000");
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(18);

        tokenDetails = await portfolioMain.getTokenDetails(Utils.fromUtf8("USDC"));
        expect(tokenDetails.tokenAddress).to.equal("0x0000000000000000000000000000000000000000");
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(0);
    });

    it("Should use processXFerPayload() correctly", async () => {
        const { owner, trader2 } = await f.getAccounts();
        // make owner part of PORTFOLIO_BRIDGE_ROLE on PortfolioMain
        await portfolioMain.grantRole(await portfolioMain.PORTFOLIO_BRIDGE_ROLE(), owner.address)
        // processing of deposit messages will fail on mainnet
        let Tx = 1;  // DEPOSIT

        await expect(portfolioMain.processXFerPayload(trader2.address, AVAX, Utils.toWei("0.01"), Tx)).to.be.revertedWith("P-PTNS-01");

        Tx = 0;  // WITHDRAW
        // fail with 0 quantity
        await expect(portfolioMain.processXFerPayload(owner.address, AVAX, 0, Tx)).to.be.revertedWith("P-ZETD-01");

        // fail due to failed send
        await expect(portfolioMain.processXFerPayload(owner.address, AVAX, Utils.toWei("0.01"), Tx)).to.be.revertedWith("P-WNFA-01");

        // fail due to token not in portfolioMain
        await expect(portfolioMain.processXFerPayload(owner.address, ALOT, Utils.toWei("0.01"), Tx)).to.be.revertedWith("P-ETNS-02");
    });

    it("Should have no effect on PortfolioMain by running updateTransferFeeRate()", async () => {
        const tx = await portfolioMain.updateTransferFeeRate(10, 0);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on PortfolioMain by running setAuctionMode()", async () => {
        const tx = await portfolioMain.setAuctionMode(ALOT, 0);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on PortfolioMain by running withdrawNative()", async () => {
        const { owner } = await f.getAccounts();
        const tx = await portfolioMain.withdrawNative(owner.address, Utils.toWei("10"));
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on PortfolioMain by running withdrawToken()", async () => {
        const { owner } = await f.getAccounts();
        const tx = await portfolioMain.withdrawToken(owner.address, ALOT, Utils.toWei("10"), 0);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on PortfolioMain by running adjustAvailable()", async () => {
        const { owner } = await f.getAccounts();
        const tx = await portfolioMain.adjustAvailable(0, owner.address, ALOT, Utils.toWei("10"));
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on PortfolioMain by running addExecution()", async () => {
        const { trader1, trader2 } = await f.getAccounts();
        const tx = await portfolioMain.addExecution(0, trader1.address, trader2.address, AVAX, ALOT, Utils.toWei("10"), Utils.toWei("10"), 0, 0);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });
});
