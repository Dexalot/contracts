/**
 * The test runner for Dexalot Portfolio Minter
 */

import Utils from './utils';

import {
    PortfolioSub,
    PortfolioMinter,
    PortfolioMinterMock__factory,
    PortfolioMinterAttacker,
    PortfolioMinterAttacker__factory
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Portfolio Minter", () => {
     let portfolioSub: PortfolioSub;
     let portfolioMinter: PortfolioMinter;

     let Attacker: PortfolioMinterAttacker__factory;
     let attacker: PortfolioMinterAttacker;

     beforeEach(async function () {
        const {portfolioSub: portfolioS, portfolioMinter: pminter} = await f.deployCompletePortfolio();
        portfolioSub = portfolioS;
        portfolioMinter = pminter;
     });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolioMinter.initialize(portfolioSub.address, "0x0000000000000000000000000000000000000000"))
            .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should not deploy without portfolio", async () => {
        const PortfolioMinterMock = await ethers.getContractFactory("PortfolioMinterMock") as PortfolioMinterMock__factory;
        await expect(upgrades.deployProxy(PortfolioMinterMock, ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"]))
            .to.be.revertedWith("PM-ZADD-01");
    });

    it("Should pause and unpause", async () => {
        const {trader1} = await f.getAccounts();
        // fail for non-pauser role
        await expect(portfolioMinter.connect(trader1).pause()).to.be.revertedWith("AccessControl:");
        // succeed for pauser role
        await portfolioMinter.pause();
        expect(await portfolioMinter.paused()).to.be.true;
        // fail for non-pauser role
        await expect(portfolioMinter.connect(trader1).unpause()).to.be.revertedWith("AccessControl:");
        // succeed for pauser role
        await portfolioMinter.unpause();
        expect(await portfolioMinter.paused()).to.be.false;
    })

    it("Should mint correctly", async () => {
        const {owner, trader1} = await f.getAccounts();

        const initialBalance = await trader1.getBalance();

        await portfolioMinter.grantRole(await portfolioMinter.MINTER_ROLE(), owner.address);
        await expect(portfolioMinter.mint(trader1.address, 100))
            .to.emit(portfolioMinter, "Mint")
            .withArgs(trader1.address, 100);

        expect((await trader1.getBalance()).sub(initialBalance)).to.equal("100");

        expect((await portfolioMinter.totalNativeMinted()).toString()).to.equal("100");
    })

    it("Should not mint if parameters are incorrect", async () => {
        const {owner, trader1} = await f.getAccounts();

        await portfolioMinter.grantRole(await portfolioMinter.MINTER_ROLE(), owner.address);

        // not enough balance
        await expect(portfolioMinter.mint(trader1.address, ethers.utils.parseEther("10000")))
            .to.be.revertedWith("PM-MOCK");

        await expect(portfolioMinter.mint(trader1.address, 0))
            .to.be.revertedWith("PM-ZAMT-01");
    })

    it("Should get native minter address", async () => {
        expect(await portfolioMinter.getNativeMinter()).to.equal("0x0000000000000000000000000000000000000000");
    })

    it("Should not accept via fallback()", async function () {
        const { trader1, owner } = await f.getAccounts();
        const ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
        const iface = new ethers.utils.Interface(ABI)
        const calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader1.address, Utils.toWei('100')])
        await expect(owner.sendTransaction({to: portfolioMinter.address, data: calldata}))
            .to.be.revertedWith("")
    })

    it("Should call real mint() from portfolioMinter successfully", async function () {
        const { trader1, owner } = await f.getAccounts();
        const portfolioMinter = await f.deployPortfolioMinterReal(portfolioSub)

        const initialBalance = await trader1.getBalance();

        await portfolioMinter.grantRole(await portfolioMinter.MINTER_ROLE(), owner.address);
        await expect(portfolioMinter.mint(trader1.address, 100))
            .to.emit(portfolioMinter, "Mint")
            .withArgs(trader1.address, 100);

        expect((await portfolioMinter.totalNativeMinted()).toString()).to.equal("100");

        expect((await trader1.getBalance()).sub(initialBalance)).to.equal("100");
    })

    it("Should handle revert cases for real mint() from portfolioMinter correctly", async function () {
        const { trader1, owner } = await f.getAccounts();
        const portfolioMinter = await f.deployPortfolioMinterReal(portfolioSub)

        // fail for non-minter role
        await expect(portfolioMinter.connect(trader1).mint(trader1.address, 100)).to.be.revertedWith("AccessControl:")

        // fail if paused
        await portfolioMinter.pause();
        await portfolioMinter.grantRole(await portfolioMinter.MINTER_ROLE(), owner.address);
        await expect(portfolioMinter.mint(trader1.address, 100)).to.be.revertedWith("Pausable: paused")

        // fail for 0 amount
        await portfolioMinter.unpause();
        await expect(portfolioMinter.mint(trader1.address, 0)).to.be.revertedWith("PM-ZAMT-01");
    })

    it("Should guard mint against reentrancy", async () => {
        const portfolioMinter = await f.deployPortfolioMinterReal(portfolioSub)

        Attacker = await ethers.getContractFactory("PortfolioMinterAttacker") as PortfolioMinterAttacker__factory;
        attacker = await Attacker.deploy(portfolioMinter.address);

        // 1st defense fail if MINTER_ROLE is not added
        await expect(attacker.attackMint()).to.be.revertedWith("AccessControl: account");

        // 2nd defense fail with ReentrancyGuard
        await portfolioMinter.grantRole(await portfolioMinter.MINTER_ROLE(), attacker.address);
         // without nonReentrant modifier added to the mint function of PortfolioMinter
         //     attackMint does not revert
         // with nonReentrant modifier added to the mint function of PortfolioMinteradded
         //     attackMint reverts but the hardhat catches "Mint Failed" from NativeMinterMock
         //     instead of the ReentrancyGuard revert message
        await expect(attacker.attackMint()).to.be.revertedWith("Mint Failed");
    })
 });
