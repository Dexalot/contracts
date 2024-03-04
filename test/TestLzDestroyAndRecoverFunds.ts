/**
 * The test runner for LZ Recover Funds of Destroyed Message Functionality
 */

import Utils from './utils';

import {
    LZEndpointMock,
    MockToken,
    PortfolioBridgeMain,
    PortfolioMain,
     PortfolioSub
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { MockContract } from '@defi-wonderland/smock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe("LZ Destroy Stuck Message & Recover Funds Functionality", async () => {
    let lzEndpointMain: MockContract<LZEndpointMock>;
    let lzEndpointSub: MockContract<LZEndpointMock>;
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;

    let token_symbol: string;
    let token_decimals: number;

    let alot_token_symbol: string;
    let alot_token_decimals: number;

    let alot: MockToken;
    let ALOT: string;

    let portfolioBridgeMain: PortfolioBridgeMain
    let portfolioBridgeSub: PortfolioBridgeMain

    let avaxMessage: string;
    let avaxPayload: string;
    let cChain: any;
    let dexalotSubnet: any;

    let owner: SignerWithAddress;
    let trader1: SignerWithAddress;

    before(async function () {
        const { trader1 :t1, owner :o1} = await f.getAccounts()
        const { cChain: cC , dexalotSubnet: dS} = f.getChains();
        cChain = cC;
        dexalotSubnet = dS;

        alot_token_symbol = "ALOT";
        alot_token_decimals = 18;
        ALOT = Utils.fromUtf8(alot_token_symbol);

        owner = o1;
        trader1 = t1;

        const portfolioContracts = await f.deployCompletePortfolio();
        await f.printTokens([portfolioContracts.portfolioAvax], portfolioContracts.portfolioSub, portfolioContracts.portfolioBridgeSub);
    });

    beforeEach(async function () {

        const portfolioContracts = await f.deployCompletePortfolio(true, true);
        portfolioMain = portfolioContracts.portfolioAvax;
        portfolioSub = portfolioContracts.portfolioSub;
        portfolioBridgeMain = portfolioContracts.portfolioBridgeAvax;
        portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
        lzEndpointMain = portfolioContracts.lzEndpointAvax as MockContract<LZEndpointMock>;
        lzEndpointSub = portfolioContracts.lzEndpointSub as MockContract<LZEndpointMock>;
        alot = portfolioContracts.alot;


        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_ADMIN_ROLE(), owner.address);
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);

        token_symbol = "USDT";
        token_decimals = 18;
        await f.deployMockToken(token_symbol, token_decimals)
        Utils.fromUtf8(token_symbol);


        await alot.mint(trader1.address, ethers.utils.parseEther("100"))
        await alot.connect(trader1).approve(portfolioMain.address, ethers.constants.MaxUint256)

        avaxMessage = ethers.utils.defaultAbiCoder.encode(
            [
                "uint64", // nonce,
                "uint8", // TX type,
                "address", // trader
                "bytes32", // symbol
                "uint256", // quantity
                "uint256" ,   // timestamp
                "bytes28"  // customdata
            ] ,
            [
                0,
                1,
                trader1.address,
                Utils.fromUtf8("AVAX"),
                ethers.utils.parseEther("1"),
                "1",
                Utils.emptyCustomData()
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

        await lzEndpointSub.blockNextMsg();

        const tx = await portfolioMain.connect(trader1).depositNative(
            trader1.address,
            0,
            {
                value: ethers.utils.parseEther("1.0")
            }
        );
        await tx.wait();
        // Keeping the following as an example for more complex tests CD
        // const receipt: any = await tx.wait();
        // const data = receipt.events[1];
        // const iface = new ethers.utils.Interface(["event PayloadStored(uint16 srcChainId, bytes srcAddress, address dstAddress, uint64 nonce, bytes payload, bytes reason)"]);
        // const event = iface.parseLog(data);
        // const payload = event.args.payload;


        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.true;

        const beforeBalance = await portfolioSub.getBalance(
            trader1.address,
            Utils.fromUtf8("AVAX")
        )


        const trustedRemote = await portfolioBridgeSub.lzTrustedRemoteLookup(cChain.lzChainId);
        const sp = await lzEndpointSub.storedPayload(cChain.lzChainId, trustedRemote);

        // fail for non-admin
        await expect(portfolioBridgeSub.connect(trader1).lzDestroyAndRecoverFunds(cChain.lzChainId, sp.payloadHash)).to.be.revertedWith("AccessControl: account");

        await portfolioBridgeSub.connect(owner).lzDestroyAndRecoverFunds(cChain.lzChainId,
            sp.payloadHash
        )

        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.false;


        const afterBalance = await portfolioSub.getBalance(
            trader1.address,
            Utils.fromUtf8("AVAX")
        )

        expect(afterBalance.total.sub(beforeBalance.total)).to.equal(
            ethers.utils.parseEther("1.0")
        )
    })

    it("Should recover erc20 token sent from mainnet", async () => {


        await lzEndpointSub.blockNextMsg()

        const  tx = await f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT,  "3.0");
        await tx.wait();

        const beforeBalance = await portfolioSub.getBalance(
            trader1.address,
            ALOT
        )

        const trustedRemote = await portfolioBridgeSub.lzTrustedRemoteLookup(cChain.lzChainId);
        const sp = await lzEndpointSub.storedPayload(cChain.lzChainId, trustedRemote);

        await portfolioBridgeSub.connect(owner).lzDestroyAndRecoverFunds(cChain.lzChainId,
            sp.payloadHash
        )

        const afterBalance = await portfolioSub.getBalance(
            trader1.address,
            ALOT
        )

        expect(afterBalance.total.sub(beforeBalance.total)).to.equal(
            ethers.utils.parseEther("3.0")
        )
    })

    it("Should recover erc20 token sent from subnet", async () => {


        const  tx = await f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT,  "3.0");
        await tx.wait();

        await lzEndpointMain.blockNextMsg()

        await f.withdrawToken(portfolioSub, trader1, ALOT, alot_token_decimals, "2.0");

        const beforeBalance = await alot.balanceOf(trader1.address)

        const trustedRemote = await portfolioBridgeMain.lzTrustedRemoteLookup(dexalotSubnet.lzChainId);
        const sp = await lzEndpointMain.storedPayload(dexalotSubnet.lzChainId, trustedRemote);

        await portfolioBridgeMain.connect(owner).lzDestroyAndRecoverFunds(dexalotSubnet.lzChainId,
            sp.payloadHash
        )

        const afterBalance = await alot.balanceOf(trader1.address);

        expect(afterBalance.sub(beforeBalance)).to.equal(
            ethers.utils.parseEther("2.0")
        )
    })

    it("Should recover AVAX token sent from subnet", async () => {


        //Deposit from mainnet to subnet
        await f.depositNative(portfolioMain, trader1, "3.0");

        await lzEndpointMain.blockNextMsg()

        await f.withdrawToken(portfolioSub, trader1, Utils.fromUtf8("AVAX"), alot_token_decimals, "3.0");
        // Withdraw from subnet and set it to blocked

        const trustedRemote = await portfolioBridgeMain.lzTrustedRemoteLookup(dexalotSubnet.lzChainId);
        const sp = await lzEndpointMain.storedPayload(dexalotSubnet.lzChainId, trustedRemote);

        // fail for non-admin, this revert consumes some gas
        await expect(portfolioBridgeMain.connect(trader1).lzDestroyAndRecoverFunds(dexalotSubnet.lzChainId,
            sp.payloadHash
        )).to.be.revertedWith("AccessControl: account");
        const beforeBalance = await trader1.getBalance();
        // success for admin
        await portfolioBridgeMain.connect(owner).lzDestroyAndRecoverFunds(dexalotSubnet.lzChainId,
            sp.payloadHash
        )

        const afterBalance = await trader1.getBalance()
        //console.log(ethers.utils.formatEther(afterBalance));
        expect(afterBalance.sub(beforeBalance)).to.equal(
            ethers.utils.parseEther("3.0")
        )
    })

    it("shouldn't recover if the caller is not the owner", async () => {
        await lzEndpointSub.blockNextMsg();

        await f.depositNative(portfolioMain, trader1, "1.0");
        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.true;

        const trustedRemote = await portfolioBridgeSub.lzTrustedRemoteLookup(cChain.lzChainId);
        const sp = await lzEndpointSub.storedPayload(cChain.lzChainId, trustedRemote);

        // fail for non-admin
        await expect(portfolioBridgeSub.connect(trader1).lzDestroyAndRecoverFunds(cChain.lzChainId, sp.payloadHash)).to.be.revertedWith("AccessControl: account");
        // Revoke BRIDGE_ADMIN_ROLE from the owner and try
        await portfolioBridgeSub.revokeRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
        await expect(portfolioBridgeSub.connect(owner).lzDestroyAndRecoverFunds(cChain.lzChainId,
            sp.payloadHash
        )).to.be.revertedWith("AccessControl: account")
        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.true;

    })

    it("shouldn't recover ALOT if the payload is impossible to process", async () => {
        //Deposit from mainnet to subnet
        const  tx = await f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT,  "3.0");
        await tx.wait();
        await lzEndpointMain.blockNextMsg();

        await f.withdrawToken(portfolioSub, trader1, ALOT, alot_token_decimals, "3.0");
        const trustedRemote = await portfolioBridgeMain.lzTrustedRemoteLookup(dexalotSubnet.lzChainId);
        const payload = (await lzEndpointMain.storedPayload(dexalotSubnet.lzChainId, trustedRemote)).payloadHash;
        const amountModifiedPayload = payload.slice(0, 177) + "2B5E3AF16B1880000" + payload.slice(194)
        const modifiedPayload = payload.slice(0, 128) + "55534454" + payload.slice(136)

        expect(await portfolioBridgeMain["hasStoredPayload()"]()).to.be.true;

        await expect(portfolioBridgeMain.lzDestroyAndRecoverFunds(dexalotSubnet.lzChainId,
            modifiedPayload
        )).to.be.revertedWith(`PB-ETNS-01`)

        await expect(portfolioBridgeMain.lzDestroyAndRecoverFunds(dexalotSubnet.lzChainId,
            amountModifiedPayload
        )).to.be.revertedWith(`ERC20: transfer amount exceeds balance`)

        // Transaction reverted Payload still present
        expect(await portfolioBridgeMain["hasStoredPayload()"]()).to.be.true;

    })

    it("shouldn't recover AVAX if the payload is impossible to process", async () => {

        await f.depositNative(portfolioMain, trader1, "1.0");
        await lzEndpointMain.blockNextMsg()

        await f.withdrawToken(portfolioSub, trader1, Utils.fromUtf8("AVAX"), alot_token_decimals, "1.0");
        const trustedRemote = await portfolioBridgeMain.lzTrustedRemoteLookup(dexalotSubnet.lzChainId);
        const payload = (await lzEndpointMain.storedPayload(dexalotSubnet.lzChainId, trustedRemote)).payloadHash;

        expect(await portfolioBridgeMain["hasStoredPayload()"]()).to.be.true;
        const amountModifiedPayload = payload.slice(0, 177) + "2B5E3AF16B1880000" + payload.slice(194)

        await expect(portfolioBridgeMain.lzDestroyAndRecoverFunds(dexalotSubnet.lzChainId,
            amountModifiedPayload
        )).to.be.revertedWith(`P-WNFA-01`)

        // Transaction reverted Payload still present
        expect(await portfolioBridgeMain["hasStoredPayload()"]()).to.be.true;
    })

    it("Should AVAX malformed message fail with lzRetryPayload from CChain to Subnet", async () => {
        await lzEndpointSub.blockNextMsg();
        await f.depositNative(portfolioMain, trader1, "3.0");

        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.true;

        const trustedRemote = await portfolioBridgeSub.lzTrustedRemoteLookup(cChain.lzChainId);
        const sp = await lzEndpointSub.storedPayload(cChain.lzChainId, trustedRemote);
        const payload = sp.payloadHash;

        // Try a malformed message with xChainMessageNonExistant =5
        const depositXfer = await portfolioBridgeSub.unpackXFerMessage(payload);
        const depositAvaxMessage = ethers.utils.defaultAbiCoder.encode(
            [
                "uint64",   // nonce,
                "uint8",    // TX
                "address",  // trader
                "bytes32",  // symbol
                "uint256",  // quantity
                "uint256",   // timestamp
                "bytes28" // custom data
            ] ,
            [
                depositXfer.nonce,
                depositXfer.transaction,
                depositXfer.trader,
                depositXfer.symbol,
                depositXfer.quantity,
                depositXfer.timestamp,
                depositXfer.customdata
            ]
        )

        const xChainMessageNonExistant = 5
        const MalFormedPayload = ethers.utils.defaultAbiCoder.encode(
            ["uint8", "bytes"],
            [xChainMessageNonExistant, depositAvaxMessage]
        )
        await expect (portfolioBridgeSub.unpackXFerMessage(MalFormedPayload)).to.revertedWith("call revert exception");
        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.true;

    });

    it("Should deliver AVAX with lzRetryPayload from CChain to Subnet", async () => {
        await lzEndpointSub.blockNextMsg();
        await f.depositNative(portfolioMain, trader1, "3.0");
        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.true;

        const trustedRemote = await portfolioBridgeSub.lzTrustedRemoteLookup(cChain.lzChainId);
        const sp = await lzEndpointSub.storedPayload(cChain.lzChainId, trustedRemote);
        const payload = sp.payloadHash;
        //replacing 3 with 50
        const amountModifiedPayload = payload.slice(0, 177) + "2B5E3AF16B1880000" + payload.slice(194);
        //console.log(await portfolioBridgeMain.unpackXFerMessage(payload))
        expect ((await portfolioBridgeMain.unpackXFerMessage(payload))[3]).to.be.equal(Utils.fromUtf8("AVAX"));
        // fail for non-admin
        await expect(portfolioBridgeSub.connect(trader1).lzRetryPayload(cChain.lzChainId, payload)).to.be.revertedWith("AccessControl: account");

        // Try to process a modified payload
        await expect(portfolioBridgeSub.connect(owner).lzRetryPayload(cChain.lzChainId, amountModifiedPayload)).to.be.revertedWith("LayerZeroMock: invalid payload");

        // success for owner
        await portfolioBridgeSub.connect(owner).lzRetryPayload(cChain.lzChainId, payload);
        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.false;

    });

    it("Should deliver AVAX with lzRetryPayload from Subnet to cChain ", async () => {
        await f.depositNative(portfolioMain, trader1, "3.0");
        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.false;

        // Withdraw from subnet and set it to blocked
        await lzEndpointMain.blockNextMsg();
        await f.withdrawToken(portfolioSub, trader1, Utils.fromUtf8("AVAX"), alot_token_decimals, "3.0");

        const trustedRemote = await portfolioBridgeMain.lzTrustedRemoteLookup(dexalotSubnet.lzChainId);
        const sp = await lzEndpointMain.storedPayload(dexalotSubnet.lzChainId, trustedRemote);
        const payload = sp.payloadHash;
        // Replacing quantity 3 with 5
        const amountModifiedPayload = payload.slice(0, 178) + "4563918244f40000" + payload.slice(194);
        // fail for non-owner, this revert consumes some gas
        await expect(portfolioBridgeMain.connect(trader1).lzRetryPayload(dexalotSubnet.lzChainId,
            payload
        )).to.be.revertedWith("AccessControl: account");

        // Try to process a modified payload
        await expect(portfolioBridgeMain.connect(owner).lzRetryPayload(dexalotSubnet.lzChainId, amountModifiedPayload)).to.be.revertedWith("LayerZeroMock: invalid payload");

        const beforeBalance = await trader1.getBalance();
        // success for owner
        await portfolioBridgeMain.connect(owner).lzRetryPayload(dexalotSubnet.lzChainId,
            sp.payloadHash
        )
        const afterBalance = await trader1.getBalance()
        expect(afterBalance.sub(beforeBalance)).to.equal(
            ethers.utils.parseEther("3.0")
        )
        expect(await portfolioBridgeMain["hasStoredPayload()"]()).to.be.false;

        // Withdrawing more money than deposited to PortfolioMain using the modified message
        const spPart1 = {
            payloadLength: sp.payloadLength,
            dstAddress: sp.dstAddress,
            payloadHash: amountModifiedPayload
        }

        const spPart2: any = {};
        spPart2[trustedRemote] = spPart1;
        const spModified: any = {};
        spModified[dexalotSubnet.lzChainId] = spPart2;
        // This is not possible to set in Production
        await lzEndpointMain.setVariable("storedPayload", spModified);
        expect(await lzEndpointMain.hasStoredPayload(dexalotSubnet.lzChainId, trustedRemote)).to.be.true;
        expect(await portfolioBridgeMain["hasStoredPayload(uint16,bytes)"](dexalotSubnet.lzChainId, trustedRemote)).to.be.true;
        await expect(portfolioBridgeMain.connect(owner).lzRetryPayload(dexalotSubnet.lzChainId, amountModifiedPayload)).to.be.revertedWith("P-WNFA-01");
    });

    it("Should deliver ERC20 with lzRetryPayload from CChain to Subnet", async () => {
        await lzEndpointSub.blockNextMsg();

        const  tx = await f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT,  "3.0");
        await tx.wait();

        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.true;

        const trustedRemote = await portfolioBridgeSub.lzTrustedRemoteLookup(cChain.lzChainId);
        const sp = await lzEndpointSub.storedPayload(cChain.lzChainId, trustedRemote);
        const payload = sp.payloadHash;
        //replacing 3 with 50
        const amountModifiedPayload = payload.slice(0, 177) + "2B5E3AF16B1880000" + payload.slice(194);

        expect ((await portfolioBridgeMain.unpackXFerMessage(payload))[3]).to.be.equal(ALOT);
        // fail for non-admin
        await expect(portfolioBridgeSub.connect(trader1).lzRetryPayload(cChain.lzChainId, payload)).to.be.revertedWith("AccessControl: account");

        // Try to process a modified payload
        await expect(portfolioBridgeSub.connect(owner).lzRetryPayload(cChain.lzChainId, amountModifiedPayload)).to.be.revertedWith("LayerZeroMock: invalid payload");

        // success for owner
        await portfolioBridgeSub.connect(owner).lzRetryPayload(cChain.lzChainId, payload);
        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.false;

    });

    it("Should deliver ERC20 with lzRetryPayload from Subnet to cChain ", async () => {

        const  tx = await f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT,  "3.0");
        await tx.wait();
        expect(await portfolioBridgeSub["hasStoredPayload()"]()).to.be.false;

        // Withdraw from subnet and set it to blocked
        await lzEndpointMain.blockNextMsg();
        await f.withdrawToken(portfolioSub, trader1, ALOT, alot_token_decimals, "3.0");

        const trustedRemote = await portfolioBridgeMain.lzTrustedRemoteLookup(dexalotSubnet.lzChainId);
        const sp = await lzEndpointMain.storedPayload(dexalotSubnet.lzChainId, trustedRemote);
        const payload = sp.payloadHash;
        // Replacing quantity 3 with 5
        const amountModifiedPayload = payload.slice(0, 178) + "4563918244f40000" + payload.slice(194);
        // fail for non-owner, this revert consumes some gas
        await expect(portfolioBridgeMain.connect(trader1).lzRetryPayload(dexalotSubnet.lzChainId,
            payload
        )).to.be.revertedWith("AccessControl: account");

        // Try to process a modified payload
        await expect(portfolioBridgeMain.connect(owner).lzRetryPayload(dexalotSubnet.lzChainId, amountModifiedPayload)).to.be.revertedWith("LayerZeroMock: invalid payload");

        const beforeBalance = await alot.balanceOf(trader1.address);
        // success for owner
        await portfolioBridgeMain.connect(owner).lzRetryPayload(dexalotSubnet.lzChainId,
            sp.payloadHash
        )
        const afterBalance = await alot.balanceOf(trader1.address)
        expect(afterBalance.sub(beforeBalance)).to.equal(
            ethers.utils.parseEther("3.0")
        )
        expect(await portfolioBridgeMain["hasStoredPayload()"]()).to.be.false;

        // Withdrawing more money than deposited to PortfolioMain using the modified message
        const spPart1 = {
            payloadLength: sp.payloadLength,
            dstAddress: sp.dstAddress,
            payloadHash: amountModifiedPayload
        }

        const spPart2: any = {};
        spPart2[trustedRemote] = spPart1;
        const spModified: any = {};
        spModified[dexalotSubnet.lzChainId] = spPart2;
        // This is not possible to set in Production
        await lzEndpointMain.setVariable("storedPayload", spModified);
        expect(await lzEndpointMain.hasStoredPayload(dexalotSubnet.lzChainId, trustedRemote)).to.be.true;
        expect(await portfolioBridgeMain["hasStoredPayload(uint16,bytes)"](dexalotSubnet.lzChainId, trustedRemote)).to.be.true;
        await expect(portfolioBridgeMain.connect(owner).lzRetryPayload(dexalotSubnet.lzChainId, amountModifiedPayload)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
})
