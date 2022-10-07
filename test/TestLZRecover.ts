/**
 * The test runner for LZ Recover Functionality
 */

import Utils from './utils';

import {
    LZEndpointMock,
    LZEndpointMock__factory,
    MockToken,
    PortfolioBridge,
    PortfolioMain,
     PortfolioSub
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { MockContract, smock } from '@defi-wonderland/smock';

describe("LZ Recover Functionality", async () => {
    let lzEndpointMain: MockContract<LZEndpointMock>;
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;

    let token_symbol: string;
    let token_decimals: number;

    let alot_token_symbol: string;
    let alot_token_decimals: number;
    let alot: MockToken;
    let ALOT: string;

    let portfolioBridgeMain: PortfolioBridge
    let portfolioBridgeSub: PortfolioBridge

    let avaxMessage: string;
    let avaxPayload: string;

    beforeEach(async function () {
        const {trader1 } = await f.getAccounts()

        portfolioMain = await f.deployPortfolioMain("AVAX");
        portfolioSub = await f.deployPortfolioSub("ALOT");

        const srcChainId = 1;
        const tokenDecimals = 18;
        const auctionMode: any = 0;


        const MockLayerZeroEndpoint = await smock.mock<LZEndpointMock__factory>("LZEndpointMock");
        lzEndpointMain = await MockLayerZeroEndpoint.deploy(1)
        //const lzEndpointSub: LZEndpointMock = await deployLZEndpoint(2);
        //using same endpoint for testing
        portfolioBridgeMain = await f.deployPortfolioBridge(lzEndpointMain as unknown as LZEndpointMock, portfolioMain);
        portfolioBridgeSub = await f.deployPortfolioBridge(lzEndpointMain as unknown as LZEndpointMock, portfolioSub);
        await portfolioSub.addToken(Utils.fromUtf8("AVAX"), "0x0000000000000000000000000000000000000000", srcChainId, tokenDecimals, auctionMode);
        await f.setRemoteBridges(portfolioBridgeMain, 1, portfolioBridgeSub, 1, lzEndpointMain as unknown as LZEndpointMock, lzEndpointMain as unknown as LZEndpointMock);

        await f.deployGasStation(portfolioSub);
        await f.deployPortfolioMinterMock(portfolioSub, "0x0000000000000000000000000000000000000000");

        token_symbol = "USDT";
        token_decimals = 18;
        await f.deployMockToken(token_symbol, token_decimals)
        Utils.fromUtf8(token_symbol);

        alot_token_symbol = "ALOT";
        alot_token_decimals = 18;
        alot = await f.deployMockToken(alot_token_symbol, alot_token_decimals)
        ALOT = Utils.fromUtf8(alot_token_symbol);

        await portfolioMain.addToken(ALOT, alot.address, srcChainId, alot_token_decimals, auctionMode)

        await alot.mint(trader1.address, ethers.utils.parseEther("100"))
        await alot.connect(trader1).approve(portfolioMain.address, ethers.constants.MaxUint256)

        avaxMessage = ethers.utils.defaultAbiCoder.encode(
            [
                "uint64", // nonce,
                "uint8", // TX type,
                "address", // trader
                "bytes32", // symbol
                "uint256", // quantity
                "uint256" // timestamp
            ] ,
            [
                0,
                1,
                trader1.address,
                Utils.fromUtf8("AVAX"),
                ethers.utils.parseEther("1"),
                "1"
            ]
        )

        avaxPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            ["0", avaxMessage]
        )
    });


    it("Should manipulate lz endpoint - for mocking", async () => {
        const initialStoredPayload = await lzEndpointMain.storedPayload("1", "0x6d6f636b00000000000000000000000000000000000000000000000000000000")

        await lzEndpointMain.setVariable("storedPayload", {
            "1": {
                "0x6d6f636b00000000000000000000000000000000000000000000000000000000": {
                    payloadLength: avaxPayload.length,
                    dstAddress: "0x0100000000000000000000000000000000000000",
                    payloadHash: "0x0100000000000000000000000000000000000000000000000000000000000000"
                }
            }
        })

        const finalStoredPayload = await lzEndpointMain.storedPayload("1", "0x6d6f636b00000000000000000000000000000000000000000000000000000000")

        expect(finalStoredPayload).to.not.equal(initialStoredPayload)
    })

    it("Should recover native token sent from mainnet", async () => {
        const { trader1, owner } = await f.getAccounts()

        await lzEndpointMain.blockNextMsg()

        const tx = await portfolioMain.connect(trader1).depositNative(
            trader1.address,
            0,
            {
                value: ethers.utils.parseEther("1.0")
            }
        )
        const receipt: any = await tx.wait()
        const data = receipt.events[1]
        const iface = new ethers.utils.Interface(["event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason)"]);
        const event = iface.parseLog(data);
        const payload = event.args.payload;

        const beforeBalance = await portfolioSub.getBalance(
            trader1.address,
            Utils.fromUtf8("AVAX")
        )

        await portfolioSub.connect(owner).lzRecoverPayload(
            payload
        )

        const afterBalance = await portfolioSub.getBalance(
            trader1.address,
            Utils.fromUtf8("AVAX")
        )

        expect(afterBalance.total.sub(beforeBalance.total)).to.equal(
            ethers.utils.parseEther("1.0")
        )
    })

    it("Should recover erc20 token sent from mainnet", async () => {
        const { trader1, owner } = await f.getAccounts()

        await lzEndpointMain.blockNextMsg()

        const tx = await portfolioMain.connect(trader1).depositToken(
            trader1.address,
            ALOT,
            ethers.utils.parseEther("1.0"),
            0
        )
        const receipt: any = await tx.wait()
        const data = receipt.events[2]
        const iface = new ethers.utils.Interface(["event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason)"]);
        const event = iface.parseLog(data);
        const payload = event.args.payload;

        const beforeBalance = await portfolioSub.getBalance(
            trader1.address,
            ALOT
        )

        await portfolioSub.connect(owner).lzRecoverPayload(
            payload
        )

        const afterBalance = await portfolioSub.getBalance(
            trader1.address,
            ALOT
        )

        expect(afterBalance.total.sub(beforeBalance.total)).to.equal(
            ethers.utils.parseEther("1.0")
        )
    })

    it("Should recover erc20 token sent from subnet", async () => {
        const { trader1, owner } = await f.getAccounts()

        let tx = await portfolioMain.connect(trader1).depositToken(
            trader1.address,
            ALOT,
            ethers.utils.parseEther("1.0"),
            0
        )
        await tx.wait()

        await lzEndpointMain.blockNextMsg()

        tx = await portfolioSub.connect(trader1).withdrawToken(
            trader1.address,
            ALOT,
            ethers.utils.parseEther("1.0"),
            0
        )

        const receipt: any = await tx.wait()
        const data = receipt.events[1]
        const iface = new ethers.utils.Interface(["event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason)"]);
        const event = iface.parseLog(data);
        const payload = event.args.payload;

        const beforeBalance = await alot.balanceOf(trader1.address)

        await portfolioMain.connect(owner).lzRecoverPayload(
            payload
        )

        const afterBalance = await alot.balanceOf(trader1.address)

        expect(afterBalance.sub(beforeBalance)).to.equal(
            ethers.utils.parseEther("1.0")
        )
    })

    it("Should recover AVAX token sent from subnet", async () => {
        const { trader1, owner } = await f.getAccounts()

        let tx = await portfolioMain.connect(trader1).depositNative(
            trader1.address,
            0,
            {
                value: ethers.utils.parseEther("1.0")
            }
        )
        await tx.wait()

        await lzEndpointMain.blockNextMsg()

        tx = await portfolioSub.connect(trader1).withdrawToken(
            trader1.address,
            Utils.fromUtf8("AVAX"),
            ethers.utils.parseEther("1.0"),
            0
        )

        const receipt: any = await tx.wait()
        const data = receipt.events[1]
        const iface = new ethers.utils.Interface(["event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason)"]);
        const event = iface.parseLog(data);
        const payload = event.args.payload;

        const beforeBalance = await trader1.getBalance()

        await portfolioMain.connect(owner).lzRecoverPayload(
            payload
        )

        const afterBalance = await trader1.getBalance()

        expect(afterBalance.sub(beforeBalance)).to.equal(
            ethers.utils.parseEther("1.0")
        )
    })

    it("shouldn't recover if the caller is not the owner", async () => {
        const { trader1 } = await f.getAccounts()

        await lzEndpointMain.blockNextMsg()

        const tx = await portfolioMain.connect(trader1).depositNative(
            trader1.address,
            0,
            {
                value: ethers.utils.parseEther("1.0")
            }
        )
        const receipt: any = await tx.wait()
        const data = receipt.events[1]
        const iface = new ethers.utils.Interface(["event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason)"]);
        const event = iface.parseLog(data);
        const payload = event.args.payload;

        await expect(portfolioMain.connect(trader1).lzRecoverPayload(
            payload
        )).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`)
    })

    it("shouldn't recover ALOT if the payload is impossible to process", async () => {
        const { trader1 } = await f.getAccounts()

        await lzEndpointMain.blockNextMsg()

        const tx = await portfolioMain.connect(trader1).depositToken(
            trader1.address,
            ALOT,
            ethers.utils.parseEther("1.0"),
            0
        )
        const receipt: any = await tx.wait()
        const data = receipt.events[2]
        const iface = new ethers.utils.Interface(["event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason)"]);
        const event = iface.parseLog(data);
        const payload = event.args.payload;

        const amountModifiedPayload = payload.slice(0, 498) + "2B5E3AF16B1880000" + payload.slice(513)

        const modifiedPayload = payload.slice(0, 384) + "55534454" + payload.slice(392)

        await expect(portfolioMain.lzRecoverPayload(
            modifiedPayload
        )).to.be.revertedWith(`P-ETNS-02`)

        await expect(portfolioMain.lzRecoverPayload(
            amountModifiedPayload
        )).to.be.revertedWith(`ERC20: transfer amount exceeds balance`)
    })

    it("shouldn't recover AVAX if the payload is impossible to process", async () => {
        const { trader1 } = await f.getAccounts()

        await lzEndpointMain.blockNextMsg()

        const tx = await portfolioMain.connect(trader1).depositNative(
            trader1.address,
            0,
            {
                value: ethers.utils.parseEther("1.0")
            }
        )
        const receipt: any = await tx.wait()
        const data = receipt.events[1]
        const iface = new ethers.utils.Interface(["event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason)"]);
        const event = iface.parseLog(data);
        const payload = event.args.payload;

        const amountModifiedPayload = payload.slice(0, 498) + "2B5E3AF16B1880000" + payload.slice(513)

        await expect(portfolioMain.lzRecoverPayload(
            amountModifiedPayload
        )).to.be.revertedWith(`P-WNFA-01`)
    })
})
