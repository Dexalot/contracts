/**
 * The test runner for Dexalot Portfolio Bridge Main
 */

import Utils from "./utils";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    PortfolioBridgeMain,
    //PortfolioBridgeSub,
    PortfolioMain,
    // LZEndpointMock,
    //MainnetRFQ,
    PortfolioSub,
    MockToken,
} from "../typechain-types"

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

describe("Mainnet RFQ Portfolio Bridge Main to Portfolio Bridge Main", () => {
    let portfolioAvax: PortfolioMain;
    let portfolioArb: PortfolioMain;
    let portfolioGun: PortfolioMain;
    let portfolioSub: PortfolioSub;
    // let inventoryManager: InventoryManager;

    // let lzEndpointMain: LZEndpointMock;
    // let lzEndpointGun: LZEndpointMock;
    // let lzEndpointArb: LZEndpointMock;

    let portfolioBridgeAvax: PortfolioBridgeMain;
    let portfolioBridgeArb: PortfolioBridgeMain;
    let portfolioBridgeGun: PortfolioBridgeMain;
    // let portfolioBridgeSub: PortfolioBridgeSub;

    // let mainnetRFQAvax: MainnetRFQ;
    // let mainnetRFQGun: MainnetRFQ;
    // let mainnetRFQArb: MainnetRFQ;


    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let gunDetails: any;
    let usdcDetails: any;

    let gunCcTrade: string;
    let gunCcPayload: string;

    let usdc: MockToken;
    let usdcArb: MockToken;



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
        const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);
        await f.printTokens([portfolioContracts.portfolioAvax, portfolioContracts.portfolioArb, portfolioContracts.portfolioGun]
            , portfolioContracts.portfolioSub, portfolioContracts.portfolioBridgeSub);
    });

    beforeEach(async function () {
        const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);
        portfolioAvax = portfolioContracts.portfolioAvax;
        portfolioArb = portfolioContracts.portfolioArb;
        portfolioGun = portfolioContracts.portfolioGun;
        portfolioSub = portfolioContracts.portfolioSub;

        //inventoryManager = portfolioContracts.inventoryManager;

        portfolioBridgeAvax = portfolioContracts.portfolioBridgeAvax;
        portfolioBridgeArb = portfolioContracts.portfolioBridgeArb;
        portfolioBridgeGun = portfolioContracts.portfolioBridgeGun;
        //portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;

        // lzEndpointMain = portfolioContracts.lzEndpointAvax as LZEndpointMock;
        // lzEndpointGun = portfolioContracts.lzEndpointGun as LZEndpointMock;
        // lzEndpointArb = portfolioContracts.lzEndpointArb as LZEndpointMock;

        // mainnetRFQAvax = portfolioContracts.mainnetRFQAvax;
        // mainnetRFQGun = portfolioContracts.mainnetRFQGun;
        // mainnetRFQArb = portfolioContracts.mainnetRFQArb;

        gunDetails = { symbol: "GUN", symbolbytes32: Utils.fromUtf8("GUN"), decimals: 18 };
        usdcDetails = { symbol: "USDC", symbolbytes32: Utils.fromUtf8("USDC"), decimals: 6 };

        usdc = await f.deployMockToken(usdcDetails.symbol, usdcDetails.decimals)
        usdcArb = await f.deployMockToken(usdcDetails.symbol, usdcDetails.decimals)
        const { cChain, gunzillaSubnet } = f.getChains();

        // Add virtual GUN to avalanche with gunzilla Network id
        await f.addVirtualToken(portfolioAvax, gunDetails.symbol, gunDetails.decimals, gunzillaSubnet.chainListOrgId);
        // Add virtual USDC to gunzilla with avalanche Network id (Which is the default destination). But USDC can be
        // sent to Arb as well
        //await f.addVirtualToken(portfolioGun, usdcDetails.symbol, usdcDetails.decimals, cChain.chainListOrgId);
        await f.addToken(portfolioAvax, portfolioSub, usdc, 0.5, 0, true, 0);
        await f.addToken(portfolioArb, portfolioSub, usdcArb, 0.5, 0, true, 0);

        const nonce = 0;
        const tx = 11;                // TX = 1 = CCTRADE [main --> sub]

        const xChainMessageType = 0; // XChainMsgType = 0 = XFER

        gunCcTrade = ethers.utils.defaultAbiCoder.encode(
            [
                "uint64",   // nonce,
                "uint8",    // TX = 11
                "address",  // trader
                "bytes32",  // symbol
                "uint256",  // quantity
                "uint256",   // timestamp
                "bytes28"  //customdata
            ] ,
            [
                nonce,
                tx,
                trader1.address,
                gunDetails.symbolbytes32,
                Utils.parseUnits("10", gunDetails.decimals),
                await f.latestTime(),
                Utils.emptyCustomData()
            ]
        )

        gunCcPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            [xChainMessageType, gunCcTrade]
        )




        // await usdc.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));



    });



    it("Should use lzReceive correctly", async () => {
        // await f.printTokens([portfolioAvax, portfolioGun], portfolioSub, portfolioBridgeSub);

        const srcChainId = 1;
        // fail from wrong address - instead of lzEndpoint address passed trader2 address
        await expect(portfolioBridgeGun.lzReceive(srcChainId, trader2.address, 0, gunCcTrade)).to.be.revertedWith("PB-IVEC-01");
    });

    it("Should use sendXChainMessage from cChain to GUN correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 1 = DEPOSIT [main --> sub]
        const trader = trader1.address;
        const symbol = gunDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", gunDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { cChain, gunzillaSubnet } = f.getChains();

        await portfolioBridgeAvax.grantRole(await portfolioBridgeAvax.BRIDGE_USER_ROLE(), owner.address);


        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        const tx = await portfolioBridgeAvax.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1, trader);
        const receipt: any = await tx.wait();

        for (const log of receipt.events) {

            if (log.event !== "XChainXFerMessage") {
                continue;
            }
            // console.log(log);
            // console.log("**************");
            // console.log(log.address);
            expect(log.args.version).to.be.equal(2);
            expect(log.args.bridge).to.be.equal(bridge0);

            if (log.address == portfolioBridgeAvax.address) {
                expect(log.args.remoteChainId).to.be.equal(gunzillaSubnet.chainListOrgId);
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above
            } else if (log.address == portfolioBridgeGun.address) { //Subnet event
                expect(log.args.remoteChainId).to.be.equal(cChain.chainListOrgId); //message from mainnet
                expect(log.args.msgDirection).to.be.equal(1); // 0 SENT 1 RECEIVED
                // timestamp is overwritten at receival block.timestamp
                const txnBlock = await ethers.provider.getBlock(log.blockNumber);
                expect(log.args.xfer.timestamp).to.be.equal(txnBlock.timestamp);
            }

            expect(log.args.xfer.nonce).to.be.equal(1);
            expect(log.args.xfer.transaction).to.be.equal(transaction1);
            expect(log.args.xfer.trader).to.be.equal(trader);
            //No mapping when PBMain to PBMAIN
            expect(log.args.xfer.symbol).to.be.equal(symbol);
            expect(log.args.xfer.quantity).to.be.equal(quantity);
            expect(log.args.xfer.customdata).to.be.equal(Utils.emptyCustomData());
        }

    });

    it("Should use sendXChainMessage from Arb to GUN correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 1 = DEPOSIT [main --> sub]
        const trader = trader1.address;
        const symbol = gunDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", gunDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { arbitrumChain, gunzillaSubnet } = f.getChains();

        await portfolioBridgeArb.grantRole(await portfolioBridgeArb.BRIDGE_USER_ROLE(), owner.address);


        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        await expect(portfolioBridgeArb.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1, trader)).to.be.revertedWith("PB-ETNS-01");

        // Add virtual GUN to avalanche with gunzilla Network id
        await f.addVirtualToken(portfolioArb, gunDetails.symbol, gunDetails.decimals, gunzillaSubnet.chainListOrgId);

        const tx = await portfolioBridgeArb.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1, trader);
        const receipt: any = await tx.wait();

        for (const log of receipt.events) {

            if (log.event !== "XChainXFerMessage") {
                continue;
            }
            // console.log(log);
            // console.log("**************");
            // console.log(log.address);
            expect(log.args.version).to.be.equal(2);
            expect(log.args.bridge).to.be.equal(bridge0);

            if (log.address == portfolioBridgeArb.address) {
                expect(log.args.remoteChainId).to.be.equal(gunzillaSubnet.chainListOrgId);
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above
            } else if (log.address == portfolioBridgeGun.address) { //Subnet event
                expect(log.args.remoteChainId).to.be.equal(arbitrumChain.chainListOrgId); //message from mainnet
                expect(log.args.msgDirection).to.be.equal(1); // 0 SENT 1 RECEIVED
                // timestamp is overwritten at receival block.timestamp
                const txnBlock = await ethers.provider.getBlock(log.blockNumber);
                expect(log.args.xfer.timestamp).to.be.equal(txnBlock.timestamp);
            }

            expect(log.args.xfer.nonce).to.be.equal(1);
            expect(log.args.xfer.transaction).to.be.equal(transaction1);
            expect(log.args.xfer.trader).to.be.equal(trader);
            //No mapping when PBMain to PBMAIN
            expect(log.args.xfer.symbol).to.be.equal(symbol);
            expect(log.args.xfer.quantity).to.be.equal(quantity);
            expect(log.args.xfer.customdata).to.be.equal(Utils.emptyCustomData());

        }
    });

    it("Should use sendXChainMessage Gun to Cchain correctly", async () => {
        // console.log("Afetr")
        // await f.printTokens([portfolioAvax, portfolioGun], portfolioSub, portfolioBridgeSub);

        const bridge0 = 0;  // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;  // transaction = 1 = DEPOSIT [main --> sub]
        const trader = trader1.address;
        const symbol = usdcDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", usdcDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { cChain, gunzillaSubnet } = f.getChains();

        await portfolioBridgeGun.grantRole(await portfolioBridgeGun.BRIDGE_USER_ROLE(), owner.address);

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        const value = await portfolioBridgeGun.getBridgeFee(bridge0, cChain.chainListOrgId, ethers.constants.HashZero, 0);

        await expect(portfolioBridgeGun.sendXChainMessage(cChain.chainListOrgId, bridge0, xfer1, trader, {value: value})).to.be.revertedWith("PB-ETNS-01");

        await f.addVirtualToken(portfolioGun, usdcDetails.symbol, usdcDetails.decimals, cChain.chainListOrgId);
        const tx = await portfolioBridgeGun.sendXChainMessage(cChain.chainListOrgId, bridge0, xfer1, trader, {value: value});
        const receipt: any = await tx.wait();

        for (const log of receipt.events) {

            if (log.event !== "XChainXFerMessage") {
                continue;
            }
            // console.log(log);
            // console.log("**************");
            // console.log(log.address);
            expect(log.args.version).to.be.equal(2);
            expect(log.args.bridge).to.be.equal(bridge0);

            if (log.address == portfolioBridgeAvax.address) {
                expect(log.args.remoteChainId).to.be.equal(gunzillaSubnet.chainListOrgId);
                expect(log.args.msgDirection).to.be.equal(1); // 0 SENT 1 RECEIVED
                // timestamp is overwritten at receival block.timestamp
                const txnBlock = await ethers.provider.getBlock(log.blockNumber);
                expect(log.args.xfer.timestamp).to.be.equal(txnBlock.timestamp);
            } else if (log.address == portfolioBridgeGun.address) { //Subnet event
                expect(log.args.remoteChainId).to.be.equal(cChain.chainListOrgId); //message from mainnet
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above

            }

            expect(log.args.xfer.nonce).to.be.equal(1);
            expect(log.args.xfer.transaction).to.be.equal(transaction1);
            expect(log.args.xfer.trader).to.be.equal(trader);
            //No mapping when PBMain to PBMAIN
            expect(log.args.xfer.symbol).to.be.equal(symbol);

            expect(log.args.xfer.quantity).to.be.equal(quantity);
            expect(log.args.xfer.customdata).to.be.equal(Utils.emptyCustomData());

        }
    });

    it("Should use sendXChainMessage Gun to Arb correctly", async () => {
        // console.log("Afetr")
        // await f.printTokens([portfolioAvax, portfolioGun], portfolioSub, portfolioBridgeSub);

        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 1 = DEPOSIT [main --> sub]
        const trader = trader1.address;
        const symbol = usdcDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", usdcDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { cChain, arbitrumChain, gunzillaSubnet } = f.getChains();

        // Adding virtual USDC with cchain chain id , NOT ARB, IT SHOULD NOT MATTER
        await f.addVirtualToken(portfolioGun, usdcDetails.symbol, usdcDetails.decimals, cChain.chainListOrgId);

        await portfolioBridgeGun.grantRole(await portfolioBridgeGun.BRIDGE_USER_ROLE(), owner.address);

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        const value = await portfolioBridgeGun.getBridgeFee(bridge0, arbitrumChain.chainListOrgId, ethers.constants.HashZero, 0);

        // succeed
        const tx = await portfolioBridgeGun.sendXChainMessage(arbitrumChain.chainListOrgId, bridge0, xfer1, trader, {value: value});
        const receipt: any = await tx.wait();

        for (const log of receipt.events) {

            if (log.event !== "XChainXFerMessage") {
                continue;
            }
            // console.log(log);
            // console.log("**************");
            // console.log(log.address);
            expect(log.args.version).to.be.equal(2);
            expect(log.args.bridge).to.be.equal(bridge0);

            if (log.address == portfolioBridgeArb.address) {
                expect(log.args.remoteChainId).to.be.equal(gunzillaSubnet.chainListOrgId);
                expect(log.args.msgDirection).to.be.equal(1); // 0 SENT 1 RECEIVED
                // timestamp is overwritten at receival block.timestamp
                const txnBlock = await ethers.provider.getBlock(log.blockNumber);
                expect(log.args.xfer.timestamp).to.be.equal(txnBlock.timestamp);
            } else if (log.address == portfolioBridgeGun.address) { //Subnet event
                expect(log.args.remoteChainId).to.be.equal(arbitrumChain.chainListOrgId); //message from mainnet
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above

            }

            expect(log.args.xfer.nonce).to.be.equal(1);
            expect(log.args.xfer.transaction).to.be.equal(transaction1);
            expect(log.args.xfer.trader).to.be.equal(trader);
            //No mapping when PBMain to PBMAIN
            expect(log.args.xfer.symbol).to.be.equal(symbol);
            expect(log.args.xfer.quantity).to.be.equal(quantity);
            expect(log.args.xfer.customdata).to.be.equal(Utils.emptyCustomData());

        }
    });
});
