/**
 * The test runner for Dexalot Portfolio Bridge Main
 */

import Utils from "./utils";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    PortfolioBridge,
    PortfolioMain,
    MockToken,
    LZEndpointMock,
} from "../typechain-types"

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

describe("Portfolio Bridge Main", () => {
    let portfolioMain: PortfolioMain;
    let lzEndpointMain: LZEndpointMock;
    let portfolioBridgeMain: PortfolioBridge;
    let mock: MockToken;

    let delayPeriod: number;
    let epochLength: number;
    let delayThreshold: BigNumber;
    let volumeCap: BigNumber;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let depositAvaxMessage: string;
    let depositAvaxPayload: string;

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");

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

        mock = await f.deployMockToken("MOCK", 18);
    });

    beforeEach(async function () {
        const {portfolioMain: pm, portfolioBridgeMain: pbm, lzEndpointMain: lze} = await f.deployCompletePortfolio();
        portfolioMain = pm;
        portfolioBridgeMain = pbm;
        lzEndpointMain = lze;

        const nonce = 0;
        const tx = 1;                // TX = 1 = DEPOSIT [main --> sub]

        const xChainMessageType = 0; // XChainMsgType = 0 = XFER

        depositAvaxMessage = ethers.utils.defaultAbiCoder.encode(
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

        depositAvaxPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            [xChainMessageType, depositAvaxMessage]
        )

        delayPeriod = 10000
        epochLength = 100000
        delayThreshold = ethers.utils.parseEther("0.5");
        volumeCap = ethers.utils.parseEther("1");
    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolioBridgeMain.initialize(lzEndpointMain.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should return portfolio address", async () => {
        expect(await portfolioBridgeMain.getPortfolio()).to.equal(portfolioMain.address);
    });

    it("Should pause and unpause", async () => {
        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).pause()).to.be.revertedWith("AccessControl:");

        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
        // succeed for non-owner
        await portfolioBridgeMain.pause();
        expect(await portfolioBridgeMain.paused()).to.be.true;

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).unpause()).to.be.revertedWith("AccessControl:");
        // succeed for non-owner
        await portfolioBridgeMain.unpause();
        expect(await portfolioBridgeMain.paused()).to.be.false;
    });

    it("Should enable and disable bridge", async () => {
        const {owner, trader1} = await f.getAccounts();

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).enableBridgeProvider(0, true)).to.be.revertedWith("AccessControl:");
        await expect(portfolioBridgeMain.connect(trader1).enableBridgeProvider(1, true)).to.be.revertedWith("AccessControl:");
        await expect(portfolioBridgeMain.connect(trader1).enableBridgeProvider(0, false)).to.be.revertedWith("AccessControl:");
        await expect(portfolioBridgeMain.connect(trader1).enableBridgeProvider(1, false)).to.be.revertedWith("AccessControl:");
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
        //Can't disable default bridge
        expect(portfolioBridgeMain.enableBridgeProvider(0, false)).to.be.revertedWith("PB-DBCD-01");
        expect(portfolioBridgeMain.enableBridgeProvider(1, false)).to.be.revertedWith("PB-DBCD-01");
        expect(await portfolioBridgeMain.isBridgeProviderEnabled(0)).to.be.true;
        // // succeed for owner
        await portfolioBridgeMain.enableBridgeProvider(1, true);
        expect(await portfolioBridgeMain.isBridgeProviderEnabled(1)).to.be.true;
        await portfolioBridgeMain.enableBridgeProvider(1, false);
        expect(await portfolioBridgeMain.isBridgeProviderEnabled(1)).to.be.false;
    });

    it("Should return bridge status", async () => {
        expect(await portfolioBridgeMain.isBridgeProviderEnabled(0)).to.be.true;
        expect(await portfolioBridgeMain.isBridgeProviderEnabled(1)).to.be.false;
    });

    it("Should revoke role", async () => {
        const {owner, admin, trader1} = await f.getAccounts();
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.revertedWith("PB-ALOA-01");
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.DEFAULT_ADMIN_ROLE(), admin.address);

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).revokeRole(await portfolioBridgeMain.DEFAULT_ADMIN_ROLE(), admin.address))
            .to.be.revertedWith("AccessControl:");

        // succeed for non-owner
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.DEFAULT_ADMIN_ROLE(), admin.address))
            .to.emit(portfolioBridgeMain, "RoleUpdated")
            .withArgs("PORTFOLIOBRIDGE", "REMOVE-ROLE", await portfolioBridgeMain.DEFAULT_ADMIN_ROLE(), admin.address);
    });

    it("Should set portfolio", async () => {
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.DEFAULT_ADMIN_ROLE(), admin.address);

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).setPortfolio(portfolioMain.address)).to.be.revertedWith("AccessControl:");

        // succeed for non-owner
        await portfolioBridgeMain.setPortfolio(portfolioMain.address);
        expect(await portfolioBridgeMain.getPortfolio()).to.be.equal(portfolioMain.address);

        const tokenDetails = await portfolioBridgeMain.getTokenList();
        const srcChainId =1;
        expect(tokenDetails[0]).to.be.equal(Utils.fromUtf8("AVAX" + srcChainId))
    });

    it("Should not revoke role if it is the only member or portfolio", async () => {
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address)).to.be.revertedWith("PB-ALOA-02");
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address))
        .to.emit(portfolioBridgeMain, "RoleUpdated")
        .withArgs("PORTFOLIOBRIDGE", "REMOVE-ROLE", await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
    });

    it("Should set gasForDestinationLzReceive correctly", async () => {
        const gasForDestinationLzReceive = BigNumber.from(500000);

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).setGasForDestinationLzReceive(gasForDestinationLzReceive)).to.be.revertedWith("AccessControl:");

        // succeed for non-owner
        await expect(portfolioBridgeMain.setGasForDestinationLzReceive(gasForDestinationLzReceive))
        .to.emit(portfolioBridgeMain, "GasForDestinationLzReceiveUpdated")
        .withArgs(gasForDestinationLzReceive);

        expect(await portfolioBridgeMain.gasForDestinationLzReceive()).to.be.equal(gasForDestinationLzReceive);
    });

    it("Should use addToken correctly for native coin", async () => {
        const AVAX = Utils.fromUtf8("AVAX");
        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
        const srcChainId = 1;
        const tokenDecimals = 18;
        const auctionMode: any = 0;

        // fail for non-privileged role
        await expect(portfolioBridgeMain.connect(trader1).addToken(AVAX, ZERO_ADDRESS, srcChainId, tokenDecimals, auctionMode))
            .to.be.revertedWith("PB-OACC-01");

        // succeed for default admin role
        await portfolioBridgeMain.addToken(AVAX, ZERO_ADDRESS, srcChainId, tokenDecimals, auctionMode);
        expect((await portfolioBridgeMain.getTokenList()).length).to.equal(1);
        const tdet = await portfolioBridgeMain.getTokenDetails(Utils.fromUtf8("AVAX" + 1))
        expect(tdet.decimals).to.equal(tokenDecimals);
        expect(tdet.tokenAddress).to.equal(ZERO_ADDRESS);
        expect(tdet.auctionMode).to.equal(auctionMode);
        expect(tdet.srcChainId).to.equal(srcChainId);
        expect(tdet.symbol).to.equal(AVAX);
        expect(tdet.symbolId).to.equal(Utils.fromUtf8("AVAX" + srcChainId));

        // silent fail / do nothing if native token is already added
        await portfolioBridgeMain.addToken(AVAX, ZERO_ADDRESS, srcChainId, tokenDecimals, auctionMode);
        expect((await portfolioBridgeMain.getTokenList()).length).to.equal(1);
    });

    it("Should use addToken correctly for ERC20 tokens", async () => {
        const MOCK = Utils.fromUtf8(await mock.symbol());
        const srcChainId = 1;
        const tokenDecimals = await mock.decimals();
        const auctionMode: any = 0;

        // fail for non-privileged role
        await expect(portfolioBridgeMain.connect(trader1).addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode))
            .to.be.revertedWith("PB-OACC-01");

        // fail if token is not in Portfolio common symbols
        await expect(portfolioBridgeMain.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode))
            .to.be.revertedWith("PB-SDMP-01");

        // succeed for default admin role
        await portfolioMain.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode);
        expect((await portfolioBridgeMain.getTokenList()).length).to.equal(2);
        await portfolioBridgeMain.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode);
        const tdet = await portfolioBridgeMain.getTokenDetails(Utils.fromUtf8("MOCK" + 1))
        expect(tdet.decimals).to.equal(tokenDecimals);
        expect(tdet.tokenAddress).to.equal(mock.address);
        expect(tdet.auctionMode).to.equal(auctionMode);
        expect(tdet.srcChainId).to.equal(srcChainId);
        expect(tdet.symbol).to.equal(MOCK);
        expect(tdet.symbolId).to.equal(Utils.fromUtf8("MOCK" + srcChainId));

        // silent fail / do nothing if ERC20 token is already added
        await portfolioBridgeMain.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode);
        expect((await portfolioBridgeMain.getTokenList()).length).to.equal(2);
    });

    it("Should use removeToken correctly for native coins", async () => {
        const AVAX = Utils.fromUtf8("AVAX");
        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
        const srcChainId = 1;
        const tokenDecimals = await mock.decimals();
        const auctionMode: any = 0;

        await portfolioBridgeMain.addToken(AVAX, ZERO_ADDRESS, srcChainId, tokenDecimals, auctionMode);
        expect(await portfolioBridgeMain.getTokenList()).to.include(Utils.fromUtf8("AVAX" + srcChainId));

        // fail not paused
        await expect(portfolioBridgeMain.connect(trader1).removeToken(AVAX, srcChainId))
            .to.be.revertedWith("Pausable: not paused");

        // fail for non-privileged role
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
        await portfolioBridgeMain.pause();
        await expect(portfolioBridgeMain.connect(trader1).removeToken(AVAX, srcChainId))
            .to.be.revertedWith("PB-OACC-01");

        // silent fail for default admin role as you cannot remove native token
        await portfolioBridgeMain.removeToken(Utils.fromUtf8("AVAX" + srcChainId), srcChainId);
        expect(await portfolioBridgeMain.getTokenList()).to.include(Utils.fromUtf8("AVAX" + srcChainId));
    });

    it("Should use removeToken correctly for ERC20 tokens", async () => {
        const MOCK = Utils.fromUtf8(await mock.symbol());
        const srcChainId = 1;
        const tokenDecimals = 18;
        const auctionMode: any = 0;

        await portfolioMain.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode);
        expect((await portfolioBridgeMain.getTokenList()).length).to.equal(2);  // AVAX + MOCK
        expect(await portfolioBridgeMain.getTokenList()).to.include(Utils.fromUtf8("MOCK" + srcChainId));

        // fail not paused
        await expect(portfolioBridgeMain.connect(trader1).removeToken(MOCK, srcChainId))
            .to.be.revertedWith("Pausable: not paused");

        // fail for non-privileged role
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
        await portfolioBridgeMain.pause();
        await expect(portfolioBridgeMain.connect(trader1).removeToken(MOCK, srcChainId))
            .to.be.revertedWith("PB-OACC-01");

        // succeed for default admin role
        await portfolioBridgeMain.removeToken(MOCK, srcChainId);
        expect(await portfolioBridgeMain.getTokenList()).to.not.include(Utils.fromUtf8("MOCK" + srcChainId));
    });

    it("Should use lzReceive correctly", async () => {
        const srcChainId = 1;
        // fail from wrong address - instead of lzEndpoint address passed trader2 address
        await expect(portfolioBridgeMain.lzReceive(srcChainId, trader2.address, 0, depositAvaxPayload)).to.be.revertedWith("PB-IVEC-01");
    });

    it("Should use sendXChainMessage correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ
        const bridge1 = 1;            // BridgeProvider = 1 = Celer
        const bridge3 = 3;            // BridgeProvider = 3 = does not exist

        const nonce = 0;
        const transaction1 = 1;                // transaction = 1 = DEPOSIT [main --> sub]
        const transaction5 = 5;                // transaction = 5 = does not exist
        const trader = trader1.address;
        const symbol = AVAX;
        const quantity = Utils.toWei("10");
        const timestamp = BigNumber.from(await f.latestTime());
        const srcChainId = 1;
        const symbolId = Utils.fromUtf8("AVAX"+ srcChainId)

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp
        };

        let xfer5: any = {};
        xfer5 = {nonce,
                 transaction: transaction5,
                 trader,
                 symbol,
                 quantity,
                 timestamp
        };

        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
        // fail paused contract
        await portfolioBridgeMain.pause();
        await expect(portfolioBridgeMain.sendXChainMessage(bridge0, xfer1)).to.be.revertedWith("Pausable: paused");
        await portfolioBridgeMain.unpause();

        // fail for non-message sender role
        await expect(portfolioBridgeMain.connect(trader1).sendXChainMessage(bridge0, xfer1)).to.be.revertedWith("AccessControl:");
        // fail for wrong BridgeProvider
        await expect(portfolioBridgeMain.sendXChainMessage(bridge3, xfer1)).to.be.revertedWith("Transaction reverted: function");

        // fail for wrong transaction type
        await expect(portfolioBridgeMain.sendXChainMessage(bridge0, xfer5)).to.be.revertedWith("P-PTNS-02");

        // fail - bridge provider enabled but not implemented
        await portfolioBridgeMain.enableBridgeProvider(bridge1, true);
        expect(await portfolioBridgeMain.isBridgeProviderEnabled(bridge1)).to.be.true;
        await expect(portfolioBridgeMain.sendXChainMessage(bridge1, xfer1)).to.be.revertedWith("PB-RBNE-02");

        // succeed
        const tx = await portfolioBridgeMain.sendXChainMessage(bridge0, xfer1);
        const receipt: any = await tx.wait();
        expect(receipt.events[0].args.version).to.be.equal(1);
        expect(receipt.events[0].args.bridge).to.be.equal(bridge0);
        expect(receipt.events[0].args.msgDirection).to.be.equal(1);
        expect(receipt.events[0].args.remoteChainId).to.be.equal(1);
        expect(receipt.events[0].args.messageFee).to.be.equal(0);
        expect(receipt.events[0].args.xfer.nonce).to.be.equal(1);
        expect(receipt.events[0].args.xfer.transaction).to.be.equal(transaction1);
        expect(receipt.events[0].args.xfer.trader).to.be.equal(trader);
        //sendXChainMessage calls packXferMessage which maps symbol to symbolId.
        //Check equality for symbolId and not the symbol below.
        expect(receipt.events[0].args.xfer.symbol).to.be.equal(symbolId);
        expect(receipt.events[0].args.xfer.quantity).to.be.equal(quantity);
        // timestamp is overwritten with receive block.timestamp
        const txnBlock = await ethers.provider.getBlock(receipt.blockNumber);
        expect(receipt.events[0].args.xfer.timestamp).to.be.equal(txnBlock.timestamp);
        // fail for unauthorized sender of lzSend
        portfolioBridgeMain.grantRole(portfolioBridgeMain.PORTFOLIO_ROLE(), trader1.address);
        portfolioBridgeMain.revokeRole(portfolioBridgeMain.PORTFOLIO_ROLE(), portfolioBridgeMain.address);
        await expect(portfolioBridgeMain.connect(trader1).sendXChainMessage(bridge0, xfer1)).to.be.revertedWith("AccessControl:");
    });

    it("Should refund native", async () => {
        const bridgeBalance = await ethers.provider.getBalance(portfolioBridgeMain.address);

        const userBalance = await owner.getBalance()

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).refundNative()).to.be.revertedWith("AccessControl:");

        // succeed for non-owner
        const tx = await portfolioBridgeMain.refundNative()
        const receipt: any = await tx.wait()

        const userBalanceAfter = await owner.getBalance()

        expect(userBalanceAfter.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)).sub(bridgeBalance)).to.equal(userBalance);
    })

    it("Should have no effect on subnet by running executeDelayedTransfer()", async () => {
        const tx = await portfolioBridgeMain.executeDelayedTransfer(ethers.utils.keccak256(Utils.fromUtf8("1")));
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on subnet by running setDelayThresholds()", async () => {
        const tx = await portfolioBridgeMain.setDelayThresholds([ALOT, AVAX], [delayThreshold, delayThreshold]);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on subnet by running setDelayPeriod()", async () => {
        const tx = await portfolioBridgeMain.setDelayPeriod(delayPeriod);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on subnet by running setEpochLength()", async () => {
        const tx = await portfolioBridgeMain.setEpochLength(epochLength);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on subnet by running setEpochVolumeCaps()", async () => {
        const tx = await portfolioBridgeMain.setEpochVolumeCaps([ALOT, AVAX], [volumeCap, volumeCap]);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should not accept via fallback()", async function () {
        const ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
        const iface = new ethers.utils.Interface(ABI)
        const calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader1.address, Utils.toWei("100")])
        await expect(owner.sendTransaction({to: portfolioBridgeMain.address, data: calldata}))
            .to.be.revertedWith("PB-NFUN-01")
    })
});
