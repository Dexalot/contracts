/**
 * The test runner for Dexalot TokenVestingCloneFactory contract
 */

import Utils from './utils';

import type {
     PortfolioMain,
 } from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { ContractFactory } from 'ethers';

describe("TokenVestingCloneFactory", () => {
    let TokenVestingCloneable: ContractFactory

    let portfolio: PortfolioMain

    let currentTime

    before(async () => {
        TokenVestingCloneable = await ethers.getContractFactory("TokenVestingCloneable")
        const { portfolioAvax: portfolioM } = await f.deployCompletePortfolio();
        portfolio = portfolioM;
    });

    beforeEach(async function () {
        // nothing here
    });

    it("Should deploy correctly", async function () {
        const factory = await f.deployTokenVestingCloneFactory()
        // check if factory address is a valid evm address
        expect(/^(0x)?[0-9a-f]{40}$/i.test(factory.address)).to.be.true
    });

    it("Should have zero clones at the start", async function () {
        const factory = await f.deployTokenVestingCloneFactory()
        const count = await factory.count()
        expect(count).to.be.equal(0)
    });

    it("Should fail if clone index is out of bounds", async function () {
        const factory = await f.deployTokenVestingCloneFactory()
        const count = await factory.count()
        await expect(factory.getClone(count)).to.be.revertedWith("TVCF-IOOB-01")
    });

    it("Should use create clones correctly", async function () {
        const {owner, trader1, trader2, other1} = await f.getAccounts();

        let tx

        const factory = await f.deployTokenVestingCloneFactory()

        currentTime = await f.latestTime()
        const start = currentTime + (60*60*24) * 5            // start in 5 days
        const startPortfolioDeposits = start - (60*60*24) * 2 // portfolio deposits 2 days before start
        const cliffDuration = (60*60*24) * 30                 // cliff 30 days
        const duration = (60*60*24) * 365                     // 365 days
        const period = (60*60*24) * 30                        // 30 days
        const revocable = true
        const percentage = 10                                 // 10% percent initially released

        // fail for non-owner
        await expect(factory.connect(other1).createTokenVesting(trader1.address, start, cliffDuration, duration, startPortfolioDeposits,
            revocable, percentage, period, portfolio.address, owner.address))
            .to.be.revertedWith("Ownable: caller is not the owner");

        // create 2 clones
        tx = await factory.createTokenVesting(trader1.address, start, cliffDuration, duration, startPortfolioDeposits,
            revocable, percentage, period, portfolio.address, owner.address)
        await tx.wait()

        tx = await factory.createTokenVesting(trader2.address, start, cliffDuration, duration, startPortfolioDeposits,
            revocable, 2*percentage, 2*period, portfolio.address, owner.address)
        await tx.wait()

        // verify 2 clones
        const count = await factory.count()
        expect(count).to.be.equal(Utils.strToBn("2"))

        // verify clone 1 parameters
        let clone = TokenVestingCloneable.attach(await factory.getClone(0))
        expect(await clone.beneficiary()).to.be.equal(trader1.address)
        expect(await clone.start()).to.be.equal(start)
        expect(await clone.cliff()).to.be.equal(start + cliffDuration)
        expect(await clone.duration()).to.be.equal(duration)
        expect(await clone.startPortfolioDeposits()).to.be.equal(startPortfolioDeposits)
        expect(await clone.revocable()).to.be.equal(revocable)
        expect(await clone.period()).to.be.equal(period)
        expect(await clone.getPercentage()).to.be.equal(percentage)
        expect(await clone.getPortfolio()).to.be.equal(portfolio.address)

        // verify clone 2 period
        clone = TokenVestingCloneable.attach(await factory.getClone(1))
        expect(await clone.period()).to.be.equal(2*period)
        expect(await clone.getPercentage()).to.be.equal(2*percentage)
    });

});
