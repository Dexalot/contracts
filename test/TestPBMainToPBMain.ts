/**
 * The test runner for Dexalot Portfolio Bridge Main
 */

import Utils from "./utils";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    PortfolioBridgeMain,
    PortfolioBridgeSub,
    PortfolioMain,
    LZEndpointMock,
    MainnetRFQ,
} from "../typechain-types"

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

describe("Mainnet RFQ Portfolio Bridge Main to Portfolio Bridge Main", () => {
    let portfolioAvax: PortfolioMain;
    let portfolioGun: PortfolioMain;
    let portfolioSub: PortfolioSub;

    let lzEndpointMain: LZEndpointMock;
    let lzEndpointGun: LZEndpointMock;

    let portfolioBridgeMain: PortfolioBridgeMain;
    let portfolioBridgeGun: PortfolioBridgeMain;

    let portfolioBridgeSub: PortfolioBridgeSub;

    let mainnetRFQAvax: MainnetRFQ;
    let mainnetRFQGun: MainnetRFQ;


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
        await f.printTokens([portfolioContracts.portfolioAvax, portfolioContracts.portfolioGun], portfolioContracts.portfolioSub, portfolioContracts.portfolioBridgeSub);
    });

    beforeEach(async function () {
        const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);
        portfolioAvax = portfolioContracts.portfolioAvax;
        portfolioGun = portfolioContracts.portfolioGun;
        portfolioSub = portfolioContracts.portfolioSub;

        portfolioBridgeMain = portfolioContracts.portfolioBridgeAvax;
        portfolioBridgeGun = portfolioContracts.portfolioBridgeGun;
        portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;

        lzEndpointMain = portfolioContracts.lzEndpointAvax as LZEndpointMock;
        lzEndpointGun = portfolioContracts.lzEndpointGun as LZEndpointMock;

        mainnetRFQAvax = portfolioContracts.mainnetRFQAvax;
        mainnetRFQGun = portfolioContracts.mainnetRFQGun;

        gunDetails = { symbol: "GUN", symbolbytes32: Utils.fromUtf8("GUN"), decimals: 18 };
        usdcDetails = { symbol: "USDC", symbolbytes32: Utils.fromUtf8("USDC"), decimals: 6 };

        usdc = await f.deployMockToken(usdcDetails.symbol, usdcDetails.decimals)

        const { cChain, gunzillaSubnet } = f.getChains();

        // Add virtual GUN to avalanche with  gunzilla Network id
        await f.addVirtualToken(portfolioAvax, gunDetails.symbol, gunDetails.decimals, gunzillaSubnet.chainListOrgId);
        // Add virtual USDC to gunzilla with  avalanche Network id
        await f.addVirtualToken(portfolioGun, usdcDetails.symbol, usdcDetails.decimals, cChain.chainListOrgId);

        await f.addToken(portfolioAvax, portfolioSub, usdc, 0.5, 0, true, 0); //gasSwapRatio 10

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
                "bytes32"  //customdata
            ] ,
            [
                nonce,
                tx,
                trader1.address,
                gunDetails.symbolbytes32,
                Utils.parseUnits("10", gunDetails.decimals),
                await f.latestTime(),
                ethers.constants.HashZero
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

    it("Should use sendXChainMessage correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 1 = DEPOSIT [main --> sub]
        const trader = trader1.address;
        const symbol = gunDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", gunDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { cChain, gunzillaSubnet } = f.getChains();

        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);

        const symbolId = Utils.fromUtf8("GUN"+ gunzillaSubnet.chainListOrgId)

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: ethers.constants.HashZero
        };


        // succeed
        const tx = await portfolioBridgeMain.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1);
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

            if (log.address == portfolioBridgeMain.address) {
                expect(log.args.remoteChainId).to.be.equal(gunzillaSubnet.lzChainId);
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above

            } else if (log.address == portfolioBridgeGun.address) { //Subnet event
                expect(log.args.remoteChainId).to.be.equal(cChain.lzChainId); //message from mainnet
                expect(log.args.msgDirection).to.be.equal(1); // 0 SENT 1 RECEIVED
                // timestamp is overwritten at receival block.timestamp
                const txnBlock = await ethers.provider.getBlock(log.blockNumber);
                expect(log.args.xfer.timestamp).to.be.equal(txnBlock.timestamp);
            }

            expect(log.args.xfer.nonce).to.be.equal(1);
            expect(log.args.xfer.transaction).to.be.equal(transaction1);
            expect(log.args.xfer.trader).to.be.equal(trader);
            //sendXChainMessage calls packXferMessage which maps symbol to symbolId.
            //Check equality for symbolId and not the symbol below.
            expect(log.args.xfer.symbol).to.be.equal(symbolId);
            expect(log.args.xfer.quantity).to.be.equal(quantity);
            expect(log.args.xfer.customdata).to.be.equal(ethers.constants.HashZero);

        }
        // // fail for unauthorized sender of lzSend
        // await expect(portfolioBridgeMain.connect(trader1).sendXChainMessage(defaultDestinationChainId, bridge0, xfer1)).to.be.revertedWith("AccessControl:");

        // //Revoke PortfolioRole and fail for owner
        // await portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
        // await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, bridge0, xfer1)).to.be.revertedWith("AccessControl:");
    });

    it("Should use sendXChainMessage correctly Gun to Cchain", async () => {
        // console.log("Afetr")
        // await f.printTokens([portfolioAvax, portfolioGun], portfolioSub, portfolioBridgeSub);

        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 1 = DEPOSIT [main --> sub]
        const trader = trader1.address;
        const symbol = usdcDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", usdcDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { cChain, gunzillaSubnet } = f.getChains();

        await portfolioBridgeGun.grantRole(await portfolioBridgeGun.BRIDGE_USER_ROLE(), owner.address);

        const symbolId = Utils.fromUtf8("USDC"+ cChain.chainListOrgId)

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: ethers.constants.HashZero
        };


        // succeed
        const tx = await portfolioBridgeGun.sendXChainMessage(cChain.chainListOrgId, bridge0, xfer1);
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

            if (log.address == portfolioBridgeMain.address) {
                expect(log.args.remoteChainId).to.be.equal(gunzillaSubnet.lzChainId);
                expect(log.args.msgDirection).to.be.equal(1); // 0 SENT 1 RECEIVED
                // timestamp is overwritten at receival block.timestamp
                const txnBlock = await ethers.provider.getBlock(log.blockNumber);
                expect(log.args.xfer.timestamp).to.be.equal(txnBlock.timestamp);

            } else if (log.address == portfolioBridgeGun.address) { //Subnet event
                expect(log.args.remoteChainId).to.be.equal(cChain.lzChainId); //message from mainnet
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above

            }

            expect(log.args.xfer.nonce).to.be.equal(1);
            expect(log.args.xfer.transaction).to.be.equal(transaction1);
            expect(log.args.xfer.trader).to.be.equal(trader);
            //sendXChainMessage calls packXferMessage which maps symbol to symbolId.
            //Check equality for symbolId and not the symbol below.
            expect(log.args.xfer.symbol).to.be.equal(symbolId);
            expect(log.args.xfer.quantity).to.be.equal(quantity);
            expect(log.args.xfer.customdata).to.be.equal(ethers.constants.HashZero);

        }
        // // fail for unauthorized sender of lzSend
        // await expect(portfolioBridgeMain.connect(trader1).sendXChainMessage(defaultDestinationChainId, bridge0, xfer1)).to.be.revertedWith("AccessControl:");

        // //Revoke PortfolioRole and fail for owner
        // await portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
        // await expect(portfolioBridgeMain.sendXChainMessage(defaultDestinationChainId, bridge0, xfer1)).to.be.revertedWith("AccessControl:");
    });

});
