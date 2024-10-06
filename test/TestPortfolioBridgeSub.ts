/**
 * The test runner for Dexalot Portfolio Bridge Common
 */

import Utils from './utils';

import {
    PortfolioBridgeMain,
    PortfolioMain,
    PortfolioSub,
    PortfolioBridgeSub,
    MockToken,
    DelayedTransfers,
    InventoryManager,
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe("Portfolio Bridge Sub", () => {
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let mock: MockToken;

    let portfolioBridgeSub: PortfolioBridgeSub;
    let portfolioBridgeMain: PortfolioBridgeMain;
    let delayedTransfers: DelayedTransfers;
    let inventoryManager: InventoryManager;

    let delayPeriod: number;
    let epochLength: number;
    let delayThreshold: BigNumber;
    let volumeCap: BigNumber;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;
    let owner: SignerWithAddress;
    let defaultDestinationChainId:number;

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
        const portfolioContracts = await f.deployCompletePortfolio();
        await f.printTokens([portfolioContracts.portfolioMainnet], portfolioContracts.portfolioSub, portfolioContracts.portfolioBridgeSub);

    });


    beforeEach(async function () {

        const portfolioContracts = await f.deployCompletePortfolio();
        portfolioMain = portfolioContracts.portfolioMainnet;
        portfolioSub = portfolioContracts.portfolioSub;
        portfolioBridgeMain = portfolioContracts.portfolioBridgeMainnet;
        portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
        delayedTransfers= portfolioContracts.delayedTransfers;
        inventoryManager = portfolioContracts.inventoryManager;

        delayPeriod = 10000
        epochLength = 100000
        delayThreshold = ethers.utils.parseEther("0.5");
        volumeCap = ethers.utils.parseEther("1");
        defaultDestinationChainId = await portfolioBridgeSub.getDefaultDestinationChain();

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

    it("Default Destination should be set to Cchain", async () => {
        const { cChain } = f.getChains();
        expect(await portfolioBridgeSub.getDefaultDestinationChain()).to.be.equal(cChain.chainListOrgId);
    });

    it("Should use addToken correctly for native coin", async () => {
        const ALOT = Utils.fromUtf8("ALOT");
        const tokenDecimals = 18;
        const auctionMode: any = 0;
        const { cChain, dexalotSubnet } = f.getChains();
        // fail for non-privileged role
        await expect(portfolioBridgeSub.connect(trader1).addToken(ALOT, ethers.constants.AddressZero, cChain.chainListOrgId, tokenDecimals, auctionMode, ALOT, 0))
            .to.be.revertedWith("PB-OACC-01");

        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(2);
        // silent fail / do nothing if native token is already added
        await portfolioBridgeSub.addToken(ALOT, ethers.constants.AddressZero, dexalotSubnet.chainListOrgId, tokenDecimals, auctionMode, ALOT, 0);
        //BOth AVAX & ALOT is added by default
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(2);
        const tdet = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("ALOT" + dexalotSubnet.chainListOrgId))
        expect(tdet.decimals).to.equal(tokenDecimals);
        expect(tdet.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tdet.auctionMode).to.equal(auctionMode);
        expect(tdet.srcChainId).to.equal(dexalotSubnet.chainListOrgId);
        expect(tdet.symbol).to.equal(ALOT);
        expect(tdet.symbolId).to.equal(Utils.fromUtf8("ALOT" + dexalotSubnet.chainListOrgId));

        //Add ALOT from another chain
        const ALOT_ADDRESS = "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD"; //any address
        const srcChainId2 = cChain.chainListOrgId;
        await portfolioBridgeSub.addToken(ALOT, ALOT_ADDRESS, srcChainId2, tokenDecimals, auctionMode, ALOT, 0);
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(3);

        const tdet2 = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("ALOT" + srcChainId2))
        expect(tdet2.decimals).to.equal(tokenDecimals);
        expect(tdet2.tokenAddress).to.equal(ALOT_ADDRESS);
        expect(tdet2.auctionMode).to.equal(auctionMode);
        expect(tdet2.srcChainId).to.equal(srcChainId2);
        expect(tdet2.symbol).to.equal(ALOT);
        expect(tdet2.symbolId).to.equal(Utils.fromUtf8("ALOT" + srcChainId2));

        await portfolioBridgeSub.getAllBridgeFees(0, ALOT, 0);
    });

    it("Should use addToken correctly for ERC20 tokens", async () => {
        const MOCK = Utils.fromUtf8(await mock.symbol());
        const srcChainId = 1;
        const tokenDecimals = await mock.decimals();
        const auctionMode: any = 0;

        // fail for non-privileged role
        await expect(portfolioBridgeSub.connect(trader1).addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode,MOCK, 0))
            .to.be.revertedWith("PB-OACC-01");

        // fail if token is not in Portfolio common symbols
        await expect(portfolioBridgeSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode,MOCK, 0))
            .to.be.revertedWith("PB-SDMP-01");

        // succeed for default admin role
        await portfolioSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',tokenDecimals),MOCK);
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(3);
        await portfolioBridgeSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode,MOCK, 0);
        const tdet = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("MOCK" + 1))
        expect(tdet.decimals).to.equal(tokenDecimals);
        expect(tdet.tokenAddress).to.equal(mock.address);
        expect(tdet.auctionMode).to.equal(auctionMode);
        expect(tdet.srcChainId).to.equal(srcChainId);
        expect(tdet.symbol).to.equal(MOCK);
        expect(tdet.symbolId).to.equal(Utils.fromUtf8("MOCK" + srcChainId));

        // silent fail / do nothing if ERC20 token is already added
        await portfolioBridgeSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode,MOCK, 0);
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(3);
    });

    it("Should use removeToken correctly for native coins", async () => {
        const ALOT = Utils.fromUtf8("ALOT");
        const srcChainId = await portfolioSub.getChainId();
        const tokenDecimals = await mock.decimals();
        const auctionMode: any = 0;

        await portfolioBridgeSub.addToken(ALOT, ethers.constants.AddressZero, srcChainId, tokenDecimals, auctionMode, ALOT, 0);
        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("ALOT" + srcChainId));

        // fail not paused
        await expect(portfolioBridgeSub.connect(trader1).removeToken(ALOT, srcChainId, ALOT))
            .to.be.revertedWith("Pausable: not paused");

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), trader1.address);
        await portfolioBridgeSub.connect(trader1).pause();

        // fail for non-privileged role
        await expect(portfolioBridgeSub.connect(trader2).removeToken(ALOT, srcChainId, ALOT))
            .to.be.revertedWith("PB-OACC-01");

        //Add ALOT with the mainnet chain id  (use portfolioBridgeMain.address to mock ALOT address)
        await portfolioBridgeSub.addToken(ALOT, portfolioBridgeMain.address, 5555, tokenDecimals, auctionMode, ALOT, 0);

        //Remove with BRIDGE_USER_ROLE
        await portfolioBridgeSub.connect(trader1).removeToken(ALOT, 5555, ALOT);
        expect(await portfolioBridgeSub.getTokenList()).to.not.include(Utils.fromUtf8("ALOT" + '5555'));

        //Add ALOT with the mainnet chain id again (use portfolioBridgeMain.address to mock ALOT address)
        await portfolioBridgeSub.addToken(ALOT, portfolioBridgeMain.address, 5555, tokenDecimals, auctionMode, ALOT, 0);
        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("ALOT" + '5555'));
        // Remove ALOT from chain 5555 with DEFAULT_ADMIN_ROLE
        await portfolioBridgeSub.removeToken(ALOT, 5555, ALOT);
        expect(await portfolioBridgeSub.getTokenList()).to.not.include(Utils.fromUtf8("ALOT" + '5555'));
        //Silent fail for ALOT with non-existent chain
        await portfolioBridgeSub.removeToken(ALOT, 888, ALOT);

        // silent fail for default admin role as you cannot remove native token
        await portfolioBridgeSub.removeToken(Utils.fromUtf8("ALOT" + srcChainId), srcChainId, ALOT);
        // await f.printTokens([portfolioMain], portfolioSub, portfolioBridgeSub);

        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("ALOT" + srcChainId));

    });

    it("Should use removeToken correctly for ERC20 tokens", async () => {
        const MOCK = Utils.fromUtf8(await mock.symbol());
        const srcChainId = 1;
        const tokenDecimals = 18;
        const auctionMode: any = 0;

        await portfolioSub.addToken(MOCK, mock.address, srcChainId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',tokenDecimals),MOCK);
        expect((await portfolioBridgeSub.getTokenList()).length).to.equal(3);  // ALOT + AVAX + MOCK
        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("MOCK" + srcChainId));

        // fail not paused
        await expect(portfolioBridgeSub.connect(trader1).removeToken(MOCK, srcChainId,MOCK))
            .to.be.revertedWith("Pausable: not paused");

        // fail for non-privileged role
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address);
        await portfolioBridgeSub.pause();
        await expect(portfolioBridgeSub.connect(trader1).removeToken(MOCK, srcChainId,MOCK))
            .to.be.revertedWith("PB-OACC-01");

        // await f.printTokens([portfolioMain], portfolioSub, portfolioBridgeSub);

        // succeed for default admin role
        await portfolioBridgeSub.removeToken(MOCK, srcChainId,MOCK);
        expect(await portfolioBridgeSub.getTokenList()).to.not.include(Utils.fromUtf8("MOCK" + srcChainId));
        // await f.printTokens([portfolioMain], portfolioSub, portfolioBridgeSub);
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

    it("Should pause and unpause", async () => {
        const {owner} = await f.getAccounts();

        expect(portfolioBridgeSub.pause()).to.be.revertedWith("AccessControl:")
        expect(portfolioBridgeSub.unpause()).to.be.revertedWith("AccessControl:")

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address);
        await portfolioBridgeSub.pause();
        expect(await portfolioBridgeSub.paused()).to.be.true;

        await portfolioBridgeSub.unpause();
        expect(await portfolioBridgeSub.paused()).to.be.false;
    });

    it("Should return bridge status", async () => {
        expect(await portfolioBridgeSub.isBridgeProviderEnabled(0)).to.be.true;

        expect(await portfolioBridgeSub.isBridgeProviderEnabled(1)).to.be.false;
    });

    it("Should have gas Swap Amount 1 and bridgeFee 0 for AVAX in PortfolioBridgeSub", async () => {
       // Avax is added with 0 gas in the subnet
        let  params2 =await portfolioSub.bridgeParams(AVAX);
        expect(params2.gasSwapRatio).to.equal(Utils.toWei("0"));
        expect(params2.fee).to.equal(0);
        expect(params2.usedForGasSwap).to.equal(false);

        // Fail for non-bridge admin
        await expect ( portfolioBridgeSub.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0"), true)).to.revertedWith("AccessControl:")
        // give BRIDGE_ADMIN to owner
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
        await expect (portfolioBridgeSub.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0"), true)).to.revertedWith("P-GSRO-01")
        await portfolioBridgeSub.setBridgeParam(AVAX,  Utils.toWei("0.2"), Utils.toWei("0.1"), true)
        params2 =await portfolioSub.bridgeParams(AVAX);
        expect(params2.gasSwapRatio).to.equal(Utils.toWei("0.1"));
        expect(params2.fee).to.equal(Utils.toWei("0.2"));
        expect(params2.usedForGasSwap).to.equal(true); // always false in the mainnet

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

        await expect(portfolioBridgeSub.revokeRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address)).to.be.revertedWith("PB-ALOA-02");
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address);
        await expect(portfolioBridgeSub.revokeRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address))
        .to.emit(portfolioBridgeSub, "RoleUpdated")
        .withArgs("PORTFOLIOBRIDGE", "REMOVE-ROLE", await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address);

    });

    it("Should set delayPeriod correctly", async () => {
        await expect(delayedTransfers.setDelayPeriod(delayPeriod))
        .to.emit(delayedTransfers, "DelayPeriodUpdated")
        .withArgs(delayPeriod);

        expect(await delayedTransfers.delayPeriod()).to.equal(delayPeriod);
    });


    it("Should set delayedTransfers correctly", async () => {
        await expect(portfolioBridgeSub.connect(trader1).setDelayedTransfer(delayedTransfers.address))
            .to.revertedWith("AccessControl:");
        // success for owner
        await portfolioBridgeSub.setDelayedTransfer(delayedTransfers.address);
    });

    it("Should set epochLength correctly", async () => {
        await expect(delayedTransfers.setEpochLength(epochLength))
        .to.emit(delayedTransfers, "EpochLengthUpdated")
        .withArgs(epochLength);

        expect(await delayedTransfers.epochLength()).to.equal(epochLength);
    });

    it("Should set epochVolumeCaps correctly", async () => {
        await expect(delayedTransfers.setEpochVolumeCaps(
            [AVAX],
            [volumeCap.toString()]
        ))
        .to.emit(delayedTransfers, "EpochVolumeUpdated")
        .withArgs(
            AVAX,
            volumeCap.toString()
        );

        expect(await delayedTransfers.epochVolumeCaps(AVAX)).to.equal(volumeCap);
    });

    it("Should set delayThresholds correctly", async () => {
        await expect(delayedTransfers.setDelayThresholds(
            [AVAX],
            [delayThreshold.toString()]
        ))
        .to.emit(delayedTransfers, "DelayThresholdUpdated")
        .withArgs(
            AVAX,
            delayThreshold.toString()
        );

        expect(await delayedTransfers.delayThresholds(AVAX)).to.equal(delayThreshold);
    });

    it("Should not set delayThresholds, epochVolumeCaps if lengths are not match", async () => {
        await expect(delayedTransfers.setDelayThresholds(
            [AVAX, ALOT],
            [delayThreshold.toString()]
        ))
        .to.be.revertedWith("PB-LENM-01");

        await expect(delayedTransfers.setEpochVolumeCaps(
            [AVAX, ALOT],
            [volumeCap.toString()]
        ))
            .to.be.revertedWith("PB-LENM-01");

    });

    it("Should not let not-owner to call delayedTransfers functions", async () => {
        await expect(delayedTransfers.connect(trader1).setDelayPeriod(delayPeriod))
        .to.be.revertedWith("AccessControl: account");

        await expect(delayedTransfers.connect(trader1).setEpochLength(epochLength))
        .to.be.revertedWith("AccessControl: account");

        await expect(delayedTransfers.connect(trader1).setDelayThresholds(
            [AVAX],
            [delayThreshold.toString()]
        ))
        .to.be.revertedWith("AccessControl: account");

        await expect(delayedTransfers.connect(trader1).setEpochVolumeCaps(
            [AVAX],
            [volumeCap.toString()]
        ))
        .to.be.revertedWith("AccessControl: account");

        const xfer = {
            nonce: 0,
            transaction: 1,
            trader: trader1.address,
            symbol: AVAX,
            quantity: ethers.utils.parseEther("0.5"),
            timestamp: BigNumber.from(await f.latestTime()),
            customdata: Utils.emptyCustomData()
        }

        await expect(delayedTransfers.connect(trader1).checkThresholds(xfer, defaultDestinationChainId)).to.be.revertedWith("AccessControl: account");

        await expect(delayedTransfers.connect(trader1).executeDelayedTransfer(ethers.constants.HashZero))
        .to.be.revertedWith("AccessControl: account");

        await expect(delayedTransfers.connect(trader1).updateVolume(AVAX, volumeCap))
        .to.be.revertedWith("AccessControl: account");
    });

    it("Should not initialize delayedTransfers again after deployment", async function () {
        await expect(delayedTransfers.initialize(
            "0x0000000000000000000000000000000000000000"
        ))
        .to.be.revertedWith("Initializable: contract is already initialized");
      });


    // it.only("Should not be able to withdraw virtual tokens from host Chains-should be deprecated", async () => {
    //     // Virtual tokens are not used, use xChainAllowedDestinations
    //     // Add virtual GUN to avalanche with gunzilla Network id
    //     const gunDetails = { symbol: "GUN", symbolbytes32: Utils.fromUtf8("GUN"), decimals: 18 };
    //     const { dexalotSubnet, gunzillaSubnet } = f.getChains();
    //     await f.addVirtualToken(portfolioMain, gunDetails.symbol, gunDetails.decimals, gunzillaSubnet.chainListOrgId);

    //     const nonce = 0;
    //     const transaction = 0;   //  transaction:   0 = WITHDRAW,  1 = DEPOSIT [main --> sub]
    //     //const direction = 1   // sent -0 , received -1
    //     const withDrawGunPayload = Utils.generatePayload(0, nonce, transaction, trader1.address, gunDetails.symbolbytes32, Utils.toWei("10"), await f.latestTime(), Utils.emptyCustomData());
    //     await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address)
    //     await portfolioBridgeMain.pause()
    //     await portfolioBridgeMain.enableBridgeProvider(0, owner.address)
    //     await expect(portfolioBridgeMain.processPayload(0, dexalotSubnet.chainListOrgId, withDrawGunPayload)).to.be.revertedWith("PB-VTNS-02");
    // })



    it("Should set BridgeFees correctly", async () => {
        const { cChain } = f.getChains();

        const tokens = [ALOT, AVAX];
        const fee1 = Utils.toWei('1');
        const fee2 = Utils.toWei('0.1');
        const fees  = [fee1, fee2];

        await expect(portfolioBridgeSub.connect(trader1).setBridgeFees(cChain.chainListOrgId, tokens,fees))
            .to.revertedWith("AccessControl:");

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);

        await expect(portfolioBridgeSub.setBridgeFees(cChain.chainListOrgId, tokens,[fee1]))
            .to.revertedWith("PB-LENM-01");
        // success for owner
        await portfolioBridgeSub.setBridgeFees(cChain.chainListOrgId, tokens, fees)

        // need to deposit for inventory to be initialised and withdrawal fee to be set
        await f.depositNative(portfolioMain, trader1, "0.5");
        expect(await portfolioBridgeSub.getBridgeFee(0, cChain.chainListOrgId, AVAX, 0)).to.be.equal(fee2);
    });

    it("Should set BridgeFees correctly with bridge multipler", async () => {
        const { cChain } = f.getChains();

        const tokens = [ALOT, AVAX];
        const fee1 = Utils.toWei('1');
        const fee2 = Utils.toWei('0.1');
        const fees  = [fee1, fee2];

        await expect(portfolioBridgeSub.connect(trader1).setBridgeFees(cChain.chainListOrgId, tokens,fees))
            .to.revertedWith("AccessControl:");

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);

        await expect(portfolioBridgeSub.setBridgeFees(cChain.chainListOrgId, tokens,[fee1]))
            .to.revertedWith("PB-LENM-01");
        // success for owner
        await portfolioBridgeSub.setBridgeFees(cChain.chainListOrgId, tokens, fees)

        await portfolioBridgeSub.setBridgeFeeMultipler(0, 5000);

        // need to deposit for inventory to be initialised and withdrawal fee to be set
        await f.depositNative(portfolioMain, trader1, "0.5");
        expect(await portfolioBridgeSub.getBridgeFee(0, cChain.chainListOrgId, AVAX, 0)).to.be.equal(fee2.div(2));
    });

    // TESTING DEPOSIT
    it("Should deposit if it is under the threshold", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
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

    // it("Should rename token", async () => {
    //     const { cChain} = f.getChains();
    //     await expect(portfolioBridgeSub.connect(trader1).renameToken(cChain.chainListOrgId, Utils.fromUtf8("USDt"), Utils.fromUtf8("USDT"))).to.revertedWith("AccessControl:");
    //     await expect(portfolioBridgeSub.renameToken(cChain.chainListOrgId, Utils.fromUtf8("USDT"), Utils.fromUtf8("USDT"))).to.revertedWith("PB-LENM-01");
    // });

    it("Should fail setting Inventory Manager for non-admin", async () => {
        await expect(portfolioBridgeSub.connect(trader1).setInventoryManager(inventoryManager.address)).to.revertedWith("AccessControl:");
    });

    it("Should fail setting bridge fee multipler for non-admin", async () => {
        await expect(portfolioBridgeSub.connect(trader1).setBridgeFeeMultipler(0, 100)).to.revertedWith("AccessControl:");
    });

    it("Should fail setting bridge fee multipler for multiplier > TENK", async () => {
        await expect(portfolioBridgeSub.setBridgeFeeMultipler(0, 10001)).to.revertedWith("PB-MPGT-01");
    });


    it("Should use addDelayedTransfer correctly", async () => {
        const { owner, trader1 } = await f.getAccounts();
        const { cChain } = f.getChains();

        const bridge = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction = 0;      //  transaction =.  0 = WITHDRAW,  1 = DEPOSIT [main --> sub]
        const trader = trader1.address;
        const symbol = Utils.fromUtf8("AVAX");
        const symbolId = Utils.fromUtf8("AVAX" + cChain.chainListOrgId);
        const quantity = Utils.toWei("5");
        const timestamp = BigNumber.from(await f.latestTime());

        const delayThreshold = Utils.toWei("1");

        let xfer: any = {};
        xfer = {nonce,
                transaction,
                trader,
                symbol,
                quantity,
                timestamp,
                customdata: Utils.emptyCustomData()
        };

        await expect(portfolioBridgeSub.sendXChainMessage(defaultDestinationChainId, bridge, xfer, trader)).to.be.revertedWith("AccessControl:");

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address);

        // fail when paused
        await portfolioBridgeSub.pause();
        await expect(portfolioBridgeSub.sendXChainMessage(defaultDestinationChainId, bridge, xfer, trader)).to.be.revertedWith("Pausable: paused");
        await portfolioBridgeSub.unpause();

        // start with 0 inventory
        expect(await inventoryManager.get(symbol, symbolId)).to.be.equal(0);

        // revert for CCTRADE
        xfer.transaction = 11 // CCTRADE
        await expect(portfolioBridgeSub.sendXChainMessage(defaultDestinationChainId, bridge, xfer, trader)).to.be.revertedWith("PB-CCTR-01");
        //still 0
        expect(await inventoryManager.get(symbol, symbolId)).to.be.equal(0);

        xfer.transaction = 0;
        //set the delay transfer threshold
        await expect(delayedTransfers.setDelayThresholds(
            [AVAX],
            [delayThreshold.toString()]
        ))
        .to.emit(delayedTransfers, "DelayThresholdUpdated")
        .withArgs(
            AVAX,
            delayThreshold.toString()
        );

        xfer.nonce = 1; // nonce should always be assigned by the LZ but testing out the else path
        // quantity 10 > delayThreshold 1 so it will create a delayedTransfer
        const tx = await portfolioBridgeSub.sendXChainMessage(defaultDestinationChainId, bridge, xfer, trader);
        const receipt = await tx.wait();

        expect(await inventoryManager.get(symbol, symbolId)).to.be.equal(0);

        const log = receipt.logs[0]
        const data = ethers.utils.defaultAbiCoder.decode(
            [ 'string', 'bytes32'],
            log.data
        );
        const delayedTransfer = await delayedTransfers.delayedTransfers(data[1])
        expect(delayedTransfer.trader).to.equal(trader);
        expect(delayedTransfer.symbol).to.equal(symbol);
        expect(delayedTransfer.quantity.toString()).to.equal(quantity);
        expect(BigNumber.from(delayedTransfer.customdata).eq(defaultDestinationChainId));

        // same message sent again will trigger the require for the same id
        await expect(portfolioBridgeSub.sendXChainMessage(defaultDestinationChainId, bridge, xfer, trader)).to.be.revertedWith("PB-DTAE-01");

        //no delayed transfers
        await expect(delayedTransfers.setDelayThresholds(
            [AVAX],
            ['0']
        ))
        .to.emit(delayedTransfers, "DelayThresholdUpdated")
        .withArgs(
            AVAX,
            '0'
        );


        xfer.nonce=2;
        xfer.timestamp = BigNumber.from(await f.latestTime());

        // No inventory for the c-chain. We didn't make any deposit
        await expect(portfolioBridgeSub.sendXChainMessage(defaultDestinationChainId, bridge, xfer, trader)).to.be.revertedWith("IM-INVT-01");

        await f.depositNative(portfolioMain, trader1, "20");

        await portfolioBridgeSub.refundNative();
        //not enough funds to pay the bridge fee
        await expect(portfolioBridgeSub.sendXChainMessage(defaultDestinationChainId, bridge, xfer, trader)).to.be.revertedWith("PB-CBIZ-01");
        await owner.sendTransaction({
            to: portfolioBridgeSub.address,
            value: ethers.utils.parseEther("100"),
        });

        // Execute the delayed transfers and check the inventory ids
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
        await portfolioBridgeSub.executeDelayedTransfer(data[1]);


        // Deposit 20 , delayed transfer withdrawal 5 => 15
        expect(await inventoryManager.get(symbol, symbolId)).to.be.equal(Utils.toWei((20 - 5).toString()));

    });

    it("Should use executeDelayedTransfer correctly - withdraw", async () => {
        const { admin } = await f.getAccounts();

        await f.setBridgeSubSettings(
            delayedTransfers,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        // Deposit
        await f.depositNative(portfolioMain, admin, "0.3");
        await f.depositNative(portfolioMain, admin, "0.3");

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
        // quantity 0.51 > delayThreshold 0.50 so it will create a delayedTransfer
        let tx = await f.withdrawToken(portfolioSub, admin, AVAX, 18, "0.51");
        let receipt: any = await tx.wait();

        const log = receipt.logs[1]
        const data = ethers.utils.defaultAbiCoder.decode(
            [ 'string', 'bytes32'],
            log.data
         );

        await ethers.provider.send("evm_increaseTime", [delayPeriod]);
        await ethers.provider.send("evm_mine", []);

        // execute delayed withdraw transaction after delayedPeriod
        tx = await portfolioBridgeSub.connect(admin).executeDelayedTransfer(data[1]);
        receipt = await tx.wait();
        expect(receipt.events[1].args.xfer.nonce).to.be.equal(1);       // nonce is 1
        expect(receipt.events[1].args.xfer.transaction).to.be.equal(0); // withdraw
        expect(receipt.events[1].args.xfer.trader).to.be.equal(admin.address);
        expect(receipt.events[1].args.xfer.symbol).to.be.equal(AVAX);
        expect(receipt.events[1].args.xfer.quantity).to.be.equal(ethers.utils.parseEther("0.51"));
    });

    // it("Should execute delayed transfer - deposit", async () => {
    //     const { admin } = await f.getAccounts();
    //     await f.setBridgeSubSettings(
    //         portfolioBridgeSub,
    //         {
    //             delayPeriod,
    //             epochLength,
    //             token: AVAX,
    //             delayThreshold: delayThreshold.toString(),
    //             epochVolumeCap: volumeCap.toString()
    //         }
    //     )

    //     const tx = await f.depositNative(portfolioMain, admin, "0.51")
    //     const receipt = await tx.wait();
    //     const log = receipt.logs[2]
    //     const data = ethers.utils.defaultAbiCoder.decode(
    //         [ 'string', 'bytes32'],
    //         log.data
    //      );


    //     await ethers.provider.send("evm_increaseTime", [delayPeriod]);
    //     await ethers.provider.send("evm_mine", []);
    //     await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
    //     await expect(portfolioBridgeSub.connect(admin).executeDelayedTransfer(defaultDestinationChainId, data[1]))
    //     .to.emit(portfolioBridgeSub, "DelayedTransfer")

    //     expect((await portfolioBridgeSub.connect(admin).delayedTransfers(data[1])).trader).to.equal("0x0000000000000000000000000000000000000000");

    //     expect((await portfolioSub.getBalance(admin.address, AVAX)).available.toString()).to.equal(ethers.utils.parseEther("0.51").toString());
    // });

    it("Should not execute delayed transfer if it is still locked- withdraw", async () => {
        const { admin } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        await f.depositNative(portfolioMain, admin, "10");

        const tx = await f.withdrawToken(portfolioSub, admin, AVAX, 18, "0.51");
        const receipt = await tx.wait();
        const log = receipt.logs[1]
        const data = ethers.utils.defaultAbiCoder.decode(
            [ 'string', 'bytes32'],
            log.data
         );

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
        await expect(portfolioBridgeSub.connect(admin).executeDelayedTransfer(data[1]))
        .to.be.revertedWith("PB-DTSL-01");
    });

    it("Should not execute delayed transfer if it is not exists", async () => {
        const { admin } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
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
            delayedTransfers,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )

        await f.depositNative(portfolioMain, owner, "10");
        const tx = await f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.51");

        const receipt = await tx.wait();
        const log = receipt.logs[1]
        const data = ethers.utils.defaultAbiCoder.decode(
            [ 'string', 'bytes32'],
            log.data
         );

        await expect(portfolioBridgeSub.connect(trader1).executeDelayedTransfer(data[1]))
        .to.be.revertedWith("AccessControl: account");
    });

    // TESTING WITHDRAW
    it("Should revert in one time because of volume cap", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
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

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "1.02"))
        .to.be.revertedWith("PB-VCAP-01");
    });

    it("Should revert in sequential withdrawals because of volume cap", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
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

        // await expect(f.withdrawTokenToDst(portfolioSub, owner, AVAX, 18, "0.34", defaultDestinationChainId))
        // .to.emit(portfolioSub, "PortfolioUpdated")


        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
        .to.emit(portfolioMain, "PortfolioUpdated")



        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.emit(portfolioMain, "PortfolioUpdated")


        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.be.revertedWith("PB-VCAP-01");

    });

    it("Should not revert in sequential withdrawals if enough time is passed", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
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

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.emit(portfolioMain, "PortfolioUpdated")

        await ethers.provider.send("evm_increaseTime", [epochLength]);
        await ethers.provider.send("evm_mine", []);

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.30"))
            .to.emit(portfolioMain, "PortfolioUpdated")

        expect(await delayedTransfers.epochVolumes(AVAX)).to.equal(ethers.utils.parseEther("0.30").toString());
    });

    it("Should not revert if there is no cap or length", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
            {
                delayPeriod,
                epochLength: 0,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: volumeCap.toString()
            }
        )
        expect((await delayedTransfers.epochLength()).toString()).to.equal("0");

        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("1.02").toString());

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34")).to.emit(portfolioMain, "PortfolioUpdated")

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.emit(portfolioMain, "PortfolioUpdated")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("0").toString());

        // ============================================================

        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")
        await f.depositNative(portfolioMain, owner, "0.34")

        await f.setBridgeSubSettings(
            delayedTransfers,
            {
                delayPeriod,
                epochLength,
                token: AVAX,
                delayThreshold: delayThreshold.toString(),
                epochVolumeCap: 0 // 0 volume cap for AVAX
            }
        )
        expect((await delayedTransfers.epochVolumeCaps(AVAX)).toString()).to.equal("0");

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("1.02").toString());

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.emit(portfolioMain, "PortfolioUpdated")

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
        .to.emit(portfolioMain, "PortfolioUpdated")

        expect((await portfolioSub.getBalance(owner.address, AVAX)).total.toString()).to.equal(ethers.utils.parseEther("0").toString());
    });

    it("Should withdraw if it is under the threshold", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
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

        await expect(f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.34"))
            .to.emit(portfolioMain, "PortfolioUpdated")
    });

    it("Should added to delayed transfer if it is above the threshold - withdraw", async () => {
        const { owner } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
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

        const tx = await f.withdrawToken(portfolioSub, owner, AVAX, 18, "0.68");
        const receipt = await tx.wait();
        const log = receipt.logs[1]
        const data = ethers.utils.defaultAbiCoder.decode(
            [ 'string', 'bytes32'],
            log.data
         );

        const delayedTransfer = await delayedTransfers.delayedTransfers(data[1])
        expect(delayedTransfer.trader).to.equal(owner.address);
        expect(delayedTransfer.symbol).to.equal(AVAX);
        expect(delayedTransfer.quantity.toString()).to.equal(ethers.utils.parseEther("0.68").toString());
        expect(BigNumber.from(delayedTransfer.customdata).eq(defaultDestinationChainId));
    });

    it("Should execute delayed transfer - withdraw", async () => {
        const { admin, trader1 } = await f.getAccounts();
        await f.setBridgeSubSettings(
            delayedTransfers,
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

        tx = await f.withdrawToken(portfolioSub, trader1, AVAX, 18, "0.68");
        receipt = await tx.wait();
        const gasUsed3 = (receipt.gasUsed).mul(receipt.effectiveGasPrice);

        const log = receipt.logs[1]
        const data = ethers.utils.defaultAbiCoder.decode(
            [ 'string', 'bytes32'],
            log.data
         );
        await ethers.provider.send("evm_increaseTime", [delayPeriod]);
        await ethers.provider.send("evm_mine", []);
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), admin.address);
        await expect(portfolioBridgeSub.connect(admin).executeDelayedTransfer(data[1]))
        .to.emit(delayedTransfers, "DelayedTransfer")
        .to.emit(portfolioMain, "PortfolioUpdated")
        .withArgs(0, trader1.address, AVAX, ethers.utils.parseEther("0.68"), 0, 0, 0, trader1.address)

        expect((await delayedTransfers.delayedTransfers(data[1])).trader).to.equal("0x0000000000000000000000000000000000000000");

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

    it("Should fail to get bridge fee to token that does not exist", async function () {
       await expect(portfolioBridgeSub.getBridgeFee(0, 0, ALOT, 0)).to.be.revertedWith("PB-ETNS-01");
    })

    it("Should fail to process payload for token that does not exist", async function () {
        const {cChain} = f.getChains();

        const invalidSymbol = Utils.fromUtf8("AVAXCC");
        const payload = Utils.generatePayload(0, 1, 0, trader1.address, invalidSymbol, Utils.toWei("0.5"), await f.latestTime(), Utils.emptyCustomData());

        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address);
        await portfolioBridgeSub.pause();
        await portfolioBridgeSub.enableBridgeProvider(0, owner.address);
        await portfolioBridgeSub.unpause();

        await expect(portfolioBridgeSub.processPayload(0, cChain.chainListOrgId, payload)).to.be.revertedWith("PB-ETNS-01");
     })
});
