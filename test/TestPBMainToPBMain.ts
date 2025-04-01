/**
 * The test runner for Dexalot Portfolio Bridge Main
 */

import Utils from "./utils";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    PortfolioBridgeMain,
    PortfolioMain,
    PortfolioSub,
    MockToken,
    MainnetRFQ,
    ILayerZeroEndpointV2,
    SolPortfolioBridgeMock,
} from "../typechain-types"

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, constants} from "ethers";

describe("Mainnet RFQ Portfolio Bridge Main to Portfolio Bridge Main", () => {
    let portfolioAvax: PortfolioMain;
    let portfolioArb: PortfolioMain;
    let portfolioSub: PortfolioSub;



    let portfolioBridgeAvax: PortfolioBridgeMain;
    let portfolioBridgeArb: PortfolioBridgeMain;
    let portfolioBridgeGun: PortfolioBridgeMain;
    // let portfolioBridgeSub: PortfolioBridgeSub;
    let porfolioBridgeSol: SolPortfolioBridgeMock;

    let mainnetRFQAvax: MainnetRFQ;
    let mainnetRFQArb: MainnetRFQ;


    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let gunDetails: any;
    let usdcDetails: any;
    //let gunCcPayload: string;

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
        const initialUSDCBalance: string = Utils.parseUnits("10000", 6).toString();

        const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);
        portfolioAvax = portfolioContracts.portfolioAvax;
        portfolioArb = portfolioContracts.portfolioArb;
        portfolioSub = portfolioContracts.portfolioSub;

        //inventoryManager = portfolioContracts.inventoryManager;

        portfolioBridgeAvax = portfolioContracts.portfolioBridgeAvax;
        portfolioBridgeArb = portfolioContracts.portfolioBridgeArb;
        portfolioBridgeGun = portfolioContracts.portfolioBridgeGun;
        //portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;

        const lzEndpointAvax = portfolioContracts.lzEndpointAvax as ILayerZeroEndpointV2;
        const lzV2AppAvax = portfolioContracts.lzAppAvax;

        mainnetRFQAvax = portfolioContracts.mainnetRFQAvax;
        mainnetRFQArb = portfolioContracts.mainnetRFQArb;

        const { cChain, gunzillaSubnet, solChain } = f.getChains();

        const solContracts = await f.deployMockSolana();
        porfolioBridgeSol = solContracts.pBridgeSolana;
        await f.setRemoteBridges(portfolioBridgeAvax, porfolioBridgeSol, lzEndpointAvax, solContracts.lzEndpointSolana, lzV2AppAvax, solContracts.lzV2AppSolana, cChain, solChain);


        gunDetails = { symbol: "GUN", symbolbytes32: Utils.fromUtf8("GUN"), decimals: 18 };
        usdcDetails = { symbol: "USDC", symbolbytes32: Utils.fromUtf8("USDC"), decimals: 6 };

        usdcDetails = { symbol: "USDC", symbolbytes32: Utils.fromUtf8("USDC"), decimals: 6 };

        usdc = await f.deployMockToken(usdcDetails.symbol, usdcDetails.decimals)
        usdcArb = await f.deployMockToken(usdcDetails.symbol, usdcDetails.decimals)

        await f.addToken(portfolioAvax, portfolioSub, usdc, 0.5, 0, true, 0);
        await f.addToken(portfolioArb, portfolioSub, usdcArb, 0.5, 0, true, 0);

        await usdc.mint(mainnetRFQAvax.address, initialUSDCBalance);
        await usdcArb.mint(mainnetRFQArb.address, initialUSDCBalance);

        //Enable GUN for CCTRADE at Cchain for destination gun
        await portfolioBridgeAvax.enableXChainSwapDestination(gunDetails.symbolbytes32, gunzillaSubnet.chainListOrgId, constants.HashZero);
        await portfolioBridgeAvax.enableSupportedNative(gunzillaSubnet.chainListOrgId, gunDetails.symbolbytes32);
        //Enable USDC for CCTRADE at gunzilla for destination avax
        await portfolioBridgeGun.enableXChainSwapDestination(usdcDetails.symbolbytes32, cChain.chainListOrgId, Utils.addressToBytes32(usdc.address));

    });

    it("Should be able to send tokens not allowed with CCTRADE", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = Utils.fromUtf8("AVAX");
        const quantity = Utils.parseUnits("10", gunDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { gunzillaSubnet } = f.getChains();

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
        await expect(portfolioBridgeAvax.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1, traderAddress)).to.be.revertedWith("PB-CCTR-02");

    });

    it("Should not send tokens with CCTRADE if symbol not allowed at destination", async () => {
        const {gunzillaSubnet } = f.getChains();

        const bridge0 = 0;            // BridgeProvider = 0 = LZ
        const nonce = 0;
        const transaction1 = 11;                // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = Utils.fromUtf8("GUN2");
        const quantity = Utils.parseUnits("10", gunDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

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
        //Enable GUN2 for CCTRADE at Cchain for destination gun
        await portfolioBridgeAvax.enableXChainSwapDestination(symbol, gunzillaSubnet.chainListOrgId, constants.HashZero);
        await portfolioBridgeAvax.enableSupportedNative(gunzillaSubnet.chainListOrgId, symbol);
        // This transaction reverts with PB-CCTR-03 but it goes into storedPayload instead of raising the error.
        await portfolioBridgeAvax.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1, traderAddress)
    });

    it("Should use sendXChainMessage for GUN from cChain to GUN correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = gunDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", gunDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { cChain, gunzillaSubnet } = f.getChains();

        await portfolioBridgeAvax.grantRole(await portfolioBridgeAvax.BRIDGE_USER_ROLE(), owner.address);

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol: Utils.fromUtf8("GUNT2"),
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };
        await portfolioBridgeAvax.enableXChainSwapDestination(xfer1.symbol, gunzillaSubnet.chainListOrgId, Utils.addressToBytes32(usdc.address));
        //await portfolioBridgeAvax.enableSupportedNative(gunzillaSubnet.chainListOrgId, symbol);

        // This transaction reverts with PB-ETNS-02 but it silent fails in LZEndpointV2 ??
        await portfolioBridgeAvax.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1, traderAddress);

        xfer1.symbol = symbol;
        const tx = await portfolioBridgeAvax.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1, traderAddress);
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

            expect(log.args.xfer.nonce).to.be.equal(2);
            expect(log.args.xfer.transaction).to.be.equal(transaction1);
            expect(log.args.xfer.trader).to.be.equal(trader);
            //No mapping when PBMain to PBMAIN
            expect(log.args.xfer.symbol).to.be.equal(symbol);
            expect(log.args.xfer.quantity).to.be.equal(quantity);
            expect(log.args.xfer.customdata).to.be.equal(Utils.emptyCustomData());
        }

    });

    it("Should use sendXChainMessage for token from Arb to GUN correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = gunDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", gunDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { arbitrumChain, gunzillaSubnet } = f.getChains();

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        await portfolioBridgeArb.grantRole(await portfolioBridgeArb.BRIDGE_USER_ROLE(), owner.address);
        //Enable GUN for CCTRADE at arb for destination gun
        await portfolioBridgeArb.enableXChainSwapDestination(symbol, gunzillaSubnet.chainListOrgId, constants.HashZero);
        await portfolioBridgeArb.enableSupportedNative(gunzillaSubnet.chainListOrgId, symbol);

        const tx = await portfolioBridgeArb.sendXChainMessage(gunzillaSubnet.chainListOrgId, bridge0, xfer1, traderAddress);
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
        // await f.printTokens([portfolioAvax, portfolioGun], portfolioSub, portfolioBridgeSub);

        const bridge0 = 0;  // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;  // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
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

        const value = await portfolioBridgeGun.getBridgeFee(bridge0, cChain.chainListOrgId, ethers.constants.HashZero, 0, traderAddress, Utils.emptyOptions());

        const tx = await portfolioBridgeGun.sendXChainMessage(cChain.chainListOrgId, bridge0, xfer1, traderAddress, {value: value});
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
        const transaction1 = 11;                // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = usdcDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", usdcDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { arbitrumChain, gunzillaSubnet } = f.getChains();

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

        //Enable USDC for CCTRADE at gunzilla for destination arb
        await portfolioBridgeGun.enableXChainSwapDestination(usdcDetails.symbolbytes32, arbitrumChain.chainListOrgId, Utils.addressToBytes32(usdcArb.address));
        const value = await portfolioBridgeGun.getBridgeFee(bridge0, arbitrumChain.chainListOrgId, ethers.constants.HashZero, 0, traderAddress, Utils.emptyOptions());

        // succeed
        const tx = await portfolioBridgeGun.sendXChainMessage(arbitrumChain.chainListOrgId, bridge0, xfer1, traderAddress, {value: value});
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

    it("Should use sendXChainMessage for regular token from Arb to Avalanche correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = usdcDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", usdcDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { arbitrumChain, cChain } = f.getChains();

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        await portfolioBridgeArb.grantRole(await portfolioBridgeArb.BRIDGE_USER_ROLE(), owner.address);
        expect(await portfolioBridgeArb.xChainAllowedDestinations(symbol, cChain.chainListOrgId)).to.be.equal(constants.HashZero);
        await expect(portfolioBridgeArb.sendXChainMessage(cChain.chainListOrgId, bridge0, xfer1, traderAddress)).to.be.revertedWith("PB-CCTR-02");

        //Enable USDC for CCTRADE at arb for destination CChain
        await portfolioBridgeArb.enableXChainSwapDestination(symbol, cChain.chainListOrgId, Utils.addressToBytes32(usdc.address));
        expect(await portfolioBridgeArb.xChainAllowedDestinations(symbol, cChain.chainListOrgId)).to.be.equal(Utils.addressToBytes32(usdc.address));
        expect(await portfolioBridgeArb.xChainAllowedDestinations(gunDetails.symbolbytes32, cChain.chainListOrgId)).to.be.equal(constants.HashZero);


        const tx = await portfolioBridgeArb.sendXChainMessage(cChain.chainListOrgId, bridge0, xfer1, traderAddress);
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

            if (log.address == portfolioBridgeArb.address) {
                expect(log.args.remoteChainId).to.be.equal(cChain.chainListOrgId);
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above
            } else if (log.address == portfolioBridgeAvax.address) { //Avax event
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

    it("Should use sendXChainMessage for regular token from Avalanche to Arb correctly", async () => {
        const bridge0 = 0;            // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;                // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = usdcDetails.symbolbytes32;
        const quantity = Utils.parseUnits("10", usdcDetails.decimals);
        const timestamp = BigNumber.from(await f.latestTime());

        const { arbitrumChain, cChain } = f.getChains();

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        await portfolioBridgeAvax.grantRole(await portfolioBridgeAvax.BRIDGE_USER_ROLE(), owner.address);
        expect(await portfolioBridgeAvax.xChainAllowedDestinations(symbol, arbitrumChain.chainListOrgId)).to.be.equal(constants.HashZero);
        await expect(portfolioBridgeAvax.sendXChainMessage(arbitrumChain.chainListOrgId, bridge0, xfer1, traderAddress)).to.be.revertedWith("PB-CCTR-02");

        //Enable USDC for CCTRADE at arb for destination CChain
        await portfolioBridgeAvax.enableXChainSwapDestination(symbol, arbitrumChain.chainListOrgId, Utils.addressToBytes32(usdcArb.address));
        expect(await portfolioBridgeAvax.xChainAllowedDestinations(symbol, arbitrumChain.chainListOrgId)).to.be.equal(Utils.addressToBytes32(usdcArb.address));
        expect(await portfolioBridgeAvax.xChainAllowedDestinations(gunDetails.symbolbytes32, arbitrumChain.chainListOrgId)).to.be.equal(constants.HashZero);


        const tx = await portfolioBridgeAvax.sendXChainMessage(arbitrumChain.chainListOrgId, bridge0, xfer1, traderAddress);
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

            if (log.address == portfolioBridgeAvax.address) {
                expect(log.args.remoteChainId).to.be.equal(arbitrumChain.chainListOrgId);
                expect(log.args.msgDirection).to.be.equal(0); // 0 SENT 1 RECEIVED
                expect(log.args.xfer.timestamp).to.be.equal(timestamp); // Timestamp when message is created from above
            } else if (log.address == portfolioBridgeArb.address) { //Arb event
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

    it("Should use sendXChainMessage Cchain to Sol correctly", async () => {
        const bridge0 = 0;  // BridgeProvider = 0 = LZ

        const nonce = 0;
        const transaction1 = 11;  // transaction = 11 = CCTRADE [main --> main]
        const traderAddress = trader1.address;
        const trader = Utils.addressToBytes32(traderAddress);
        const symbol = Utils.fromUtf8("SOL");
        const quantity = Utils.parseUnits("0.1", 9);
        const timestamp = BigNumber.from(await f.latestTime());

        const { solChain } = f.getChains();

        await portfolioBridgeAvax.grantRole(await portfolioBridgeAvax.BRIDGE_USER_ROLE(), owner.address);
        await portfolioBridgeAvax.enableSupportedNative(solChain.chainListOrgId, symbol);

        let xfer1: any = {};
        xfer1 = {nonce,
                 transaction: transaction1,
                 trader,
                 symbol,
                 quantity,
                 timestamp,
                 customdata: Utils.emptyCustomData()
        };

        const value = await portfolioBridgeAvax.getBridgeFee(bridge0, solChain.chainListOrgId, ethers.constants.HashZero, 0, traderAddress, Utils.emptyOptions());

        const tx = await portfolioBridgeAvax.sendXChainMessage(solChain.chainListOrgId, bridge0, xfer1, traderAddress, {value: value});
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

            if (log.address == portfolioBridgeAvax.address) {
                expect(log.args.remoteChainId).to.be.equal(solChain.chainListOrgId);
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
