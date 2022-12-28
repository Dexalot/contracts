/**
 * The test runner for Dexalot Portfolio Bridge Common
 */

import Utils from './utils';

import {
    PortfolioBridge,
    PortfolioMain,
    PortfolioSub,
    PortfolioBridgeSub,
    PortfolioBridgeSub__factory,
    MockToken
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from 'ethers';
import { MockContract, smock } from '@defi-wonderland/smock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe("Portfolio Bridge Sub", () => {
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let mock: MockToken;

    let portfolioBridgeSub: PortfolioBridgeSub;
    let portfolioBridgeMain: PortfolioBridge;

    let delayPeriod: number;
    let epochLength: number;
    let delayThreshold: BigNumber;
    let volumeCap: BigNumber;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;
    let owner: SignerWithAddress;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");

    before(async function () {
        const { owner: owner1, trader1: t1, trader2: t2} = await f.getAccounts();
        owner = owner1;
        trader1 = t1;
        trader2 = t2;
        console.log("Owner", owner.address);
        console.log("Trader1", trader1.address);
        mock = await f.deployMockToken("MOCK", 18);
    });


    beforeEach(async function () {

        const {portfolioMain: portfolioM, portfolioSub: portfolioS, portfolioBridgeMain: pbrigeMain, portfolioBridgeSub: pbrigeSub} = await f.deployCompletePortfolio();
        portfolioMain = portfolioM;
        portfolioSub = portfolioS;

        portfolioBridgeMain = pbrigeMain;
        portfolioBridgeSub = pbrigeSub;

        delayPeriod = 10000
        epochLength = 100000
        delayThreshold = ethers.utils.parseEther("0.5");
        volumeCap = ethers.utils.parseEther("1");
    });

    it("Should call VERSION() correctly", async () => {
        // PortfolioBridgeSub
        const VERSION_SUB = await portfolioBridgeSub.VERSION();
        const [majorS, minorS, patchS] = (Utils.toUtf8(VERSION_SUB)).split(".");
        expect(parseInt(majorS) + parseInt(minorS) + parseInt(patchS)).to.greaterThan(0);

        // PortfolioBridge
        const VERSION_MAIN = await portfolioBridgeMain.VERSION();
        const [majorM, minorM, patchM] = (Utils.toUtf8(VERSION_MAIN)).split(".");
        expect(parseInt(majorM) + parseInt(minorM) + parseInt(patchM)).to.greaterThan(0);
    });

    it("Should return portfolio address", async () => {
        expect(await portfolioBridgeSub.getPortfolio()).to.equal(portfolioSub.address);
        expect(await portfolioBridgeMain.getPortfolio()).to.equal(portfolioMain.address);
    });

    it("Should set portfolio and remove the first in the second set", async () => {
        const newPortfolioSub = await f.deployPortfolioSub("ALOT");
        expect(await portfolioBridgeSub.setPortfolio(newPortfolioSub.address))
        .to.emit(portfolioBridgeSub, "RoleRevoked")
        .to.emit(portfolioBridgeSub, "RoleGranted")
    })

    it("Should use addToken correctly for native coin", async () => {
        const ALOT = Utils.fromUtf8("ALOT");
        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
        const srcChainId = 1;
        const tokenDecimals = 18;
        const auctionMode: any = 0;

        // fail for non-privileged role
        await expect(portfolioBridgeSub.connect(trader1).addToken(ALOT, ZERO_ADDRESS, srcChainId, tokenDecimals, auctionMode))
            .to.be.revertedWith("PB-OACC-01");

        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(2);
        // silent fail / do nothing if native token is already added
        await portfolioBridgeSub.addToken(ALOT, ZERO_ADDRESS, srcChainId, tokenDecimals, auctionMode);
        //BOth AVAX & ALOT is added by default
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(2);
        const tdet = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("ALOT" + 1))
        expect(tdet.decimals).to.equal(tokenDecimals);
        expect(tdet.tokenAddress).to.equal(ZERO_ADDRESS);
        expect(tdet.auctionMode).to.equal(auctionMode);
        expect(tdet.srcChainId).to.equal(srcChainId);
        expect(tdet.symbol).to.equal(ALOT);
        expect(tdet.symbolId).to.equal(Utils.fromUtf8("ALOT" + srcChainId));

        //Add ALOT from another chain
        const ALOT_ADDRESS = "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD"; //any address
        const srcChainId2 = 2;
        await portfolioBridgeSub.addToken(ALOT, ALOT_ADDRESS, srcChainId2, tokenDecimals, auctionMode);
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(3);

        const tdet2 = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("ALOT" + srcChainId2))
        expect(tdet2.decimals).to.equal(tokenDecimals);
        expect(tdet2.tokenAddress).to.equal(ALOT_ADDRESS);
        expect(tdet2.auctionMode).to.equal(auctionMode);
        expect(tdet2.srcChainId).to.equal(srcChainId2);
        expect(tdet2.symbol).to.equal(ALOT);
        expect(tdet2.symbolId).to.equal(Utils.fromUtf8("ALOT" + srcChainId2));

    });

    it("Should use addToken correctly for ERC20 tokens", async () => {
        const MOCK = Utils.fromUtf8(await mock.symbol());
        const srcChainId = 1;
        const tokenDecimals = await mock.decimals();
        const auctionMode: any = 0;

        // fail for non-privileged role
        await expect(portfolioBridgeSub.connect(trader1).addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode))
            .to.be.revertedWith("PB-OACC-01");

        // fail if token is not in Portfolio common symbols
        await expect(portfolioBridgeSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode))
            .to.be.revertedWith("PB-SDMP-01");

        // succeed for default admin role
        await portfolioSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',tokenDecimals));
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(3);
        await portfolioBridgeSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode);
        const tdet = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("MOCK" + 1))
        expect(tdet.decimals).to.equal(tokenDecimals);
        expect(tdet.tokenAddress).to.equal(mock.address);
        expect(tdet.auctionMode).to.equal(auctionMode);
        expect(tdet.srcChainId).to.equal(srcChainId);
        expect(tdet.symbol).to.equal(MOCK);
        expect(tdet.symbolId).to.equal(Utils.fromUtf8("MOCK" + srcChainId));

        // silent fail / do nothing if ERC20 token is already added
        await portfolioBridgeSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode);
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(3);
    });

    it("Should use removeToken correctly for native coins", async () => {
        const ALOT = Utils.fromUtf8("ALOT");
        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
        const srcChainId = await portfolioSub.getChainId();
        const tokenDecimals = await mock.decimals();
        const auctionMode: any = 0;

        await portfolioBridgeSub.addToken(ALOT, ZERO_ADDRESS, srcChainId, tokenDecimals, auctionMode);
        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("ALOT" + srcChainId));

        // fail not paused
        await expect(portfolioBridgeSub.connect(trader1).removeToken(ALOT, srcChainId))
            .to.be.revertedWith("Pausable: not paused");

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.PORTFOLIO_ROLE(), trader1.address);
        await portfolioBridgeSub.connect(trader1).pause();

        // fail for non-privileged role
        await expect(portfolioBridgeSub.connect(trader2).removeToken(ALOT, srcChainId))
            .to.be.revertedWith("PB-OACC-01");

        //Add ALOT with the mainnet chain id  (use portfolioBridgeMain.address to mock ALOT address)
        await portfolioBridgeSub.addToken(ALOT, portfolioBridgeMain.address, 5555, tokenDecimals, auctionMode);

        //Remove with PORTFOLIO_ROLE
        await portfolioBridgeSub.connect(trader1).removeToken(ALOT, 5555);
        expect(await portfolioBridgeSub.getTokenList()).to.not.include(Utils.fromUtf8("ALOT" + '5555'));

        //Add ALOT with the mainnet chain id again (use portfolioBridgeMain.address to mock ALOT address)
        await portfolioBridgeSub.addToken(ALOT, portfolioBridgeMain.address, 5555, tokenDecimals, auctionMode);
        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("ALOT" + '5555'));
        // Remove ALOT from chain 5555 with DEFAULT_ADMIN_ROLE
        await portfolioBridgeSub.removeToken(ALOT, 5555);
        expect(await portfolioBridgeSub.getTokenList()).to.not.include(Utils.fromUtf8("ALOT" + '5555'));
        //Slient fail for ALOT with non-existent chain
        await portfolioBridgeSub.removeToken(ALOT, 888);

        // silent fail for default admin role as you cannot remove native token
        await portfolioBridgeSub.removeToken(Utils.fromUtf8("ALOT" + srcChainId), srcChainId);
        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("ALOT" + srcChainId));

    });

    it("Should use removeToken correctly for ERC20 tokens", async () => {
        const MOCK = Utils.fromUtf8(await mock.symbol());
        const srcChainId = 1;
        const tokenDecimals = 18;
        const auctionMode: any = 0;

        await portfolioSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',tokenDecimals));
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(3);  // ALOT + AVAX + MOCK
        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("MOCK" + srcChainId));

        // fail not paused
        await expect(portfolioBridgeSub.connect(trader1).removeToken(MOCK, srcChainId))
            .to.be.revertedWith("Pausable: not paused");

        // fail for non-privileged role
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.PORTFOLIO_ROLE(), owner.address);
        await portfolioBridgeSub.pause();
        await expect(portfolioBridgeSub.connect(trader1).removeToken(MOCK, srcChainId))
            .to.be.revertedWith("PB-OACC-01");

        // succeed for default admin role
        await portfolioBridgeSub.removeToken(MOCK, srcChainId);
        expect(await portfolioBridgeSub.getTokenList()).to.not.include(Utils.fromUtf8("MOCK" + srcChainId));
    });


    it("Should refund native", async () => {
        const { owner } = await f.getAccounts();

        const bridgeBalance = await ethers.provider.getBalance(portfolioBridgeSub.address);

        const userBalance = await owner.getBalance()

        const tx = await portfolioBridgeSub.refundNative()
        const receipt: any = await tx.wait()

        const userBalanceAfter = await owner.getBalance()

        expect(userBalanceAfter.add(receipt.gasUsed.mul(receipt.effectiveGasPrice)).sub(bridgeBalance)).to.equal(userBalance);
    })

    it("Should refund erc20", async () => {
        const { owner } = await f.getAccounts();

        const token = await f.deployMockToken("TEST", 18)
        await token.mint(owner.address, ethers.utils.parseEther("100"))
        await token.transfer(portfolioBridgeSub.address, ethers.utils.parseEther("1"))

        const userBalance = await token.balanceOf(owner.address)

        await portfolioBridgeSub.refundTokens(
            [token.address],
        )

        const userBalanceAfter = await token.balanceOf(owner.address)

        expect(userBalanceAfter.sub(ethers.utils.parseEther("1"))).to.equal(userBalance);
    })

    it("Should not refund if not admin", async () => {
        const { owner, trader1 } = await f.getAccounts();

        const token = await f.deployMockToken("TEST", 18)
        await token.mint(owner.address, ethers.utils.parseEther("100"))
        await token.transfer(portfolioBridgeSub.address, ethers.utils.parseEther("1"))

        await expect(portfolioBridgeSub.connect(trader1).refundTokens(
            [token.address],
        )).to.be.revertedWith("AccessControl: account")

        await expect(portfolioBridgeSub.connect(trader1).refundNative()).to.be.revertedWith("AccessControl:")

    })

    it("Should pause and unpause", async () => {
        const {owner} = await f.getAccounts();

        expect(portfolioBridgeSub.pause()).to.be.revertedWith("AccessControl:")
        expect(portfolioBridgeSub.unpause()).to.be.revertedWith("AccessControl:")

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.PORTFOLIO_ROLE(), owner.address);
        await portfolioBridgeSub.pause();
        expect(await portfolioBridgeSub.paused()).to.be.true;

        await portfolioBridgeSub.unpause();
        expect(await portfolioBridgeSub.paused()).to.be.false;
    });

    it("Should return bridge status", async () => {
        expect(await portfolioBridgeSub.isBridgeProviderEnabled(0)).to.be.true;

        expect(await portfolioBridgeSub.isBridgeProviderEnabled(1)).to.be.false;
    });

    it("Should revoke role", async () => {
        const {owner, admin} = await f.getAccounts();
        await expect(portfolioBridgeSub.revokeRole(await portfolioBridgeSub.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.revertedWith("PB-ALOA-01");

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.DEFAULT_ADMIN_ROLE(), admin.address);

        await expect(portfolioBridgeSub.revokeRole(await portfolioBridgeSub.DEFAULT_ADMIN_ROLE(), admin.address))
        .to.emit(portfolioBridgeSub, "RoleUpdated")
        .withArgs("PORTFOLIOBRIDGE", "REMOVE-ROLE", await portfolioBridgeSub.DEFAULT_ADMIN_ROLE(), admin.address);
    });

    it("Should not revoke role if it is the only member or portfolio", async () => {
        const {owner} = await f.getAccounts();

        await expect(portfolioBridgeSub.revokeRole(await portfolioBridgeSub.PORTFOLIO_ROLE(), owner.address)).to.be.revertedWith("PB-ALOA-02");
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.PORTFOLIO_ROLE(), owner.address);
        await expect(portfolioBridgeSub.revokeRole(await portfolioBridgeSub.PORTFOLIO_ROLE(), owner.address))
        .to.emit(portfolioBridgeSub, "RoleUpdated")
        .withArgs("PORTFOLIOBRIDGE", "REMOVE-ROLE", await portfolioBridgeSub.PORTFOLIO_ROLE(), owner.address);

    });

    it("Should set delayPeriod correctly", async () => {
        await expect(portfolioBridgeSub.setDelayPeriod(delayPeriod))
        .to.emit(portfolioBridgeSub, "DelayPeriodUpdated")
        .withArgs(delayPeriod);

        expect(await portfolioBridgeSub.delayPeriod()).to.equal(delayPeriod);
    });

    it("Should set gasForDestinationLzReceive correctly", async () => {
        const { owner} = await f.getAccounts();

        const gasForDestinationLzReceive = BigNumber.from(500000);
        const gasForDestinationLzReceiveLow = BigNumber.from(150000);

        await portfolioBridgeSub.grantRole(portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
        // Too low
        await expect(portfolioBridgeSub.setGasForDestinationLzReceive(gasForDestinationLzReceiveLow)).to.be.revertedWith("PB-MING-01");


        await expect(portfolioBridgeSub.setGasForDestinationLzReceive(gasForDestinationLzReceive))
        .to.emit(portfolioBridgeSub, "GasForDestinationLzReceiveUpdated")
        .withArgs(gasForDestinationLzReceive);

        expect(await portfolioBridgeSub.gasForDestinationLzReceive()).to.be.equal(gasForDestinationLzReceive);
    });

    it("Should set epochLength correctly", async () => {
        await expect(portfolioBridgeSub.setEpochLength(epochLength))
        .to.emit(portfolioBridgeSub, "EpochLengthUpdated")
        .withArgs(epochLength);

        expect(await portfolioBridgeSub.epochLength()).to.equal(epochLength);
    });

    it("Should set epochVolumeCaps correctly", async () => {
        await expect(portfolioBridgeSub.setEpochVolumeCaps(
            [AVAX],
            [volumeCap.toString()]
        ))
        .to.emit(portfolioBridgeSub, "EpochVolumeUpdated")
        .withArgs(
            AVAX,
            volumeCap.toString()
        );

        expect(await portfolioBridgeSub.epochVolumeCaps(AVAX)).to.equal(volumeCap);
    });

    it("Should set delayThresholds correctly", async () => {
        await expect(portfolioBridgeSub.setDelayThresholds(
            [AVAX],
            [delayThreshold.toString()]
        ))
        .to.emit(portfolioBridgeSub, "DelayThresholdUpdated")
        .withArgs(
            AVAX,
            delayThreshold.toString()
        );

        expect(await portfolioBridgeSub.delayThresholds(AVAX)).to.equal(delayThreshold);
    });

    it("Should not set delayThresholds and epochVolumeCaps if lengths are not match", async () => {
        await expect(portfolioBridgeSub.setDelayThresholds(
            [AVAX, ALOT],
            [delayThreshold.toString()]
        ))
        .to.be.revertedWith("PB-LENM-01");

        await expect(portfolioBridgeSub.setEpochVolumeCaps(
            [AVAX, ALOT],
            [volumeCap.toString()]
        ))
        .to.be.revertedWith("PB-LENM-02");
    });

    it("Should not let not-owner to call set functions", async () => {
        const { trader1 } = await f.getAccounts();

        await expect(portfolioBridgeSub.connect(trader1).setDelayPeriod(delayPeriod))
        .to.be.revertedWith("AccessControl: account");

        await expect(portfolioBridgeSub.connect(trader1).setEpochLength(epochLength))
        .to.be.revertedWith("AccessControl: account");

        await expect(portfolioBridgeSub.connect(trader1).setDelayThresholds(
            [AVAX],
            [delayThreshold.toString()]
        ))
        .to.be.revertedWith("AccessControl: account");

        await expect(portfolioBridgeSub.connect(trader1).setEpochVolumeCaps(
            [AVAX],
            [volumeCap.toString()]
        ))
        .to.be.revertedWith("AccessControl: account");
    });

    // TESTING DEPOSIT
    it("Should deposit if it is under the threshold", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        await f.depositNative(portfolioMain, owner, "0.49");
        expect((await portfolioSub.getBalance(owner.address, AVAX)).available.toString()).to.equal(ethers.utils.parseEther("0.49").toString());
    });

    it("Should added to delayed transfer if it is above the threshold - deposit", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        const tx = await f.depositNative(portfolioMain, owner, "0.51")
        const receipt = await tx.wait();
        const id = receipt.logs[2].data
        const delayedTransfer = await portfolioBridgeSub.delayedTransfers(id)
        expect(delayedTransfer.trader).to.equal(owner.address);
        expect(delayedTransfer.symbol).to.equal(AVAX);
        expect(delayedTransfer.quantity.toString()).to.equal(ethers.utils.parseEther("0.51").toString());
    });

    it("Should use addDelayedTransfer correctly", async () => {
        const { admin, owner, trader1 } = await f.getAccounts();

        const bridge = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction = 1;                // transaction = 1 = DEPOSIT [main --> sub]
        const trader = trader1.address;
        const symbol = AVAX;
        const quantity = Utils.toWei("5");
        const timestamp = BigNumber.from(await f.latestTime());

        const delayThreshold = Utils.toWei("1");

        let xfer: any = {};
        xfer = {nonce,
                transaction,
                trader,
                symbol,
                quantity,
                timestamp
        };

        // create a smock of PortfolioBridgeSUb
        const MockPortfolioBridgeSub = await smock.mock<PortfolioBridgeSub__factory>("PortfolioBridgeSub");
        const lzEndpoint = await f.deployLZEndpoint(1);
        const portfolioBridgeSubMock: MockContract<PortfolioBridgeSub> = await  MockPortfolioBridgeSub.deploy();  // use deploy instead of ugrades.deployProxy and call initialize
        await portfolioBridgeSubMock.initialize(lzEndpoint.address);
        await portfolioBridgeSubMock.setPortfolio(portfolioSub.address);
        await portfolioBridgeSubMock.setDefaultTargetChain(1);
        await portfolioBridgeSubMock.grantRole(await portfolioBridgeSubMock.PORTFOLIO_ROLE(), owner.address);

        await portfolioBridgeSubMock.addToken(AVAX, ZERO_ADDRESS, 1, 18, 0);
        const tdet = await portfolioBridgeSubMock.getTokenDetails(Utils.fromUtf8('AVAX' + 1))
        expect(tdet.decimals).to.equal(18);
        expect(tdet.tokenAddress).to.equal("0x0000000000000000000000000000000000000000");
        expect(tdet.auctionMode).to.equal(0);
        expect(tdet.srcChainId).to.equal(1);
        expect(tdet.symbol).to.equal(Utils.fromUtf8("AVAX"));
        expect(tdet.symbolId).to.equal(Utils.fromUtf8("AVAX" + 1));

        const dt: any = {};
        dt[symbol] = delayThreshold;
        await portfolioBridgeSubMock.setVariable("delayThresholds", dt);

        // quantity 10 > delayThreshoold 1 so it will create a delayedTransfer
        await portfolioBridgeSubMock.sendXChainMessage(bridge, xfer);

        // same message sent again will trigger the require for the same id
        await expect(portfolioBridgeSubMock.sendXChainMessage(bridge, xfer)).to.be.revertedWith("PB-DTAE-01");

        //no delayed transfers
        dt[symbol] = 0;
        await portfolioBridgeSubMock.setVariable("delayThresholds", dt);
        xfer.nonce=2;
        xfer.timestamp =BigNumber.from(await f.latestTime());
        //not enough funds to send the messsage
        expect(portfolioBridgeSubMock.sendXChainMessage(bridge, xfer)).to.be.revertedWith("PB-CBIZ-01");

        await admin.sendTransaction({
            to: portfolioBridgeSubMock.address,
            value: ethers.utils.parseEther("100"),
        });
        //LzApp dest not set
        expect(portfolioBridgeSubMock.sendXChainMessage(bridge, xfer)).to.be.revertedWith("LA-DCNT-01");
    });

    it("Should use executeDelayedTransfer correctly - withdraw", async () => {
        const { admin } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        const bridge = 0;            // BridgeProvider = 0 = LZ

        await f.depositNative(portfolioMain, admin, "0.3");
        await f.depositNative(portfolioMain, admin, "0.3");

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
        // quantity 0.51 > delayThreshoold 0.50 so it will create a delayedTransfer
        let tx = await portfolioSub.connect(admin).withdrawToken(admin.address, AVAX, ethers.utils.parseEther("0.51"), bridge);
        let receipt: any = await tx.wait();
        const id = receipt.logs[1].data;

        await ethers.provider.send("evm_increaseTime", [delayPeriod]);
        await ethers.provider.send("evm_mine", []);

        // execute delayed withdraw transaction after delayedPeriod
        tx = await portfolioBridgeSub.connect(admin).executeDelayedTransfer(id);
        receipt = await tx.wait();
        expect(receipt.events[2].args.xfer.nonce).to.be.equal(1);       // nonce is 1
        expect(receipt.events[2].args.xfer.transaction).to.be.equal(0); // withdraw
        expect(receipt.events[2].args.xfer.trader).to.be.equal(admin.address);
        expect(receipt.events[2].args.xfer.symbol).to.be.equal(Utils.fromUtf8("AVAX"+ 1));
        expect(receipt.events[2].args.xfer.quantity).to.be.equal(ethers.utils.parseEther("0.51"));
    });

    it("Should execute delayed transfer - deposit", async () => {
        const { admin } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        const tx = await f.depositNative(portfolioMain, admin, "0.51")
        const receipt = await tx.wait();
        const id = receipt.logs[2].data

        await ethers.provider.send("evm_increaseTime", [delayPeriod]);
        await ethers.provider.send("evm_mine", []);
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
        await expect(portfolioBridgeSub.connect(admin).executeDelayedTransfer(id))
        .to.emit(portfolioBridgeSub, "DelayedTransferExecuted")

        expect((await portfolioBridgeSub.connect(admin).delayedTransfers(id)).trader).to.equal("0x0000000000000000000000000000000000000000");

        expect((await portfolioSub.getBalance(admin.address, AVAX)).available.toString()).to.equal(ethers.utils.parseEther("0.51").toString());
    });

    it("Should not execute delayed transfer if it is still locked", async () => {
        const { admin } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        const tx = await f.depositNative(portfolioMain, admin, "0.51")
        const receipt = await tx.wait();
        const id = receipt.logs[2].data
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
        await expect(portfolioBridgeSub.connect(admin).executeDelayedTransfer(id))
        .to.be.revertedWith("PB-DTSL-01");
    });

    it("Should not execute delayed transfer if it is not exists", async () => {
        const { admin } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        const tx = await f.depositNative(portfolioMain, admin, "0.52")
        await tx.wait();
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
        await expect(portfolioBridgeSub.connect(admin).executeDelayedTransfer("0xa9a1e33ecab66560f25b7949284c89fd2822970274baacb97111af500098e038")) // id for 0.51
            .to.be.revertedWith("PB-DTNE-01");
    });

    it("Should not execute delayed transfer if caller is not owner", async () => {
        const { owner, trader1 } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        const tx = await f.depositNative(portfolioMain, owner, "0.51")
        const receipt = await tx.wait();
        const id = receipt.logs[2].data

        await expect(portfolioBridgeSub.connect(trader1).executeDelayedTransfer(id))
        .to.be.revertedWith("AccessControl: account");
    });

    // TESTING WITHDRAW
    it("Should revert in one time because of volume cap", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("1.02").toString());

        await expect(
            portfolioSub.withdrawToken(
                owner.address,
                AVAX,
                ethers.utils.parseEther("1.02"),
                0
            )
        ).to.be.revertedWith("PB-VCAP-01");
    });

    it("Should revert in sequential withdrawals because of volume cap", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("1.02").toString());

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(
            portfolioSub.withdrawToken(
                owner.address,
                AVAX,
                ethers.utils.parseEther("0.34"),
                0
            )
        ).to.be.revertedWith("PB-VCAP-01");
    });

    it("Should not revert in sequential withdrawals if enough time is passed", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("1.02").toString());

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        await ethers.provider.send("evm_increaseTime", [epochLength]);
        await ethers.provider.send("evm_mine", []);

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.30"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        expect(await portfolioBridgeSub.epochVolumes(AVAX)).to.equal(ethers.utils.parseEther("0.30").toString());
    });

    it("Should not revert if there is no cap or length", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength: 0,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )
        expect((await portfolioBridgeSub.epochLength()).toString()).to.equal("0");

        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("1.02").toString());

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("0").toString());

        // ============================================================

        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")

        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: 0 // 0 volume cap for AVAX
            }
        )
        expect((await portfolioBridgeSub.epochVolumeCaps(AVAX)).toString()).to.equal("0");

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("1.02").toString());

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.34"),
            0
        ))
        .to.emit(portfolioMain, "PortfolioUpdated")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("0").toString());
    });

    it("Should withdraw if it is under the threshold", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        await f.depositNative(portfolioMain, owner, "0.34")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("0.34").toString());

        await expect(
            portfolioSub.withdrawToken(
                owner.address,
                AVAX,
                ethers.utils.parseEther("0.34"),
                0
            )
        ).to.emit(portfolioMain, "PortfolioUpdated")
    });

    it("Should added to delayed transfer if it is above the threshold - withdraw", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("0.68").toString());

        const tx = await portfolioSub.withdrawToken(
            owner.address,
            AVAX,
            ethers.utils.parseEther("0.68"),
            0
        )
        const receipt = await tx.wait();
        const delayedTransfer = await portfolioBridgeSub.delayedTransfers(receipt.logs[1].data)
        expect(delayedTransfer.trader).to.equal(owner.address);
        expect(delayedTransfer.symbol).to.equal(AVAX);
        expect(delayedTransfer.quantity.toString()).to.equal(ethers.utils.parseEther("0.68").toString());
    });

    it("Should execute delayed transfer - withdraw", async () => {
        const { admin, trader1 } = await f.getAccounts();
        await f.setBridgeSubSettings(
            portfolioBridgeSub,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )
        const mainnetBeforeBalance = await trader1.getBalance()

        let tx:any = await f.depositNative(portfolioMain, trader1, "0.34");
        let receipt = await tx.wait();
        const gasUsed1 = (receipt.gasUsed).mul(receipt.effectiveGasPrice);

        tx = await f.depositNative(portfolioMain, trader1, "0.34")
        receipt = await tx.wait();
        const gasUsed2 = (receipt.gasUsed).mul(receipt.effectiveGasPrice);

        expect((await portfolioSub.getBalance(trader1.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("0.68").toString());


        tx = await portfolioSub.connect(trader1).withdrawToken(
            trader1.address,
            AVAX,
            ethers.utils.parseEther("0.68"),
            0
        )
        receipt = await tx.wait();
        const gasUsed3 = (receipt.gasUsed).mul(receipt.effectiveGasPrice);
        const id = receipt.logs[1].data

        await ethers.provider.send("evm_increaseTime", [delayPeriod]);
        await ethers.provider.send("evm_mine", []);
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
        await expect(portfolioBridgeSub.connect(admin).executeDelayedTransfer(id))
        .to.emit(portfolioBridgeSub, "DelayedTransferExecuted")
        .to.emit(portfolioMain, "PortfolioUpdated")
        .withArgs(0, trader1.address, AVAX, ethers.utils.parseEther("0.68"), 0, 0, 0)

        expect((await portfolioBridgeSub.delayedTransfers(id)).trader).to.equal("0x0000000000000000000000000000000000000000");

        const mainnetAfterBalance = await trader1.getBalance()

        expect(mainnetBeforeBalance.sub(gasUsed1).sub(gasUsed2).sub(gasUsed3)).to.equal(mainnetAfterBalance.toString());
    });

    it("Should not accept via fallback()", async function () {
        const { trader1, owner } = await f.getAccounts();
        const ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
        const iface = new ethers.utils.Interface(ABI)
        const calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader1.address, Utils.toWei('100')])
        await expect(owner.sendTransaction({to: portfolioBridgeSub.address, data: calldata}))
            .to.be.revertedWith("")
    })
});
