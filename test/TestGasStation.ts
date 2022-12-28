/**
 * The test runner for Dexalot Subnet Gas Station
 */

import Utils from './utils';

import {
    PortfolioSub,
    GasStation,
    GasStation__factory
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

 describe("Gas Station", () => {
     let GasStation: GasStation__factory;

     let portfolioSub: PortfolioSub;

     let gasStation: GasStation;


     beforeEach(async function () {
        GasStation = await ethers.getContractFactory("GasStation") as GasStation__factory;

        const {portfolioSub: portfolioS, gasStation: gStation} = await f.deployCompletePortfolio();

        portfolioSub = portfolioS;
        gasStation= gStation;
     });

    it("Should not initialize again after deployment", async function () {
        await expect(gasStation.initialize(portfolioSub.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should deploy correctly", async () => {
        const {admin, treasurySafe} = await f.getAccounts();
        const gasStation: GasStation = await upgrades.deployProxy(GasStation, [portfolioSub.address]) as GasStation;

        await portfolioSub.setGasStation(gasStation.address);

        await portfolioSub.setTreasury(treasurySafe.address);

        await admin.sendTransaction({
            to: gasStation.address,
            value: ethers.utils.parseEther("100"), // Sends exactly 100 ALOT
        });

        expect(await ethers.provider.getBalance(gasStation.address)).to.eq(ethers.utils.parseEther("100"));
        expect(await gasStation.gasAmount()).to.eq(ethers.utils.parseEther("0.1"));
        expect(await gasStation.hasRole(await gasStation.SWAPPER_ROLE(), portfolioSub.address)).to.eq(true);
        expect(await portfolioSub.getGasStation()).to.eq(gasStation.address);
        expect(await portfolioSub.getTreasury()).to.eq(treasurySafe.address);

    })

    it("Should set gas amount", async () => {
        const { trader1 } = await f.getAccounts();
        await expect(gasStation.setGasAmount(ethers.utils.parseEther("0.5")))
        .to.emit(gasStation, "GasAmountChanged")
        await expect(gasStation.setGasAmount(ethers.utils.parseEther("0")))
        .to.be.revertedWith("GS-ASBTZ-02")
        await expect(gasStation.connect(trader1).setGasAmount(ethers.utils.parseEther("0.5")))
        .to.be.revertedWith("AccessControl: account")
    });

    it("Should withdraw native", async () => {
        const { owner, trader1 } = await f.getAccounts();

        await expect(gasStation.connect(trader1).withdrawNative(ethers.utils.parseEther("50")))
        .to.be.revertedWith("AccessControl: account")

        await expect(gasStation.withdrawNative(ethers.utils.parseEther("0")))
        .to.be.revertedWith("GS-ASBTZ-03")

        const beforeBalance = await owner.getBalance();

        const tx: any = await gasStation.withdrawNative(ethers.utils.parseEther("50"));
        const receipt = await tx.wait();

        expect((await owner.getBalance()).sub(beforeBalance).sub((receipt.cumulativeGasUsed).mul(receipt.effectiveGasPrice)).sub(ethers.utils.parseEther("50")))
        .to.lte(ethers.utils.parseEther("0.01"))
    })

    it("Should request gas", async () => {
        const { trader1, trader2 } = await f.getAccounts();
        const defaultGas = await gasStation.gasAmount();
        await expect(gasStation.connect(trader1).requestGas(trader1.address, defaultGas))
        .to.be.revertedWith("AccessControl: account")

        await gasStation.grantRole(await gasStation.SWAPPER_ROLE(), trader1.address);

        const beforeBalance = await trader2.getBalance();

        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
        await expect(gasStation.connect(trader1).requestGas(ZERO_ADDRESS, defaultGas))
        .to.be.revertedWith("GS-ZADDR-01")

        await expect(gasStation.connect(trader1).requestGas(trader2.address, defaultGas))
        .to.emit(gasStation, "GasRequested")
        const afterBalance = await trader2.getBalance();

        expect(afterBalance.sub(beforeBalance)).to.eq(await gasStation.gasAmount());
    })

    it("Should request gas different than default gas amount", async () => {
        const { trader1, trader2 } = await f.getAccounts();

        const defaultGas = await gasStation.gasAmount();
        const gasRequested = defaultGas.div(2);

        await expect(gasStation.connect(trader1).requestGas(trader1.address, gasRequested))
        .to.be.revertedWith("AccessControl: account")

        await gasStation.grantRole(await gasStation.SWAPPER_ROLE(), trader1.address);

        await expect(gasStation.connect(trader1).requestGas(trader2.address, defaultGas.add(gasRequested)))
        .to.be.revertedWith("GS-ASBTZ-04")

        const beforeBalance = await trader2.getBalance();
        await expect(gasStation.connect(trader1).requestGas(trader2.address, gasRequested))
        .to.emit(gasStation, "GasRequested")
        const afterBalance = await trader2.getBalance();

        expect(afterBalance.sub(beforeBalance)).to.eq(gasRequested);
    })


    it("Should fail if balance is not sufficient", async () => {
        const { trader1, trader2 } = await f.getAccounts();
        const gasAmount = ethers.utils.parseEther("1000");
        await gasStation.setGasAmount(gasAmount);
        await gasStation.grantRole(await gasStation.SWAPPER_ROLE(), trader1.address);

        await expect(gasStation.connect(trader1).requestGas(trader2.address, gasAmount))
        .to.be.revertedWith("GS-FAIL-01")

        await expect(gasStation.withdrawNative(ethers.utils.parseEther("10000")))
        .to.be.revertedWith("GS-FAIL-02")
    })

    it("Should pause and unpause", async () => {
        const { trader1 } = await f.getAccounts();
        const defaultGas = await gasStation.gasAmount();
        await gasStation.grantRole(await gasStation.SWAPPER_ROLE(), trader1.address);

        // fail for others not in pauser role
        await expect(gasStation.connect(trader1).pause()).to.be.revertedWith("AccessControl: account");

        // succeed for pausers
        await gasStation.pause();
        expect(await gasStation.paused()).to.eq(true);
        await expect(gasStation.connect(trader1).requestGas(trader1.address,defaultGas))
        .to.be.revertedWith("Pausable: paused")

        // fail for others not in pauser role
        await expect(gasStation.connect(trader1).unpause()).to.be.revertedWith("AccessControl: account");

        // succeed for pausers
        await gasStation.unpause();
        expect(await gasStation.paused()).to.eq(false);
        await expect(gasStation.connect(trader1).requestGas(trader1.address, defaultGas))
        .to.emit(gasStation, "GasRequested")
    })

    it("Should not accept via fallback()", async function () {
        const { trader1, owner } = await f.getAccounts();
        const ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
        const iface = new ethers.utils.Interface(ABI)
        const calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader1.address, Utils.toWei('100')])
        await expect(owner.sendTransaction({to: gasStation.address, data: calldata}))
            .to.be.revertedWith("")
    })


 });
