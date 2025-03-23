/**
 * The test runner for Dexalot Portfolio Bridge Main
 */

import Utils from "./utils";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    PortfolioBridgeMain,
    PortfolioBridgeSub,
    PortfolioMain,
    MainnetRFQ,
    LzV2App,
} from "../typechain-types"

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, constants } from "ethers";

describe("Portfolio Bridge Main", () => {
    const nonSupportedBridge = 3;
    let portfolioMain: PortfolioMain;
    let lzAppMain: LzV2App;
    let lzAppSub: LzV2App;
    let portfolioBridgeMain: PortfolioBridgeMain;
    let portfolioBridgeSub: PortfolioBridgeSub;
    let mainnetRFQAvax: MainnetRFQ;


    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");
    // const auctionMode: any = 0;

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
        const portfolioContracts = await f.deployCompletePortfolio();
        await f.printTokens([portfolioContracts.portfolioMainnet], portfolioContracts.portfolioSub, portfolioContracts.portfolioBridgeSub);
    });

    beforeEach(async function () {

        const portfolioContracts = await f.deployCompletePortfolio();
        portfolioMain = portfolioContracts.portfolioMainnet;
        portfolioBridgeMain = portfolioContracts.portfolioBridgeMainnet;
        portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
        lzAppMain = portfolioContracts.lzAppMainnet;
        lzAppSub = portfolioContracts.lzAppSub;
        mainnetRFQAvax = portfolioContracts.mainnetRFQ;
    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolioBridgeMain.initialize(0, lzAppMain.address, owner.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should get portfolio address correctly", async () => {
        expect(await portfolioBridgeMain.getPortfolio()).to.equal(portfolioMain.address);
    });


    it("Should get MainnetRFQ address correctly", async () => {
        expect(await portfolioBridgeMain.getMainnetRfq()).to.equal(mainnetRFQAvax.address);
    });


    it("Should set & get default bridge provider  correctly", async () => {
        await expect(portfolioBridgeMain.connect(trader1).setDefaultBridgeProvider(1)).to.be.revertedWith("AccessControl:");
        await expect(portfolioBridgeMain.setDefaultBridgeProvider(0)).to.be.revertedWith("PB-DBCD-01");
        await expect(portfolioBridgeMain.setDefaultBridgeProvider(1)).to.be.revertedWith("PB-DBCD-01");
        await expect( portfolioBridgeMain.setDefaultBridgeProvider(nonSupportedBridge)).to.be.reverted;
    });

    it("Should get the Bridge Fee correctly", async () => {
        const { dexalotSubnet } = f.getChains();
        await expect(portfolioBridgeMain.getBridgeFee(1, dexalotSubnet.chainListOrgId, AVAX, 0, Utils.emptyOptions())).to.be.revertedWith("PB-RBNE-03");
        // Last parameter symbol is irrelevant
        const bridgeFee = await portfolioBridgeMain.getBridgeFee(0, dexalotSubnet.chainListOrgId, AVAX, 0, Utils.emptyOptions());
        expect(bridgeFee.gt(0)).to.be.true;
        // console.log (await portfolioBridgeMain.getBridgeFee(0, dexalotSubnet.chainListOrgId, AVAX ));
    });


    it("Default Destination should be set to Subnet", async () => {
        const { dexalotSubnet } = f.getChains();
        expect(await portfolioBridgeMain.getDefaultDestinationChain()).to.be.equal(dexalotSubnet.chainListOrgId);

        await portfolioBridgeMain.enableBridgeProvider(1, lzAppMain.address);
        // Destination not found, destChain id =0
        await portfolioBridgeMain.setDefaultBridgeProvider(1);
        expect(await portfolioBridgeMain.getDefaultBridgeProvider()).to.be.equal(1);
    });


    it("Should be able to set a different Default Destination", async () => {
        const { arbitrumChain } = f.getChains();

        const lzChainBytes = Utils.numberToBytes32(arbitrumChain.lzChainId);
        const lzAppBytes = Utils.addressToBytes32(lzAppSub.address);

        await expect(portfolioBridgeMain.connect(trader1).setTrustedRemoteAddress(0, arbitrumChain.chainListOrgId, lzChainBytes, lzAppBytes, false)).to.be.revertedWith("AccessControl:");

        await expect(portfolioBridgeMain.connect(trader1).setDefaultDestinationChain(arbitrumChain.chainListOrgId)).to.be.revertedWith("AccessControl:");

        await expect(portfolioBridgeMain.setDefaultDestinationChain(0)).to.be.revertedWith("PB-DDNZ-01");

        // Using portfolioBridgeSub as the address for testing only. It should be Arbitrum portfolioBridgeSub
        await portfolioBridgeMain.setTrustedRemoteAddress(0, arbitrumChain.chainListOrgId, lzChainBytes, lzAppBytes, false);

        await expect(portfolioBridgeMain.setDefaultDestinationChain(arbitrumChain.chainListOrgId)).to.emit(portfolioBridgeMain, "DefaultChainIdUpdated")
            .withArgs(arbitrumChain.chainListOrgId);

        //await expect(portfolioBridgeMain.getDefaultDestinationChain().to.be.equal(0);
    });

    it("Should get correct supported chain ids", async () => {
        const { dexalotSubnet } = f.getChains();

        let chainIds = await portfolioBridgeMain.getSupportedChainIds(0);
        expect(chainIds.length).to.be.equal(1);
        expect(chainIds[0]).to.be.equal(dexalotSubnet.chainListOrgId);

        chainIds = await portfolioBridgeMain.getSupportedChainIds(2);
        expect(chainIds.length).to.be.equal(1);
        expect(chainIds[0]).to.be.equal(0);
    });


    it("Should pause and unpause", async () => {
        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).pause()).to.be.revertedWith("AccessControl:");

        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
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
        const {trader1} = await f.getAccounts();

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).enableBridgeProvider(0, lzAppMain.address)).to.be.revertedWith("AccessControl:");
        // await expect(portfolioBridgeMain.connect(trader1).enableBridgeProvider(1, true)).to.be.revertedWith("AccessControl:");
        await expect(portfolioBridgeMain.connect(trader1).enableBridgeProvider(0, ethers.constants.AddressZero)).to.be.revertedWith("AccessControl:");
        //Can't disable default bridge
        expect(portfolioBridgeMain.enableBridgeProvider(0, ethers.constants.AddressZero)).to.be.revertedWith("PB-DBCD-01");
        // expect(portfolioBridgeMain.enableBridgeProvider(1, false)).to.be.revertedWith("PB-DBCD-01");
        expect(await portfolioBridgeMain.isBridgeProviderEnabled(0)).to.be.true;
        // // succeed for owner

        const mockICMAddress = trader1.address;

        await portfolioBridgeMain.enableBridgeProvider(1, mockICMAddress);
        expect(await portfolioBridgeMain.isBridgeProviderEnabled(1)).to.be.true;
        await portfolioBridgeMain.setDefaultBridgeProvider(1);
        expect(await portfolioBridgeMain.getDefaultBridgeProvider()).to.be.equal(1);

        // remove lzAppMain
        expect(await portfolioBridgeMain.hasRole(await portfolioBridgeMain.BRIDGE_PROVIDER_ROLE(), lzAppMain.address)).to.be.true;
        await expect(portfolioBridgeMain.connect(trader1).removeBridgeProvider(0, lzAppMain.address)).to.be.revertedWith("AccessControl:");
        await expect(portfolioBridgeMain.removeBridgeProvider(0, lzAppMain.address)).to.be.revertedWith("PB-OBSA-01");

        await portfolioBridgeMain.enableBridgeProvider(0, ethers.constants.AddressZero);
        await expect(portfolioBridgeMain.removeBridgeProvider(0, lzAppMain.address)).to.not.be.reverted;
        expect(await portfolioBridgeMain.hasRole(await portfolioBridgeMain.BRIDGE_PROVIDER_ROLE(), lzAppMain.address)).to.be.false;
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

        await portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_ADMIN_ROLE(), admin.address);
    });



    it("Should set portfolio", async () => {
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.DEFAULT_ADMIN_ROLE(), admin.address);

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).setPortfolio(portfolioMain.address)).to.be.revertedWith("AccessControl:");

        // succeed owner
        await portfolioBridgeMain.setPortfolio(portfolioMain.address);
        expect(await portfolioBridgeMain.getPortfolio()).to.be.equal(portfolioMain.address);
        const { cChain } = f.getChains();
        const tokenDetails = await portfolioMain.getTokenDetailsById(Utils.fromUtf8("AVAX" + cChain.chainListOrgId));

        expect(tokenDetails.symbol).to.be.equal(Utils.fromUtf8("AVAX"))
        expect((await portfolioBridgeMain.getTokenList()).length).to.equal(1);

    });

    it("Should set MainnetRFQ", async () => {
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.DEFAULT_ADMIN_ROLE(), admin.address);

        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).setMainnetRFQ(mainnetRFQAvax.address)).to.be.revertedWith("AccessControl:");

        // succeed owner
        await portfolioBridgeMain.setMainnetRFQ(mainnetRFQAvax.address);
        expect(await portfolioBridgeMain.getMainnetRfq()).to.be.equal(mainnetRFQAvax.address);
        // const { cChain } = f.getChains();
        // const tokenDetails = await portfolioMain.getTokenDetailsById(Utils.fromUtf8("AVAX" + cChain.chainListOrgId));

        // expect(tokenDetails.symbol).to.be.equal(Utils.fromUtf8("AVAX"))
        // expect((await portfolioBridgeMain.getTokenList()).length).to.equal(1);

    });


    it("Should not revoke role if it is the only member or portfolio", async () => {
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), mainnetRFQAvax.address))
            .to.emit(portfolioBridgeMain, "RoleUpdated");
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address)).to.be.revertedWith("PB-ALOA-02");
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address))
        .to.emit(portfolioBridgeMain, "RoleUpdated")
        .withArgs("PORTFOLIOBRIDGE", "REMOVE-ROLE", await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
    });

    it("Should set userPaysFee correctly", async () => {
        const { dexalotSubnet } = f.getChains();
        const defaultBridge = 0;
        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).setUserPaysFeeForDestination(defaultBridge, dexalotSubnet.chainListOrgId, true)).to.be.revertedWith("AccessControl:");

        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_ADMIN_ROLE(), owner.address);

        // do nothing for non-supported bridge
        await expect(portfolioBridgeMain.setUserPaysFeeForDestination(1, dexalotSubnet.chainListOrgId, true)).to.not.be.reverted;

        const userPaysFee = true;
        // succeed for owner
        await expect(portfolioBridgeMain.setUserPaysFeeForDestination(defaultBridge, dexalotSubnet.chainListOrgId, userPaysFee))
        .to.emit(portfolioBridgeMain, "UserPaysFeeForDestinationUpdated")
        .withArgs(defaultBridge, dexalotSubnet.chainListOrgId, userPaysFee);
        expect((await portfolioBridgeMain.userPaysFee(dexalotSubnet.chainListOrgId, 0))).to.be.equal(userPaysFee);
    });

    it("Should have gas Swap Amount 1 and bridgeFee 0 for AVAX in PortfolioBridgeMain", async () => {

        let params =await portfolioMain.bridgeParams(AVAX);
        expect(params.gasSwapRatio).to.equal(Utils.toWei("0.01"));
        expect(params.fee).to.equal(0);
        expect(params.usedForGasSwap).to.equal(false); // always false in the mainnet

        // Fail for non-bridge admin
        await expect ( portfolioBridgeMain.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0"), true)).to.revertedWith("AccessControl:")
        // give BRIDGE_ADMIN to owner
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_ADMIN_ROLE(), owner.address);

        await expect ( portfolioBridgeMain.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0"), true)).to.revertedWith("P-GSRO-01")
        await portfolioBridgeMain.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0.1"), true)
        params =await portfolioMain.bridgeParams(AVAX);
        expect(params.gasSwapRatio).to.equal(Utils.toWei("0.1"));
        expect(params.fee).to.equal(Utils.toWei("0.3"));
        expect(params.usedForGasSwap).to.equal(false); // always false in the mainnet

        const minAmounts= await portfolioMain.getMinDepositAmounts();
        expect(minAmounts[0]).not.includes(ALOT);
        expect(minAmounts[0]).includes(AVAX);

    });

    it("Should use sendXChainMessage correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ
        const bridge1 = 1;            // BridgeProvider = 1 = Celer
        const bridge3 = 3;            // BridgeProvider = 3 = does not exist

        const nonce = 0;
        const transaction1 = 1;                // transaction = 1 = DEPOSIT [main --> sub]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = AVAX;
        const quantity = Utils.toWei("10");
        const timestamp = BigNumber.from(await f.latestTime());

        const { cChain , dexalotSubnet} = f.getChains();
        //const symbolId = Utils.fromUtf8("AVAX"+ cChain.chainListOrgId)

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        const defaultDestinationChainId = await portfolioBridgeMain.getDefaultDestinationChain();
        //Fail to enable Enable AVAX for CCTRADE at Mainnet for destination gun (defaultDestinationChainId)
        await expect(portfolioBridgeMain.connect(trader1).enableXChainSwapDestination(symbol, defaultDestinationChainId, constants.HashZero)).to.be.revertedWith("AccessControl:");
        await expect(portfolioBridgeMain.connect(trader1).enableSupportedNative(defaultDestinationChainId, symbol)).to.be.revertedWith("AccessControl:");

        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
        // fail paused contract
        await portfolioBridgeMain.pause();
        await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, bridge0, xfer1, traderAddress)).to.be.revertedWith("Pausable: paused");
        await portfolioBridgeMain.unpause();

        // fail for non-message sender role
        await expect(portfolioBridgeMain.connect(trader1).sendXChainMessage(defaultDestinationChainId,bridge0, xfer1, traderAddress)).to.be.revertedWith("AccessControl:");
        // fail for wrong BridgeProvider
        await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId,bridge3, xfer1, traderAddress)).to.be.revertedWith("Transaction reverted");
        // fail for non cross-chain
        xfer1.transaction = 4 // not a cross-chain transaction
        await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, bridge0, xfer1, traderAddress)).to.be.revertedWith("PB-GCMT-01");
        //fail for symbol not allowed for CCTRADE.  You can send any token cross chain as long as it is allowed at destination
        xfer1.transaction = 11 // CCTRADE
        await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, bridge1, xfer1, traderAddress)).to.be.revertedWith("PB-CCTR-02");

        xfer1.transaction = transaction1;
        //Enable AVAX for CCTRADE at Mainnet for destination gun (defaultDestinationChainId)
        await portfolioBridgeMain.enableXChainSwapDestination(symbol, defaultDestinationChainId, constants.HashZero);
        await portfolioBridgeMain.enableSupportedNative(defaultDestinationChainId, symbol);

        // fail - bridge provider enabled but not implemented
        // await portfolioBridgeMain.enableBridgeProvider(bridge1, true);
        // expect(await portfolioBridgeMain.isBridgeProviderEnabled(bridge1)).to.be.true;
        // await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, bridge1, xfer1, trader)).to.be.revertedWith("PB-RBNE-02");


        // succeed
        const tx = await portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, bridge0, xfer1, traderAddress);
        const receipt: any = await tx.wait();

        for (const log of receipt.events) {

            if (log.event !== "XChainXFerMessage") {
                continue;
            }
            // console.log(log);
            // console.log("**************");
            // console.log(log.address);
            expect(log.args.version).to.be.equal(3);
            expect(log.args.bridge).to.be.equal(bridge0);

            if (log.address == portfolioBridgeMain.address) {
                expect(log.args.remoteChainId).to.be.equal(dexalotSubnet.chainListOrgId);
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above


            } else if (log.address == portfolioBridgeSub.address) { //Subnet event
                expect(log.args.remoteChainId).to.be.equal(cChain.chainListOrgId); //message from mainnet
                expect(log.args.msgDirection).to.be.equal(1); // 0 SENT 1 RECEIVED
                // timestamp is overwritten at receival block.timestamp
                const txnBlock = await ethers.provider.getBlock(log.blockNumber);
                expect(log.args.xfer.timestamp).to.be.equal(txnBlock.timestamp);
            }

            //Symbol is always the source Symbol
            expect(log.args.xfer.symbol).to.be.equal(symbol);
            expect(log.args.xfer.nonce).to.be.equal(1);
            expect(log.args.xfer.transaction).to.be.equal(transaction1);
            expect(log.args.xfer.trader).to.be.equal(trader);
            expect(log.args.xfer.quantity).to.be.equal(quantity);
            expect(log.args.xfer.customdata).to.be.equal(Utils.emptyCustomData());

        }
        // fail for unauthorized sender of lzSend
        await expect(portfolioBridgeMain.connect(trader1).sendXChainMessage(defaultDestinationChainId, bridge0, xfer1, traderAddress)).to.be.revertedWith("AccessControl:");

        //Revoke PortfolioRole and fail for owner
        await portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
        await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, bridge0, xfer1, traderAddress)).to.be.revertedWith("AccessControl:");
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


    it("Should not accept via fallback()", async function () {
        const ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
        const iface = new ethers.utils.Interface(ABI)
        const calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader1.address, Utils.toWei("100")])
        await expect(owner.sendTransaction({to: portfolioBridgeMain.address, data: calldata}))
            .to.be.revertedWith("PB-NFUN-01")
    })

    it("Should fail if userPaysFee is true but user address is empty", async function () {
        const { dexalotSubnet } = f.getChains();
        const defaultBridge = 0;
        // fail for non-owner
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_ADMIN_ROLE(), owner.address);
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);

        const userPaysFee = true;
        // succeed for owner
        await expect(portfolioBridgeMain.setUserPaysFeeForDestination(defaultBridge, dexalotSubnet.chainListOrgId, userPaysFee))
        .to.emit(portfolioBridgeMain, "UserPaysFeeForDestinationUpdated")
        .withArgs(defaultBridge, dexalotSubnet.chainListOrgId, userPaysFee);

        const nonce = 0;
        const transaction1 = 1;                // transaction = 1 = DEPOSIT [main --> sub]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = AVAX;
        const quantity = Utils.toWei("10");
        const timestamp = BigNumber.from(await f.latestTime());

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        const defaultDestinationChainId = await portfolioBridgeMain.getDefaultDestinationChain();
        await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, defaultBridge, xfer1, ethers.constants.AddressZero)).to.be.revertedWith("PB-UFPE-01");
    })

    it("Should fail if userPaysFee is false, user address is set but unable to refund", async function () {
        const defaultBridge = 0;
        const nonce = 0;
        const transaction1 = 1;                // transaction = 1 = DEPOSIT [main --> sub]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = AVAX;
        const quantity = Utils.toWei("10");
        const timestamp = BigNumber.from(await f.latestTime());

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        const defaultDestinationChainId = await portfolioBridgeMain.getDefaultDestinationChain();

        await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, defaultBridge, xfer1, mainnetRFQAvax.address)).to.be.revertedWith("AccessControl:");
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);

        // fail to refund user with address of mainnetRFQAvax
        await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, defaultBridge, xfer1, mainnetRFQAvax.address)).to.be.revertedWith("PB-UFPR-01");
    })
});
