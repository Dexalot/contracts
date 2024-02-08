/**
 * The test runner for LzApp via LzAppMock
 */

import Utils from './utils';

import {
    LzAppMock,
    LzAppMock__factory,
    LZEndpointMock,
    LZEndpointMock__factory,
    PortfolioBridgeMain
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { MockContract, smock } from '@defi-wonderland/smock';


describe("LzApp via LzAppMock", () => {
    let lzAppMock: MockContract<LzAppMock>;
    let lzEndpointMock: MockContract<LZEndpointMock>;
    let lzEndpoint: LZEndpointMock;
    let portfolioBridgeAvax: PortfolioBridgeMain;

    const AVAX: string = Utils.fromUtf8("AVAX");

    let depositAvaxMessage: string;
    let depositAvaxPayload: string;

    beforeEach(async function () {
        const { trader1 } = await f.getAccounts();
        const { cChain } = f.getChains();

        const MockLayerZeroEndpoint = await smock.mock<LZEndpointMock__factory>("LZEndpointMock");
        lzEndpointMock = await MockLayerZeroEndpoint.deploy(1);

        // deploy  LzAppMock with smock to freely manipulate state and test
        const LzAppMock = await smock.mock<LzAppMock__factory>("LzAppMock");
        lzAppMock = await LzAppMock.deploy();

        // deploy an LzEndPoint for testing
        lzEndpoint = await f.deployLZEndpoint(1);    // using same endpoint for testing


        const portfolioAvax = await f.deployPortfolioMain(cChain);
        portfolioBridgeAvax = await f.deployPortfolioBridge(lzEndpoint, portfolioAvax) as PortfolioBridgeMain;
        // const portfolioBridgeSub = await deployPortfolioBridge(lzEndpointSub, portfolioSub) as PortfolioBridgeSub;


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
                "uint256",   // timestamp
                "bytes32"  // customdata
            ] ,
            [
                nonce,
                tx,
                trader1.address,
                AVAX,
                Utils.toWei("10"),
                await f.latestTime(),
                ethers.constants.HashZero
            ]
        )

        depositAvaxPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            [xChainMessageType, depositAvaxMessage]
        )
    });

    it("Should get the initial lzEndPoint as zero address", async () => {
        const lzEndPoint = await lzAppMock.getLzEndPoint();
        expect(lzEndPoint).to.be.equal(ethers.constants.AddressZero);
    });

    it("Should use setLzEndPoint and getLzEndPoint correctly", async () => {
        const {other1} = await f.getAccounts();

        // fail for accounts not in default admin role
        await expect(lzAppMock.connect(other1).setLzEndPoint(lzEndpoint.address))
            .to.be.revertedWith("AccessControl:");

        // fail for zero address
        await expect(lzAppMock.setLzEndPoint(ethers.constants.AddressZero))
            .to.be.revertedWith("LA-LIZA-01");

        // succeed for owner in default admin role
        await lzAppMock.setLzEndPoint(lzEndpoint.address);

        const lzEp = await lzAppMock.getLzEndPoint();
        expect(lzEp).to.be.equal(lzEndpoint.address);  // new endpoint
    });

    it("Should use setSendVersion and getSendVersion correctly", async () => {
        const { other1 } = await f.getAccounts();

        // set the LzEndpoint for LzApp
        await lzAppMock.setLzEndPoint(lzEndpoint.address);

        const sendVersionMain = await lzEndpoint.getSendVersion(lzEndpoint.address);
        expect(sendVersionMain).to.be.equal(1);  // initial send version is 1

        // fail for non owner
        await expect(lzAppMock.connect(other1).setSendVersion(2)).to.be.revertedWith("AccessControl:");

        // succeed for owner
        await lzAppMock.setSendVersion(3);

        const sendVersionMainNew = await lzEndpoint.getSendVersion(lzEndpoint.address);
        expect(sendVersionMainNew).to.be.equal(1);  // new send version is still 1 because LZEndPointMock.sol has no user application configuration
    });

    it("Should use setReceiveVersion and getReceiveVersion correctly", async () => {
        const { other1 } = await f.getAccounts();

        // set the LzEndpoint for LzApp
        await lzAppMock.setLzEndPoint(lzEndpoint.address);

        const receiveVersionMain = await lzEndpoint.getReceiveVersion(lzEndpoint.address);
        expect(receiveVersionMain).to.be.equal(1);  // initial receive version is 1

        // fail for non owner
        await expect(lzAppMock.connect(other1).setReceiveVersion(2)).to.be.revertedWith("AccessControl:");

        // succeed for owner
        await lzAppMock.setReceiveVersion(2);

        const receiveVersionMainNew = await lzEndpoint.getReceiveVersion(lzEndpoint.address);
        expect(receiveVersionMainNew).to.be.equal(1);  // new receive version is still 1 because LZEndPointMock.sol has no user application configuration
    });

    it("Should use getConfig correctly", async () => {
        // set the LzEndpoint for LzApp
        await lzAppMock.setLzEndPoint(lzEndpoint.address);

        const receiveVersion = await lzEndpoint.getReceiveVersion(lzEndpoint.address);
        const sendVersion = await lzEndpoint.getSendVersion(lzEndpoint.address);

        expect(receiveVersion).to.be.equal(1);  // initial receive version is 1
        expect(sendVersion).to.be.equal(1);     // initial send version is 1

        const chainIdMain = await lzEndpoint.getChainId();
        expect(chainIdMain).to.be.equal(1);         // chain id for test is set to 1

        const EMMPTY_CONFIG = 0;  // no config types are defined at the beginning
        //LZEndPointMock.sol has no user application configuration
        expect(await lzAppMock.getConfig(receiveVersion, chainIdMain, lzAppMock.address, EMMPTY_CONFIG))
            .to.be.equal("0x");  // no user app configs are defined, yet for receiveVersion
        expect(await lzAppMock.getConfig(sendVersion, chainIdMain, lzAppMock.address, EMMPTY_CONFIG))
            .to.be.equal("0x");  // no user app configs are defined, yet for sendVersion
    });

    it("Should use setConfig correctly", async () => {
        const { other1 } = await f.getAccounts();

        // set the LzEndpoint for LzApp
        await lzAppMock.setLzEndPoint(lzEndpoint.address);

        // reference config types from LayerZero documentation
        // const CONFIG_TYPE_INBOUND_PROOF_LIBRARY_VERSION = 1
        // const CONFIG_TYPE_INBOUND_BLOCK_CONFIRMATIONS = 2
        // const CONFIG_TYPE_RELAYER = 3
        // const CONFIG_TYPE_OUTBOUND_PROOF_TYPE = 4
        // const CONFIG_TYPE_OUTBOUND_BLOCK_CONFIRMATIONS = 5
        // const CONFIG_TYPE_ORACLE = 6

        // create a config type to change block confirmations for inbound messages
        const CONFIG_TYPE_INBOUND_BLOCK_CONFIRMATIONS = 2

        const receiveVersionMain = await lzEndpoint.getReceiveVersion(lzAppMock.address);

        const chainIdMain = await lzEndpoint.getChainId();

        // call data in bytes for changing block confirmations for inbound messages to 8
        const config = ethers.utils.defaultAbiCoder.encode(["uint16"], [8])

        // fail for non owner
        await expect(lzAppMock.connect(other1).setConfig(receiveVersionMain, chainIdMain, CONFIG_TYPE_INBOUND_BLOCK_CONFIRMATIONS, config))
            .to.be.revertedWith("AccessControl:");

        // succeed for owner
        await lzAppMock.setConfig(receiveVersionMain, chainIdMain, CONFIG_TYPE_INBOUND_BLOCK_CONFIRMATIONS, config);

        // get the config set in the previous call
        const contractConfig = await lzAppMock.getConfig(receiveVersionMain, chainIdMain, lzAppMock.address, CONFIG_TYPE_INBOUND_BLOCK_CONFIRMATIONS);
        //LZEndPointMock.sol has no user application configuration
        expect(contractConfig).to.be.equal("0x");
        //expect(ethers.utils.defaultAbiCoder.decode(["uint16"], contractConfig)[0]).to.be.equal(8);
    });

    it("Should use getInboundNonce correctly", async () => {
        // set the LzEndpoint for LzApp
        await lzAppMock.setLzEndPoint(lzEndpoint.address);
        // let nonce = await lzAppMock.getInboundNonceMock(1);
        // expect(nonce).to.be.equal(0);   // no transactions are received
        const nonce = await lzAppMock.getInboundNonceMock(1, lzEndpoint.address);
        expect(nonce).to.be.equal(0);   // no transactions are received
    });

    it("Should use getOutboundNonce correctly", async () => {
        // set the LzEndpoint for LzApp
        await lzAppMock.setLzEndPoint(lzEndpoint.address);

        const nonce = await lzAppMock.getOutboundNonceMock(1);
        expect(nonce).to.be.equal(0);   // no transactions are sent
        // const nonce2 = await lzAppMock.getOutboundNonceMock(1, lzEndpoint.address);
        // expect(nonce2).to.be.equal(0);   // no transactions are sent
    });

    // it("Should set setDefaultDestinationChain correctly", async () => {
    //     const {other1} = await f.getAccounts();

    //     expect(lzAppMock.getTrustedRemoteAddress(1)).to.be.revertedWith("LA-DCNT-01");

    //     // fail for non owner
    //     await expect(lzAppMock.connect(other1).setDefaultDestinationChain(1)).to.be.revertedWith("AccessControl:");

    //     // fail default destination hasn't been setup
    //     await expect(lzAppMock.setDefaultDestinationChain(1)).to.be.revertedWith("PB-DDCS-01");

    //     // succeed for owner
    //     await expect(lzAppMock.setTrustedRemoteAddress(1, lzAppMock.address, 1111, 500000)).to.emit(lzAppMock, "DefaultChainIdUpdated").withArgs(1);

    //     await expect(lzAppMock.setTrustedRemoteAddress(2, lzAppMock.address, 2111, 400000)).to.emit(lzAppMock, "LzSetTrustedRemoteAddress")
    //         .withArgs(2, lzAppMock.address.toLowerCase(), 2111, 400000);

    //     const add = ethers.utils.getAddress(ethers.utils.hexlify(await lzAppMock.getTrustedRemoteAddress(1)));
    //     expect(add).to.be.equal(lzAppMock.address);

    //     const trustedRemote = await lzAppMock.lzTrustedRemoteLookup(1);
    //     expect(await lzAppMock.isLZTrustedRemote(1, trustedRemote)).to.be.equal(true);
    //     // const destinations = await lzAppMock.getAvailableDestinations();
    //     // expect(destinations[0].lzRemoteChainId).to.be.equal(1);
    //     // expect(destinations[0].chainListOrgChainId).to.be.equal(1111);
    //     // expect(destinations[0].gasForDestination).to.be.equal(500000);

    //     // expect(destinations[1].lzRemoteChainId).to.be.equal(2);
    //     // expect(destinations[1].chainListOrgChainId).to.be.equal(2111);
    //     // expect(destinations[1].gasForDestination).to.be.equal(400000);

    //     //console.log(destinations);
    // });

    // it("Should use hasStoredPayload correctly", async () => {
    //     // set the LzEndpoint for LzApp
    //     await lzAppMock.setLzEndPoint(lzEndpointMock.address);

    //     const srcChainId = 1;
    //     const srcAddress = "0x6d6f636b00000000000000000000000000000000";   // address in bytes for successful test

    //     await lzAppMock.setTrustedRemoteAddress(1, srcAddress, 1111, 500000);

    //     const trustedRemote = await lzAppMock.lzTrustedRemoteLookup(1);
    //     // fail for invalid caller
    //     const sp1Part1 = {
    //         payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-1),  // the string's byte representation in ts and in evm are different
    //         dstAddress: "0x0100000000000000000000000000000000000000",
    //         payloadHash: ethers.utils.keccak256(depositAvaxPayload)
    //     }
    //     const sp1Part2: any = {};
    //     sp1Part2[trustedRemote] = sp1Part1;
    //     const sp1: any = {};
    //     sp1[srcChainId] = sp1Part2;

    //     expect(await lzAppMock["hasStoredPayload(uint16,bytes)"](srcChainId, trustedRemote)).to.be.false; // initial state witho no stored payload

    //     await lzEndpointMock.setVariable("storedPayload", sp1);

    //     expect(await lzAppMock["hasStoredPayload(uint16,bytes)"](srcChainId, trustedRemote)).to.be.true; // final state should have a stored payload
    // });

    // it("Should use lzSend correctly", async () => {
    //     // set the LzEndpoint for LzApp
    //     await lzAppMock.setLzEndPoint(lzEndpoint.address);

    //     // set the destination for the lzEndpoint
    //     await lzEndpoint.setDestLzEndpoint(lzAppMock.address, lzEndpoint.address);

    //     // fail if remote is not trusted
    //     await expect(lzAppMock.lzSendMock(1, depositAvaxPayload)).to.be.revertedWith("LA-DCNT-01");

    //     // set the lzAppMock as a trusted remote. Setting it to itself. Both sender and receiver
    //     // await lzAppMock.setDefaultDestinationChain(1, lzAppMock.address);
    //     await lzAppMock.setTrustedRemoteAddress(1, lzAppMock.address, 1111, 500000);
    //     // This is failing with gas to low. Technically sending it to itself. Not a good test.
    //     // const tx = await lzAppMock.lzSendMock(depositAvaxPayload);
    //     // const rcpt = await tx.wait();
    //     // expect(rcpt.transactionHash.length).to.be.equal(66)
    // });

    // it.only("Should use forceResumeReceive correctly", async () => {
    //     const {admin,trader1} = await f.getAccounts();

    //     // change endpoint to the smock one
    //     await lzAppMock.setLzEndPoint(lzEndpointMock.address);

    //     const srcChainId = 1;

    //     const srcAddress = "0x6d6f636b00000000000000000000000000000000";   // address in bytes for successful test
    //     // await lzAppMock.setDefaultDestinationChain(1, srcAddress);
    //     portfolioBridgeAvax.setTrustedRemoteAddress(0, 1, srcAddress, 1111, 500000);
    //     const trustedRemote = await lzAppMock.lzTrustedRemoteLookup(1);

    //     // fail for invalid caller
    //     const sp1Part1 = {
    //         payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-1),  // the string's byte representation in ts and in evm are different
    //         dstAddress: "0x0100000000000000000000000000000000000000",
    //         payloadHash: ethers.utils.keccak256(depositAvaxPayload)
    //     }
    //     const sp1Part2: any = {};
    //     sp1Part2[trustedRemote] = sp1Part1;
    //     const sp1: any = {};
    //     sp1[srcChainId] = sp1Part2;

    //     await lzEndpointMock.setVariable("storedPayload", sp1);
    //     expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.true;

    //     // fail for non-admin
    //     await expect(lzAppMock.connect(trader1).forceResumeReceive(1, trustedRemote)).to.be.revertedWith("AccessControl: account");

    //     // fail for invalid caller
    //     await lzAppMock.grantRole(await lzAppMock.DEFAULT_ADMIN_ROLE(), admin.address);
    //     await expect(lzAppMock.connect(admin).forceResumeReceive(1, trustedRemote)).to.be.revertedWith("LayerZeroMock: invalid caller");

    //     // success with a correct payload
    //     const sp2Part1 = {
    //         payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-1),  // the string's byte representation in ts and in evm are different
    //         dstAddress: lzAppMock.address,
    //         payloadHash: ethers.utils.keccak256(depositAvaxPayload)
    //     }
    //     const sp2Part2: any = {};
    //     sp2Part2[trustedRemote] = sp2Part1;
    //     const sp2: any = {};
    //     sp2[srcChainId] = sp2Part2;

    //     await lzEndpointMock.setVariable("storedPayload", sp2);
    //     expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.true;
    //     await lzAppMock.connect(admin).forceResumeReceive(srcChainId, trustedRemote);
    //     expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.false;
    // });

    // it("Should use retryPayload correctly", async () => {
    //     const {admin,trader1} = await f.getAccounts();

    //     // change endpoint to the smock one
    //     await lzAppMock.setLzEndPoint(lzEndpointMock.address);

    //     const srcChainId = 1;

    //     const srcAddress = "0x6d6f636b00000000000000000000000000000000";   // address in bytes for successful test
    //     lzAppMock.setLZTrustedRemoteAddress(1, srcAddress, 1111, 500000);
    //     const trustedRemote = await lzAppMock.lzTrustedRemoteLookup(1);

    //     const srcAddressWL = "0x6d6f636000000000000000000000000000000000000000000000000000000000"; // address in bytes for failed test due to wrong payload length
    //     const srcAddressIH = "0x6d6f630000000000000000000000000000000000000000000000000000000000"; // address in bytes for failed test due to invalid payload hash


    //     // fail for non-admin
    //     await expect(lzAppMock.connect(trader1).retryPayload(srcChainId, trustedRemote, depositAvaxPayload)).to.be.revertedWith("AccessControl: account");

    //     // fail for a payload that doesn't exist
    //     await lzAppMock.grantRole(await lzAppMock.DEFAULT_ADMIN_ROLE(), admin.address);
    //     await expect(lzAppMock.connect(admin).retryPayload(srcChainId, srcAddressWL, depositAvaxPayload)).to.be.revertedWith("LayerZeroMock: no stored payload");

    //     // fail for invalid payload due to length not matching
    //     const spWLPart1 = {
    //         payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-2),
    //         dstAddress: lzAppMock.address,
    //         payloadHash:depositAvaxPayload //ethers.utils.keccak256(depositAvaxPayload)
    //     }
    //     const spWLPart2: any = {};
    //     spWLPart2[srcAddressWL] = spWLPart1;
    //     const spWL: any = {};
    //     spWL[srcChainId] = spWLPart2;

    //     await lzEndpointMock.setVariable("storedPayload", spWL);
    //     expect(await lzEndpointMock.hasStoredPayload(srcChainId, srcAddressWL)).to.be.true;

    //     await expect(lzAppMock.connect(admin).retryPayload(srcChainId, srcAddressWL, depositAvaxPayload)).to.be.revertedWith("LayerZeroMock: invalid payload");

    //     // fail for invalid payload due to invalid hash
    //     const spIHPart1 = {
    //         payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-2),
    //         dstAddress: lzAppMock.address,
    //         payloadHash: "0x0100000000000000000000000000000000000000000000000000000000000000"
    //     }
    //     const spIHPart2: any = {};
    //     spIHPart2[srcAddressIH] = spIHPart1;
    //     const spIH: any = {};
    //     spIH[srcChainId] = spIHPart2;

    //     await lzEndpointMock.setVariable("storedPayload", spIH);
    //     expect(await lzEndpointMock.hasStoredPayload(srcChainId, srcAddressIH)).to.be.true;

    //     await expect(lzAppMock.connect(admin).retryPayload(srcChainId, srcAddressIH, depositAvaxPayload)).to.be.revertedWith("LayerZeroMock: invalid payload");

    //     // succeed for the correctly formed payload
    //     const spPart1 = {
    //         payloadLength: ethers.BigNumber.from(depositAvaxPayload.length/2-1),  // the string's byte representation in ts and in evm are different
    //         dstAddress: lzAppMock.address,
    //         payloadHash: depositAvaxPayload //ethers.utils.keccak256(depositAvaxPayload)
    //     }
    //     const spPart2: any = {};
    //     spPart2[trustedRemote] = spPart1;
    //     const sp: any = {};
    //     sp[srcChainId] = spPart2;

    //     await lzEndpointMock.setVariable("storedPayload", sp);
    //     expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.true;
    //     await lzAppMock.connect(admin).retryPayload(srcChainId, trustedRemote, depositAvaxPayload);
    //     expect(await lzEndpointMock.hasStoredPayload(srcChainId, trustedRemote)).to.be.false;
    // });
});
