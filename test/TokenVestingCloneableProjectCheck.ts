/**
 * The test runner for Dexalot TokenVestingCloneable contract to test
 * for set of parameters in a specific project
 *
 * !!! This file is not meant for coverage, hence the name is NOT starting with 'Test***' !!!
 */

import Utils from './utils';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import type {
    DexalotToken,
    PortfolioMain,
    TokenVestingCloneFactory,
    TokenVestingCloneable,
    TokenVestingCloneable__factory
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from 'ethers';

describe("TokenVestingCloneable [ @skip-on-coverage ]", function () {
    let testToken: DexalotToken;
    let factory: TokenVestingCloneFactory;
    let TokenVestingCloneable: TokenVestingCloneable__factory;
    let tokenVesting: TokenVestingCloneable;

    let portfolio: PortfolioMain

    let owner: SignerWithAddress;
    let investor1: SignerWithAddress;

    let initialTime: number;
    let beneficiary: string;
    let start: number;
    let startPortfolioDeposits: number;
    let cliff: number;
    let duration: number;
    let revocable: boolean;
    let percentage: number;
    let period: number;
    let amount: number;

    let released: BigNumber
    let vestedAmount: BigNumber
    let vestedPercentageAmount: BigNumber

    let now: number;

    const srcChainId: any = 1;

    before(async () => {
        TokenVestingCloneable = await ethers.getContractFactory("TokenVestingCloneable") as TokenVestingCloneable__factory;
    })

    beforeEach(async function () {
        [owner, investor1] = await ethers.getSigners();

        testToken = await f.deployDexalotToken();

        const { portfolioMain: portfolioM } = await f.deployCompletePortfolio();

        portfolio = portfolioM;

        factory = await f.deployTokenVestingCloneFactory();

        initialTime = await f.latestTime();

        beneficiary = investor1.address;

        // ********* PARAMETERS FOR A PROJECT --- START *****

        const portfolioDepositsStartDate = "2022/11/02 13:40:00Z";
        const startDate = "2022/11/02 13:50:00Z";
        const cliffDate = "2022/11/02 14:00:00Z";
        const endDate = "2023/11/02 14:00:00Z";

        const numberOfPeriods = 4;  // number of periods needed between cliff and end dates

        // ==================================================

        startPortfolioDeposits = unixtime(new Date(portfolioDepositsStartDate));
        console.log(`startPortfolioDeposits: ${startPortfolioDeposits}`);
        start = unixtime(new Date(startDate));
        console.log(`startDate: ${start}`);
        cliff = unixtime(new Date(cliffDate)) - start;
        console.log(`Cliff duration: ${cliff}`);
        console.log(`Cliff date: ${start + cliff}`);
        duration = unixtime(new Date(endDate)) - start;
        console.log(`endDate: ${start + duration}`);
        console.log(`Duration: ${duration}`);
        revocable = true;
        percentage = 20;
        period = Math.floor((duration - cliff)/numberOfPeriods);  // periods are calculated for the remainder of time after cliff
        console.log(`Contract vesting period: ${period}`)

        // ********* PARAMETERS FOR A PROJECT --- END *******

        amount = 1000;
    });

    describe("Linear vesting with zero period", function () {

        // TIME PARAMETERS FOR TEST
        // ---|---- EPOCH 1---------|------- EPOCH 2----|----- EPOCH 3-----|----- EPOCH 4-----|----- EPOCH 5-----|----- EPOCH 6-----|
        // PORTFOLIO
        // DEPOSIT  ---+600-----> START --+600---> CLIFF (P0) --+period--> P1 --+period-----> P2 --+period-----> P3 --+period-----> P4
        // ENABLED

        it("Should have correct vestedPercentageAmount, vestedAmount and releasable amounts for different key times", async function () {
            const dt = Utils.fromUtf8("ALOT");
            const am: any = 0; // auction mode OFF

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            tokenVesting = TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(amount);

            await portfolio.addToken(dt, testToken.address, srcChainId, await testToken.decimals(), am, '0', ethers.utils.parseUnits('0.5', await testToken.decimals()));
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // R:0, VA:0, VP:0 |  BEFORE START OF EPOCH 1:
            // fast forward to portfolioDepositsStartDate
            await ethers.provider.send("evm_increaseTime", [startPortfolioDeposits - initialTime - 5]);
            await ethers.provider.send("evm_mine", [])
            initialTime = await f.latestTime();  // make t=0 for time comparisons
            now = await f.latestTime()

            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-initialTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(0);

            // R:0, VA:0, VP:200 |  START OF EPOCH 2: AT THE START DATE
            // fast forward to startDate
            await ethers.provider.send("evm_increaseTime", [1200]);
            await ethers.provider.send("evm_mine", []);
            now = await f.latestTime();

            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-initialTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(200);

            // R:0, VA:0, VP:200 |  WITHIN EP0CH 2
            // fast forward to 50% of EPOCH 2
            await ethers.provider.send("evm_increaseTime", [period/2]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()

            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-initialTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(200);

            // R:0, VA:0, VP:0 |  START OF EPOCH 3
            // fast forward to 25% of duration
            await ethers.provider.send("evm_increaseTime", [5 + period/2]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()

            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-initialTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(200);
            expect(vestedPercentageAmount).to.be.equal(200);

            // R:0, VA:400, VP:200 |  START OF EPOCH 4
            // fast forward to 50% of duration
            await ethers.provider.send("evm_increaseTime", [period]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()

            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-initialTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(400);
            expect(vestedPercentageAmount).to.be.equal(200);

            // R:0, VA:600, VP:200 |  START OF EPOCH 5
            // fast forward to 75% of duration
            await ethers.provider.send("evm_increaseTime", [period]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()

            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-initialTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(600);
            expect(vestedPercentageAmount).to.be.equal(200);

            // R:0, VA:800, VP:200 |  START OF EPOCH 6
            // fast forward to 100% of duration
            await ethers.provider.send("evm_increaseTime", [period]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()

            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-initialTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(800);
            expect(vestedPercentageAmount).to.be.equal(200);

            // R:0, VA:800, VP:200 |  AFTER THE END OF EPOCH 6
            // fast forward to 125% of duration
            await ethers.provider.send("evm_increaseTime", [period]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()

            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-initialTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(800);
            expect(vestedPercentageAmount).to.be.equal(200);
        });
    });
});

function unixtime(dObj: Date): number {
    // converts JS date object to unixtime in seconds
    return Math.floor(dObj.getTime() / 1000)
  }
