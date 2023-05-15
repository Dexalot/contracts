/**
 * The test runner for Dexalot Portfolio Bridge Main
 */

import Utils from "./utils";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    PortfolioBridge,
    PortfolioMain,
    LZEndpointMock,
    LZEndpointMock__factory,
    MockToken,
} from "../typechain-types"

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { MockContract, smock } from "@defi-wonderland/smock";

describe("Portfolio Bridge Main", () => {
    let portfolioMain: PortfolioMain;
    let lzEndpointMain: LZEndpointMock;
    let portfolioBridgeMain: PortfolioBridge;

    let lzEndpointMock: MockContract<LZEndpointMock>;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let depositAvaxMessage: string;
    let depositAvaxPayload: string;

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");
    let alot : MockToken;
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const auctionMode: any = 0;


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
    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolioBridgeMain.initialize(lzEndpointMain.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should get portfolio address correctly", async () => {
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

        const srcChainId =1;
        const tokenDetails = await portfolioMain.getTokenDetailsById(Utils.fromUtf8("AVAX" + srcChainId));

        expect(tokenDetails.symbol).to.be.equal(Utils.fromUtf8("AVAX"))
        expect((await portfolioBridgeMain.getTokenList()).length).to.equal(1);

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
        const gasForDestinationLzReceiveLow = BigNumber.from(150000);
        // fail for non-owner
        await expect(portfolioBridgeMain.connect(trader1).setGasForDestinationLzReceive(gasForDestinationLzReceive)).to.be.revertedWith("AccessControl:");

        await portfolioBridgeMain.grantRole(portfolioBridgeMain.BRIDGE_ADMIN_ROLE(), owner.address);
        // Too low
        await expect(portfolioBridgeMain.setGasForDestinationLzReceive(gasForDestinationLzReceiveLow)).to.be.revertedWith("PB-MING-01");

        // succeed for non-owner
        await expect(portfolioBridgeMain.setGasForDestinationLzReceive(gasForDestinationLzReceive))
        .to.emit(portfolioBridgeMain, "GasForDestinationLzReceiveUpdated")
        .withArgs(gasForDestinationLzReceive);

        expect(await portfolioBridgeMain.gasForDestinationLzReceive()).to.be.equal(gasForDestinationLzReceive);
    });

    it("Should have gas Swap Amount 1 and bridgeFee 0 for AVAX in PortfolioBridgeMain", async () => {

        let params =await portfolioMain.bridgeParams(AVAX);
        expect(params.gasSwapRatio).to.equal(Utils.toWei("0.01"));
        expect(params.fee).to.equal(0);
        expect(params.usedForGasSwap).to.equal(false); // always false in the mainnet

        // Fail for non-bridge admin
        await expect ( portfolioBridgeMain.setBridgeParam(AVAX, Utils.toWei("0.3"), Utils.toWei("0"), true)).to.revertedWith("AccessControl:")
        // give BRIDGE_ADMIN to owner
        await portfolioBridgeMain.grantRole(portfolioBridgeMain.BRIDGE_ADMIN_ROLE(), owner.address);

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


        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
        // fail paused contract
        await portfolioBridgeMain.pause();
        await expect(portfolioBridgeMain.sendXChainMessage(bridge0, xfer1)).to.be.revertedWith("Pausable: paused");
        await portfolioBridgeMain.unpause();

        // fail for non-message sender role
        await expect(portfolioBridgeMain.connect(trader1).sendXChainMessage(bridge0, xfer1)).to.be.revertedWith("AccessControl:");
        // fail for wrong BridgeProvider
        await expect(portfolioBridgeMain.sendXChainMessage(bridge3, xfer1)).to.be.revertedWith("Transaction reverted");

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
        await expect(portfolioBridgeMain.connect(trader1).sendXChainMessage(bridge0, xfer1)).to.be.revertedWith("AccessControl:");

        //Revoke PortfolioRole and fail for owner
        await portfolioBridgeMain.revokeRole(portfolioBridgeMain.PORTFOLIO_ROLE(), owner.address);
        await expect(portfolioBridgeMain.sendXChainMessage(bridge0, xfer1)).to.be.revertedWith("AccessControl:");
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

    it("Should use lzRetryPayload correctly", async () => {
        const {admin,trader1} = await f.getAccounts();

        const MockLayerZeroEndpoint = await smock.mock<LZEndpointMock__factory>("LZEndpointMock");
        lzEndpointMock = await MockLayerZeroEndpoint.deploy(1);

        const portfolioBridge = await f.deployPortfolioBridge(lzEndpointMock as unknown as LZEndpointMock, portfolioMain);
        await portfolioBridge.grantRole(await portfolioBridge.DEFAULT_ADMIN_ROLE(), portfolioMain.address);
        await portfolioMain.addToken(AVAX, ZERO_ADDRESS, 1, 18, auctionMode, '0', ethers.utils.parseUnits('0.5',18)); //Auction mode off

        const nonce = 0;
        const tx = 0;                // TX = 0 = WITHDRAW [sub --> main]
        const srcChainId = 1;
        const symbolId = Utils.fromUtf8("AVAX"+ srcChainId)

        const xChainMessageType = 0; // XChainMsgType = 0 = XFER

        const depositAvaxMessage = ethers.utils.defaultAbiCoder.encode(
            [
                "uint64",   // nonce,
                "uint8",    // TX
                "address",  // trader
                "bytes32",  // symbol
                "uint256",  // quantity
                "uint256"   // timestamp
            ] ,
            [
                nonce,
                tx,
                trader1.address,
                symbolId,
                Utils.toWei("10"),
                await f.latestTime()
            ]
        )

        const depositAvaxPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            [xChainMessageType, depositAvaxMessage]
        )
        const xChainMessageNonExistant =5
        const MalFormedPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            [xChainMessageNonExistant, depositAvaxMessage]
        )

        await expect ((await portfolioBridgeMain.getXFerMessage(depositAvaxPayload))[1]).to.be.equal(Utils.fromUtf8("AVAX"));
        await expect ( portfolioBridgeMain.getXFerMessage(MalFormedPayload)).to.revertedWith("call revert exception");

        //const trustedRemote  = ethers.utils.solidityPack([ "address", "address" ], [ lzAppMock.address, lzAppMock.address ])
        const srcAddress = "0x6d6f636b00000000000000000000000000000000";   // address in bytes for successful test
        await portfolioBridge.setLZTrustedRemoteAddress(1, srcAddress);
        const trustedRemote = await portfolioBridge.lzTrustedRemoteLookup(srcChainId);
        // fail for non-admin
        await expect(portfolioBridge.connect(trader1).lzRetryPayload(depositAvaxPayload)).to.be.revertedWith("AccessControl: account");

        // fail as the account does not have money to actually withdraw, the success test is tested elsewhere
        await portfolioBridge.grantRole(portfolioBridge.BRIDGE_ADMIN_ROLE(), admin.address);

        const spPart1 = {
            payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-1),  // the string's byte representation in ts and in evm are different
            dstAddress: portfolioBridge.address,
            payloadHash: ethers.utils.keccak256(depositAvaxPayload)
        }
        const spPart2: any = {};
        spPart2[trustedRemote] = spPart1;
        const sp: any = {};
        sp[srcChainId] = spPart2;

        await lzEndpointMock.setVariable("storedPayload", sp);
        expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.true;
        await expect(portfolioBridge.connect(admin).lzRetryPayload(depositAvaxPayload)).to.be.revertedWith("P-WNFA-01");
    });
});
