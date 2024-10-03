/**
 * The test runner for Dexalot TokenVestingCloneable contract
 */

import Utils from './utils';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import type {
    PortfolioMain,
    PortfolioSub,
    TokenVestingCloneFactory,
    TokenVestingCloneable__factory,
    MockToken
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from 'ethers';

const ZERO = '0x0000000000000000000000000000000000000000';

describe("TokenVestingCloneable", function () {
    let testToken: MockToken;
    let testTokenBytes32: string;
    let factory: TokenVestingCloneFactory;
    let TokenVestingCloneable: TokenVestingCloneable__factory;

    let portfolio: PortfolioMain
    let portfolioSub: PortfolioSub

    let owner: SignerWithAddress;
    let investor1: SignerWithAddress;

    let currentTime: number;
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
    // let srcChainListOrgId: number;
    let now: number;

    const token_decimals =18

    before(async () => {
        TokenVestingCloneable = await ethers.getContractFactory("TokenVestingCloneable") as TokenVestingCloneable__factory;
        const { cChain } = f.getChains();

        // srcChainListOrgId= cChain.chainListOrgId;
    })

    beforeEach(async function () {
        [owner, investor1] = await ethers.getSigners();

        testToken = await f.deployMockToken("DEG", token_decimals);
        testTokenBytes32 = Utils.fromUtf8("DEG")
        await testToken.mint(owner.address, Utils.toWei('100000000'));
        const { portfolioMainnet: portfolioM, portfolioSub: portfolioS } = await f.deployCompletePortfolio();

        portfolio = portfolioM;
        portfolioSub = portfolioS;

        //f.addToken(portfolio, portfolioSub, testToken, 0.0001, 2)

        factory = await f.deployTokenVestingCloneFactory();

        currentTime = await f.latestTime();
        beneficiary = investor1.address;
        start = currentTime;
        startPortfolioDeposits = currentTime - 5000;
        cliff = 400;
        duration = 2000;
        revocable = true;
        percentage = 10;
        period = 400;

        amount = 1000;
    });

    describe("Contract parameters", function () {

        it("Should not initialize again after deployment", async function () {
            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(tokenVesting.initialize(investor1.address, start, cliff, duration, startPortfolioDeposits,
                                                 revocable, percentage, period, portfolio.address, owner.address))
                .to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("Should assign total supply of tokens to the owner", async function () {
            const balance = await testToken.balanceOf(owner.address);
            expect(await testToken.totalSupply()).to.equal(balance);
        });

        it("Should create vesting for an investor", async function () {
            cliff = 500;
            period = 500;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            expect(await tokenVesting.beneficiary()).to.equal(investor1.address);
            expect(await tokenVesting.start()).to.equal(start);
            expect(await tokenVesting.cliff()).to.equal(start + cliff);
            expect(await tokenVesting.duration()).to.equal(duration);
            expect(await tokenVesting.startPortfolioDeposits()).to.equal(startPortfolioDeposits);
            expect(await tokenVesting.revocable()).to.equal(revocable);
            expect(await tokenVesting.getPercentage()).to.equal(percentage);
            expect(await tokenVesting.period()).to.equal(period);
            expect(await tokenVesting.getPortfolio()).to.equal(portfolio.address);
        });

        it("Should not accept zero address as beneficiary", async function () {
            await expect(factory.createTokenVesting(ZERO, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address))
                .to.revertedWith("TVC-BIZA-01");
        });

        it("Should not accept cliff longer than duration", async function () {
            cliff = 10000
            duration = 1000
            await expect(factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address))
                .to.revertedWith("TVC-CLTD-01");
        });

        it("Should not accept duration less than 5 mins", async function () {
            duration = 200
            await expect(factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address))
                .to.revertedWith("TVC-DISZ-01");
        });

        it("Should not accept a non-zero period less than 5 mins", async function () {
            period = 200;
            await expect(factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address))
                .to.revertedWith("TVC-PISZ-01");
        });

        it("Should not accept final time before current time", async function () {
            start = start - 10000
            duration = 1000
            await expect(factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address))
                .to.revertedWith("TVC-FTBC-01");
        });

        it("Should not accept portfolio deposits beginning after start", async function () {
            startPortfolioDeposits = start + 1000
            await expect(factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address))
                .to.revertedWith("TVC-PDBS-01");
        });

        it("Should not accept an initial percentage greater than 100", async function () {
            percentage = 110
            await expect(factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address))
                .to.revertedWith("TVC-PGTZ-01");
        });

        it("Should not accept 0 portfolio address", async function () {
            await expect(factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, ZERO, owner.address))
                .to.revertedWith("TVC-PIZA-01");
        });

        it("Should not accept 0 owner address", async function () {
            await expect(factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, ZERO))
                .to.revertedWith("TVC-OIZA-01");
        });

        it("Should not set 0 portfolio address", async function () {
            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))
            await expect(tokenVesting.setPortfolio(ZERO)).to.revertedWith("TVC-PIZA-02");
        });

    });

    describe("Linear vesting with zero period", function () {

        // TIME PARAMETERS FOR TEST
        // |--------- EPOCH 1------------|---- EPOCH 2---------|------- EPOCH 3----|----- EPOCH 4-----|----- EPOCH 5-----|
        //                           PORTFOLIO
        //  CURRENT TIME --+30,000--> DEPOSIT  ---+20,000---> START --+20,000--> CLIFF --+100,000--> END
        //                            ENABLED
        //                                                 DURATION ----------+120,000-------------> END

        it("Should have correct vestedPercentageAmount, vestedAmount and releasable amounts for different key times", async function () {
            const delay = 50000;
            start = start + delay;
            const rewind = 20000;
            startPortfolioDeposits = start - rewind;
            cliff = 20000;
            duration = 120000;
            percentage = 15;
            //const dt = Utils.fromUtf8("DEG");
            let released;
            let vestedAmount;
            let vestedPercentageAmount;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(amount);

            await f.addToken(portfolio, portfolioSub, testToken, 0.5, 0, false, 0);
            //await f.addToken(portfolio, portfolioSub, testToken, 0.5, 0, false);
            // await portfolio.addToken(dt, testToken.address, srcChainListOrgId, await testToken.decimals(),  '0', ethers.utils.parseUnits('0.5',token_decimals), false);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // R:0, VA:0, VP:0 |  EPOCH 1: BEFORE ANYBODY CAN INTERACT WITH VESTING CONTRACT
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(0);

            // R:0, VA:0, VP:150 |  EPOCH 2: AT THE BEGINNING OF THE  EPOCH WHEN PORTFOLIO DEPOSITS ARE ENABLED
            await ethers.provider.send("evm_increaseTime", [30000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |  EPOCH 2: HALF WAY INTO THE  EPOCH WHERE PORTFOLIO DEPOSITS ARE ENABLED
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |   EPOCH 3: AT THE BEGINNG OF START
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |  EPOCH 3: BETWEEN START AND CLIFF
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150  |  EPOCH 4: AT THE BEGINNING OF CLIFF
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:340, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END
            await ethers.provider.send("evm_increaseTime", [40000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*(now-currentTime-cliff-delay)/(duration-cliff)).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:510, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END
            await ethers.provider.send("evm_increaseTime", [20000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*(now-currentTime-cliff-delay)/(duration-cliff)).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:850, VP:150  |  EPOCH 5: AT THE END
            await ethers.provider.send("evm_increaseTime", [40000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*(now-currentTime-cliff-delay)/(duration-cliff)).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:850, VP:150  |  EPOCH 5: BEYOND THE END
            await ethers.provider.send("evm_increaseTime", [50000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(850);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);
        });

        it("Should not release vested tokens before start", async function () {
            await factory.createTokenVesting(beneficiary, start+100000, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);

            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TVC-TEAR-01");
        });

        it("Should not release vested tokens if nothing is due", async function () {
            cliff = 10000
            duration = 100000

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);

            // some time after cliff
            await ethers.provider.send("evm_increaseTime", [cliff * 2]);
            await ethers.provider.send("evm_mine", [])
            // release first
            await tokenVesting.connect(investor1).release(testToken.address);
            // now nothing to release
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TVC-NTAD-01");
        });

        it("Should release initial percentage only when auction deposits are enabled", async function () {
            start = start + 5000;
            startPortfolioDeposits = start - 3000;
            cliff = 5000;
            duration = 120000;
            // const dt = Utils.fromUtf8("DEG");

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            // await portfolio.addToken(testTokenBytes32, testToken.address, srcChainListOrgId, token_decimals
            //     , 0, Utils.parseUnits('0.00000000000000001', token_decimals), false);
                await f.addToken(portfolio, portfolioSub, testToken, 0.00000000000000001, 0, false, 0);
            //await f.addToken(portfolio, portfolioSub, testToken, 0.01, 0, false);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // some time before auction
            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine", []);

            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await expect(tokenVesting.connect(investor1).releaseToPortfolio(testToken.address)).to.revertedWith("TVC-OPDA-01");
        });

        it("Should release initial percentage only when auction deposits are enabled", async function () {
            start = start + 5000;
            startPortfolioDeposits = start - 3000;
            cliff = 5000;
            duration = 120000;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            await f.addToken(portfolio, portfolioSub, testToken, 0.00000000000000001, 0,false);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // some time during auction
            await ethers.provider.send("evm_increaseTime", [3000]);
            await ethers.provider.send("evm_mine", []);
            expect((await portfolio.getTokenDetails(Utils.fromUtf8("DEG"))).auctionMode).to.be.equal(0);
            //expect(await portfolio.getMinDepositAmount(Utils.fromUtf8("DEG"))).to.be.equal(Utils.toWei('0.019'))
            // release once
            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await tokenVesting.connect(investor1).releaseToPortfolio(testToken.address);

            // now nothing to release from initial percentage
            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await expect(tokenVesting.connect(investor1).releaseToPortfolio(testToken.address)).to.revertedWith("TVC-NTAD-02");
        });

        it("Should release vested tokens when duration has passed", async function () {
            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(amount);

            // all vested but nothing released: R:0, VA:900, VP:100
            await ethers.provider.send("evm_increaseTime", [50000 + duration]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // all vested all released: R:1000, VA:900, VP:100
            await tokenVesting.connect(investor1).release(testToken.address);
            const releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(amount);
            expect(await tokenVesting.released(testToken.address)).to.equal(amount);
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
        });

        it("Should release partially vested tokens when cliff has passed", async function () {
            cliff = 60000;
            duration = 120000;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            // only initial percentage vested, nothing released: R:0, VA:0, VP:100
            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);
            expect(await tokenVesting.released(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            await tokenVesting.connect(investor1).release(testToken.address);

            // only initial percentage vested, initial percentage released: R:100, VA:0, VP:100
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(100);
            expect(await tokenVesting.released(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // initial percentage vested, half of remaining vested, only initial percentage released: R:100, VA:450, VP:100
            await ethers.provider.send("evm_increaseTime", [cliff/2]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            expect(await testToken.balanceOf(investor1.address)).to.equal(100);
            expect(await tokenVesting.released(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(450);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);

            await tokenVesting.connect(investor1).release(testToken.address);

            // initial percentage vested, half of remaining vested, both released: R:550, VA:450, VP:100
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(550);
            expect(await tokenVesting.released(testToken.address)).to.equal(550);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(450);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // initial percentage vested, all remaining vested, initial and half released: R:550, VA:900, VP:100
            await ethers.provider.send("evm_increaseTime", [cliff / 2]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(550);
            expect(await tokenVesting.released(testToken.address)).to.equal(550);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(900);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            await tokenVesting.connect(investor1).release(testToken.address);

            // initial percentage vested, all remaining vested, all released: R:1000, VA:900, VP:100
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(1000);
            expect(await tokenVesting.released(testToken.address)).to.equal(1000);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(900);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // no balance on the contract
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TVC-NBOC-01");

            // initial percentage vested, all remaining vested, all released: R:1000, VA:900, VP:100
            await ethers.provider.send("evm_increaseTime", [cliff / 2]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(1000);
            expect(await tokenVesting.released(testToken.address)).to.equal(1000);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(900);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // no balance on the contract
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TVC-NBOC-01");
        });

        it('Should not release if contract has no balance', async function () {
            cliff = 60000;
            duration = 120000;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);
            expect(await tokenVesting.released(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(0);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // no balance on the contract, nothing deposited, yet
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.be.revertedWith('TVC-NBOC-01');
        });

        it('Should only release initial percentage amount before cliff', async function () {
            cliff = 60000;
            duration = 120000;

            const customPercentage = 20;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, customPercentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            expect(await testToken.balanceOf(tokenVesting.address)).to.equal(1000);

            await expect(tokenVesting.connect(investor1).release(testToken.address))
                .to.emit(tokenVesting, "TokensReleased")
                .withArgs(testToken.address, 200);

            // until cliff only releasable amount is the initial percentage amount
            now = await f.latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(200);
            expect(await tokenVesting.released(testToken.address)).to.equal(200);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(200);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
        });

        it('Should be revoked by owner if revocable is set', async function () {
            const { other1 } = await f.getAccounts();

            cliff = 60000;
            duration = 120000;

            const customPercentage = 20;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, customPercentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            expect(await testToken.balanceOf(tokenVesting.address)).to.equal(1000);

            // until cliff only releasable amount is the initial percentage amount
            now = await f.latestTime();
            const ownerBalance1 = await testToken.balanceOf(owner.address);
            let investor1Balance = await testToken.balanceOf(investor1.address);
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);
            expect(await tokenVesting.released(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(200);
            console.log(`Time: ${now-currentTime} | Owner Balance: ${ownerBalance1} | Investor Balance: ${investor1Balance} ` +
                        `| Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            await ethers.provider.send("evm_increaseTime", [1.5*cliff]);
            await ethers.provider.send("evm_mine", []);

            // fail for non owner
            await expect(tokenVesting.connect(other1).revoke(testToken.address)).to.be.revertedWith("Ownable:");

            // succeed for owner
            await expect(tokenVesting.revoke(testToken.address))
                .to.emit(tokenVesting, "TokenVestingRevoked")
                .withArgs(testToken.address);

            expect(await tokenVesting.revoked(testToken.address)).to.be.true;

            // releasable amount is the initial percentage amount + 50% remaining, revokes remaining to owner
            // investor should have 200 from initial percentage amount and 400 from vesting
            // owner will get 400
            now = await f.latestTime();
            let ownerBalance2 = await testToken.balanceOf(owner.address);
            investor1Balance = await testToken.balanceOf(investor1.address);
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(ownerBalance2.sub(ownerBalance1)).to.equal(400);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);
            expect(await tokenVesting.released(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(400);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(200);
            console.log(`Time: ${now-currentTime} | Owner Balance: ${ownerBalance2} | Investor Balance: ${investor1Balance} ` +
                        `| Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            await tokenVesting.connect(investor1).release(testToken.address);

            // at this point investor1 has vestedPercentageAmount + 50% remaining that can be claimed
            await ethers.provider.send("evm_increaseTime", [cliff / 4]);
            await ethers.provider.send("evm_mine", []);
            now = await f.latestTime();
            ownerBalance2 = await testToken.balanceOf(owner.address);
            investor1Balance = await testToken.balanceOf(investor1.address);
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(ownerBalance2.sub(ownerBalance1)).to.equal(400);
            expect(await testToken.balanceOf(investor1.address)).to.equal(600);
            expect(await tokenVesting.released(testToken.address)).to.equal(600);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(400);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(200);
            console.log(`Time: ${now-currentTime} | Owner Balance: ${ownerBalance2} | Investor Balance: ${investor1Balance}` +
                        `| Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
        });

        it('Should fail to be revoked by owner if revocable not set', async function () {
            cliff = 60000;
            duration = 120000;
            revocable = false;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(tokenVesting.revoke(testToken.address)).to.be.revertedWith('TVC-CNTR-01');
        });

        it('Should fail to be revoked a second time', async function () {
            cliff = 60000;
            duration = 120000;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await tokenVesting.revoke(testToken.address);
            await expect(tokenVesting.revoke(testToken.address)).to.be.revertedWith('TVC-TKAR-01');
        });

        it("Should allow only owner to set the portfolio address", async function () {
            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(tokenVesting.connect(investor1).setPortfolio(portfolio.address)).to.be.revertedWith('Ownable: caller is not the owner');

            await tokenVesting.setPortfolio(portfolio.address);
            expect(await tokenVesting.getPortfolio()).to.be.equal(portfolio.address);
        });

        it("Should be able to fund the portfolio", async function () {
            start = start + 5000;
            startPortfolioDeposits = start - 3000;
            cliff = 5000;
            duration = 120000;
            period = 0;


            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            await ethers.provider.send("evm_increaseTime", [2000]);
            await ethers.provider.send("evm_mine", []);

            const canFundPortfolio = await tokenVesting.connect(investor1).canFundPortfolio(investor1.address);
            expect(canFundPortfolio).to.equal(true);

            const canFundWallet = await tokenVesting.connect(investor1).canFundWallet(testToken.address, investor1.address);
            expect(canFundWallet).to.equal(false);


            await f.addToken(portfolio, portfolioSub, testToken, 0.00000000000000001, 0, false, 0);

            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await tokenVesting.connect(investor1).releaseToPortfolio(testToken.address);
            expect(await tokenVesting.released(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);

            expect((await portfolioSub.getBalance(investor1.address, testTokenBytes32))[0]).to.equal(100);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);

            await ethers.provider.send("evm_increaseTime", [15000]);
            await ethers.provider.send("evm_mine", []);

            await tokenVesting.connect(investor1).release(testToken.address);

            expect(await tokenVesting.released(testToken.address)).to.equal(154);
            expect(await tokenVesting.releasedPercentageAmount(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(54);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);

            expect(await testToken.balanceOf(investor1.address)).to.equal(54);
            expect((await portfolioSub.getBalance(investor1.address, testTokenBytes32))[0]).to.equal(100);
        });

        it("Should behave correctly with multiple releaseToPortfolio calls", async function () {
            start = start + 5000;
            startPortfolioDeposits = start - 3000;
            cliff = 5000;
            duration = 120000;
            //const dt = Utils.fromUtf8("DEG");

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await testToken.transfer(tokenVesting.address, 1000);
            await f.addToken(portfolio, portfolioSub, testToken, 0.00000000000000001, 0, false, 0);
            // await portfolio.addToken(testTokenBytes32, testToken.address, 0, token_decimals
            //     , 0, Utils.parseUnits('0.00000000000000001', token_decimals), false);
            //await f.addToken(portfolio, portfolioSub, testToken, 0.001, 0);

            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            await ethers.provider.send("evm_increaseTime", [2000]);
            await ethers.provider.send("evm_mine", []);

            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await tokenVesting.connect(investor1).releaseToPortfolio(testToken.address);

            const releasedPercentageAmount = await tokenVesting.connect(investor1).releasedPercentageAmount(testToken.address);

            await testToken.transfer(tokenVesting.address, 1000);

            expect(await tokenVesting.connect(investor1).releasedPercentageAmount(testToken.address)).to.be.equal(releasedPercentageAmount);

            await ethers.provider.send("evm_increaseTime", [2000]);
            await ethers.provider.send("evm_mine", []);
            await tokenVesting.connect(investor1).releaseToPortfolio(testToken.address);

            expect(await tokenVesting.connect(investor1).releasedPercentageAmount(testToken.address)).to.be.equal(releasedPercentageAmount);
        });

        it("Should release ~50 tokens when cliff has passed", async function () {
            cliff = 5000;
            duration = 100000;
            period = 0;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine", []);

            await tokenVesting.connect(investor1).release(testToken.address);
            let releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(100);
            expect(await tokenVesting.released(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine", []);

            await tokenVesting.connect(investor1).release(testToken.address);
            releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(147);
            expect(await tokenVesting.released(testToken.address)).to.equal(147);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(47);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
        });
    });

    describe("Linear vesting with non-zero period", function () {

        // TIME PARAMETERS FOR TEST
        // |--------- EPOCH 1------------|---- EPOCH 2---------|------- EPOCH 3----|----- EPOCH 4-----|----- EPOCH 5-----|
        //                           PORTFOLIO
        //  CURRENT TIME --+30,000--> DEPOSIT  ---+20,000---> START --+20,000--> CLIFF --+100,000--> END
        //                            ENABLED
        //                                                 DURATION ----------+120,000-------------> END

        it("Should have correct vestedPercentageAmount, vestedAmount and releasable amounts for different key times", async function () {
            const delay = 50000;
            start = start + delay;
            const rewind = 20000;
            startPortfolioDeposits = start - rewind;
            cliff = 20000;
            duration = 120000;
            percentage = 15;
            period = 20000;
            // const dt = Utils.fromUtf8("DEG");
            let released;
            let vestedAmount;
            let vestedPercentageAmount;

            await factory.createTokenVesting(beneficiary, start, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(amount);
            //await f.addToken(portfolio, portfolioSub, testToken, 0.5, 0, false);
            // await portfolio.addToken(testTokenBytes32, testToken.address, 0, token_decimals
            //     , 0, Utils.parseUnits('0.00000000000000001', token_decimals), false);
            await f.addToken(portfolio, portfolioSub, testToken, 0.5, 0, false, 0);
            //await portfolio.addToken(dt, testToken.address, srcChainListOrgId, await testToken.decimals(), '0', ethers.utils.parseUnits('0.5',token_decimals), false);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // R:0, VA:0, VP:0 |  EPOCH 1: BEFORE ANYBODY CAN INTERACT WITH VESTING CONTRACT
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(0);

            // R:0, VA:0, VP:150 |  EPOCH 2: AT THE BEGINNING OF THE  EPOCH WHEN PORTFOLIO DEPOSITS ARE ENABLED
            await ethers.provider.send("evm_increaseTime", [30000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |  EPOCH 2: HALF WAY INTO THE  EPOCH WHERE PORTFOLIO DEPOSITS ARE ENABLED
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |   EPOCH 3: AT THE BEGINNG OF START
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |  EPOCH 3: BETWEEN START AND CLIFF
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150  |  EPOCH 4: AT THE BEGINNING OF CLIFF
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 1
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:170, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 1
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*1/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:170, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 2
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*1/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:340, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 2
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*2/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:340, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 3
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*2/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:510, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 3
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*3/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:510, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 4
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*3/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:680, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 4
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*4/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:680, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 5
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*4/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:850, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 5
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt((amount*(100-percentage)/100*5/5).toString()));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:850, VP:150  |  EPOCH 5: BEYOND THE END
            await ethers.provider.send("evm_increaseTime", [50000]);
            await ethers.provider.send("evm_mine", [])
            now = await f.latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(amount*(100-percentage)/100);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);
        });

        it("Should not release vested tokens before a new period starts", async function () {
            await factory.createTokenVesting(beneficiary, start+100000, cliff, duration, startPortfolioDeposits,
                revocable, percentage, period, portfolio.address, owner.address);
            const count = await factory.count();
            const tokenVesting= TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);

            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TVC-TEAR-01");
        });

    });
});
