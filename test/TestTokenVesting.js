/**
 * The test runner for Dexalot TokenVesting contract
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const Utils = require('./utils.js');

const ZERO = '0x0000000000000000000000000000000000000000';

describe("TokenVesting", function () {
    let Token;
    let testToken;
    let TokenVesting;
    let Portfolio;
    let portfolio;
    let owner;
    let investor1;

    let currentTime;
    let beneficiary;
    let start;
    let startPortfolioDeposits;
    let cliff;
    let duration;
    let revocable;
    let percentage;
    let amount;

    before(async function () {
        Token = await ethers.getContractFactory("DexalotToken");
        TokenVesting = await ethers.getContractFactory("TokenVesting");
        Portfolio = await ethers.getContractFactory("Portfolio");
    });

    beforeEach(async function () {
        [owner, investor1] = await ethers.getSigners();
        testToken = await Token.deploy();
        await testToken.deployed();
        portfolio = await upgrades.deployProxy(Portfolio);

        currentTime = await latestTime();
        beneficiary = investor1.address;
        start = currentTime;
        startPortfolioDeposits = currentTime - 5000;
        cliff = 0;
        duration = 1000;
        revocable = true;
        percentage = 10;
        period = 0;

        amount = 1000;
    });

    describe("Contract parameters", function () {
        it("Assign total supply of tokens to the owner", async function () {
            const balance = await testToken.balanceOf(owner.address);
            expect(await testToken.totalSupply()).to.equal(balance);
        });

        it("Create vesting for an investor", async function () {
            cliff = 500;
            period = 100;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

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
            await expect(TokenVesting.deploy(ZERO, start, cliff, duration, startPortfolioDeposits,
                                             revocable, percentage, period, portfolio.address))
                        .to.revertedWith("TV-BIZA-01");
        });

        it("Should not accept cliff longer than duration", async function () {
            cliff = 10000
            duration = 1000
            await expect(TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits,
                                             revocable, percentage, period, portfolio.address))
                        .to.revertedWith("TV-CLTD-01");
        });

        it("Should not accept zero duration", async function () {
            duration = 0
            await expect(TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits,
                                             revocable, percentage, period, portfolio.address))
                        .to.revertedWith("TV-DISZ-01");
        });

        it("Should not accept final time before current time", async function () {
            start = start - 10000
            duration = 1000
            await expect(TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits,
                                             revocable, percentage, period, portfolio.address))
                        .to.revertedWith("TV-FTBC-01");
        });

        it("Should not accept portfolio deposits beginning after start", async function () {
            startPortfolioDeposits = start + 1000
            await expect(TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits,
                                             revocable, percentage, period, portfolio.address))
                        .to.revertedWith("TV-PDBS-01");
        });

        it("Should not accept an initial percentage greater than 100", async function () {
            percentage = 110
            await expect(TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits,
                                             revocable, percentage, period, portfolio.address))
                        .to.revertedWith("TV-PGTZ-01");
        });

        it("Should not accept 0 portfolio address", async function () {
            await expect(TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits,
                                             revocable, percentage, period, ZERO))
                        .to.revertedWith("TV-PIZA-01");
        });

        it("Should not set 0 portfolio address", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await expect(tokenVesting.setPortfolio(ZERO)).to.revertedWith("TV-PIZA-02");
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
            let delay = 50000;
            start = start + delay;
            let rewind = 20000;
            startPortfolioDeposits = start - rewind;
            cliff = 20000;
            duration = 120000;
            percentage = 15;
            let now;
            let dt = Utils.fromUtf8("ALOT");
            let am = 0; // auction mode OFF
            let released;
            let vestedAmount;
            let vestedPercentageAmount;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(amount);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // R:0, VA:0, VP:0 |  EPOCH 1: BEFORE ANYBODY CAN INTERACT WITH VESTING CONTRACT
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(0);

            // R:0, VA:0, VP:150 |  EPOCH 2: AT THE BEGINNING OF THE  EPOCH WHEN PORTFOLIO DEPOSITS ARE ENABLED
            await ethers.provider.send("evm_increaseTime", [30000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |  EPOCH 2: HALF WAY INTO THE  EPOCH WHERE PORTFOLIO DEPOSITS ARE ENABLED
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |   EPOCH 3: AT THE BEGINNG OF START
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |  EPOCH 3: BETWEEN START AND CLIFF
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150  |  EPOCH 4: AT THE BEGINNING OF CLIFF
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:340, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END
            await ethers.provider.send("evm_increaseTime", [40000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*(now-currentTime-cliff-delay)/(duration-cliff)));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:510, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END
            await ethers.provider.send("evm_increaseTime", [20000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*(now-currentTime-cliff-delay)/(duration-cliff)));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:850, VP:150  |  EPOCH 5: AT THE END
            await ethers.provider.send("evm_increaseTime", [40000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*(now-currentTime-cliff-delay)/(duration-cliff)));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:850, VP:150  |  EPOCH 5: BEYOND THE END
            await ethers.provider.send("evm_increaseTime", [50000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(850);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);
        });

        it("Should not release vested tokens before start", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start+50000, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);

            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TV-TEAR-01");
        });

        it("Should not release vested tokens if nothing is due", async function () {
            cliff = 10000
            duration = 100000
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);

            // some time after cliff
            await ethers.provider.send("evm_increaseTime", [cliff * 2]);
            await ethers.provider.send("evm_mine")
            // release first
            await tokenVesting.connect(investor1).release(testToken.address);
            // now nothing to release
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TV-NTAD-01");
        });

        it("Should release initial percentage only when auction deposits are enabled", async function () {
            start = start + 5000;
            startPortfolioDeposits = start - 3000;
            cliff = 5000;
            duration = 120000;
            let dt = Utils.fromUtf8("ALOT");
            let am = 0; // auction mode OFF

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // some time before auction
            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine");

            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await expect(tokenVesting.connect(investor1).releaseToPortfolio(testToken.address)).to.revertedWith("TV-OPDA-01");
        });

        it("Should release initial percentage only when auction deposits are enabled", async function () {
            start = start + 5000;
            startPortfolioDeposits = start - 3000;
            cliff = 5000;
            duration = 120000;
            let dt = Utils.fromUtf8("ALOT");
            let am = 0; // auction mode OFF

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // some time during auction
            await ethers.provider.send("evm_increaseTime", [3000]);
            await ethers.provider.send("evm_mine");

            // release once
            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await tokenVesting.connect(investor1).releaseToPortfolio(testToken.address);

            // now nothing to release from initial percentage
            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await expect(tokenVesting.connect(investor1).releaseToPortfolio(testToken.address)).to.revertedWith("TV-NTAD-02");
        });

        it("Should release vested tokens when duration has passed", async function () {
            let now;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(amount);

            // all vested but nothing released: R:0, VA:900, VP:100
            await ethers.provider.send("evm_increaseTime", [50000 + duration]);
            await ethers.provider.send("evm_mine")
            now = await latestTime();
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
            let now;
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            // only initial percentage vested, nothing released: R:0, VA:0, VP:100
            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine")
            now = await latestTime();
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
            now = await latestTime();
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
            await ethers.provider.send("evm_mine")
            now = await latestTime();
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
            now = await latestTime();
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
            await ethers.provider.send("evm_mine")
            now = await latestTime();
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
            now = await latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(1000);
            expect(await tokenVesting.released(testToken.address)).to.equal(1000);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(900);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // no balance on the contract
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TV-NBOC-01");

            // initial percentage vested, all remaining vested, all released: R:1000, VA:900, VP:100
            await ethers.provider.send("evm_increaseTime", [cliff / 2]);
            await ethers.provider.send("evm_mine")
            now = await latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(1000);
            expect(await tokenVesting.released(testToken.address)).to.equal(1000);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(900);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // no balance on the contract
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TV-NBOC-01");
        });

        it('Cannot release if contract has no balance', async function () {
            let now;
            cliff = 60000;
            duration = 120000;

            let tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();


            now = await latestTime();
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);
            expect(await tokenVesting.released(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(0);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            // no balance on the contract, nothing deposited, yet
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.be.revertedWith('TV-NBOC-01');
        });

        it('Can only release initial percentage ampunt before cliff', async function () {
            let now;
            cliff = 60000;
            duration = 120000;

            tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();
            await tokenVesting.setPercentage(20);

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            expect(await testToken.balanceOf(tokenVesting.address)).to.equal(1000);

            await expect(tokenVesting.connect(investor1).release(testToken.address))
                .to.emit(tokenVesting, "TokensReleased")
                .withArgs(testToken.address, 200);

            // until cliff only releasable amount is the initial percentage amount
            now = await latestTime();
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
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();
            tokenVesting.setPercentage(20);

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            expect(await testToken.balanceOf(tokenVesting.address)).to.equal(1000);

            // until cliff only releasable amount is the initial percentage amount
            now = await latestTime();
            ownerBalance1 = await testToken.balanceOf(owner.address);
            investor1Balance = await testToken.balanceOf(investor1.address);
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);
            expect(await tokenVesting.released(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(200);
            console.log(`Time: ${now-currentTime} | Owner Balance: ${ownerBalance1} | Owner Balance: ${investor1Balance} ` +
                        `| Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            await expect(tokenVesting.revoke(testToken.address))
                .to.emit(tokenVesting, "TokenVestingRevoked")
                .withArgs(testToken.address);

            expect(await tokenVesting.revoked(testToken.address)).to.be.true;

            // until cliff only releasable amount is the initial percentage amount, revokes remaining to owner
            now = await latestTime();
            ownerBalance2 = await testToken.balanceOf(owner.address);
            investor1Balance = await testToken.balanceOf(investor1.address);
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(ownerBalance2.sub(ownerBalance1)).to.equal(800);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);
            expect(await tokenVesting.released(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(200);
            console.log(`Time: ${now-currentTime} | Owner Balance: ${ownerBalance2} | Owner Balance: ${investor1Balance} ` +
                        `| Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);

            await tokenVesting.connect(investor1).release(testToken.address);

            // at this point investor1 has vestedPercentageAmount that can be claimed
            await ethers.provider.send("evm_increaseTime", [cliff / 4]);
            await ethers.provider.send("evm_mine");
            now = await latestTime();
            ownerBalance2 = await testToken.balanceOf(owner.address);
            investor1Balance = await testToken.balanceOf(investor1.address);
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            expect(ownerBalance2.sub(ownerBalance1)).to.equal(800);
            expect(await testToken.balanceOf(investor1.address)).to.equal(200);
            expect(await tokenVesting.released(testToken.address)).to.equal(200);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(200);
            console.log(`Time: ${now-currentTime} | Owner Balance: ${ownerBalance2} | Owner Balance: ${investor1Balance}` +
                        `| Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
        });

        it('Should fail to be revoked by owner if revocable not set', async function () {
            cliff = 60000;
            duration = 120000;
            revocable = false;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(tokenVesting.revoke(testToken.address)).to.be.revertedWith('TV-CNTR-01');
        });

        it('Should fail to be revoked a second time', async function () {
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await tokenVesting.revoke(testToken.address);
            await expect(tokenVesting.revoke(testToken.address)).to.be.revertedWith('TV-TKAR-01');
        });

        it('Should be able to reinstate a revoked contact by owner', async function () {
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();
            tokenVesting.setPercentage(20);

            await testToken.transfer(tokenVesting.address, 1000);

            await tokenVesting.revoke(testToken.address);
            expect(await tokenVesting.revoked(testToken.address)).to.be.true;

            await expect(tokenVesting.reinstate(testToken.address))
                .to.emit(tokenVesting, "TokenVestingReinstated")
                .withArgs(testToken.address);
            expect(await tokenVesting.revoked(testToken.address)).to.be.false;
        });

        it('Should not be able to reinstate a contact not revoked', async function () {
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();
            tokenVesting.setPercentage(20);

            await testToken.transfer(tokenVesting.address, 1000);

            expect(await tokenVesting.revoked(testToken.address)).to.be.false;

            await expect(tokenVesting.reinstate(testToken.address)).to.be.revertedWith("TV-TKNR-01");

            expect(await tokenVesting.revoked(testToken.address)).to.be.false;
        });

        it("Only owner can set the portfolio address", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(tokenVesting.connect(investor1).setPortfolio(portfolio.address)).to.be.revertedWith('Ownable: caller is not the owner');

            await tokenVesting.setPortfolio(portfolio.address);
            expect(await tokenVesting.getPortfolio()).to.be.equal(portfolio.address);
        });

        it("Should be able to fund the portfolio", async function () {
            start = start + 5000;
            startPortfolioDeposits = start - 3000;
            cliff = 5000;
            duration = 120000;
            let dt = Utils.fromUtf8("ALOT");
            let am = 0; // auction mode OFF

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            await ethers.provider.send("evm_increaseTime", [2000]);
            await ethers.provider.send("evm_mine");

            let canFundPortfolio = await tokenVesting.connect(investor1).canFundPortfolio(investor1.address);
            expect(canFundPortfolio).to.equal(true);

            let canFundWallet = await tokenVesting.connect(investor1).canFundWallet(testToken.address, investor1.address);
            expect(canFundWallet).to.equal(false);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await tokenVesting.connect(investor1).releaseToPortfolio(testToken.address);
            expect(await tokenVesting.released(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);

            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(100);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);

            await ethers.provider.send("evm_increaseTime", [15000]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);

            expect(await tokenVesting.released(testToken.address)).to.equal(154);
            expect(await tokenVesting.releasedPercentageAmount(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(54);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);

            expect(await testToken.balanceOf(investor1.address)).to.equal(54);
            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(100);
        });

        it("Should multiple releaseToPortfolio behave correctly", async function () {
            start = start + 5000;
            startPortfolioDeposits = start - 3000;
            cliff = 5000;
            duration = 120000;
            let dt = Utils.fromUtf8("ALOT");
            let am = 0; // auction mode OFF

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await testToken.transfer(tokenVesting.address, 1000);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            await ethers.provider.send("evm_increaseTime", [2000]);
            await ethers.provider.send("evm_mine");

            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await tokenVesting.connect(investor1).releaseToPortfolio(testToken.address);

            const releasedPercentageAmount = await tokenVesting.connect(investor1).releasedPercentageAmount(testToken.address);

            await testToken.transfer(tokenVesting.address, 1000);

            expect(await tokenVesting.connect(investor1).releasedPercentageAmount(testToken.address)).to.be.equal(releasedPercentageAmount);

            await ethers.provider.send("evm_increaseTime", [2000]);
            await ethers.provider.send("evm_mine");
            await tokenVesting.connect(investor1).releaseToPortfolio(testToken.address);

            expect(await tokenVesting.connect(investor1).releasedPercentageAmount(testToken.address)).to.be.equal(releasedPercentageAmount);
        });

        it("Release ~50 tokens when cliff has passed", async function () {
            cliff = 5000;
            duration = 100000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);
            let releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(100);
            expect(await tokenVesting.released(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(0);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

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
            let delay = 50000;
            start = start + delay;
            let rewind = 20000;
            startPortfolioDeposits = start - rewind;
            cliff = 20000;
            duration = 120000;
            percentage = 15;
            period = 20000;
            let now;
            let dt = Utils.fromUtf8("ALOT");
            let am = 0; // auction mode OFF
            let released;
            let vestedAmount;
            let vestedPercentageAmount;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(amount);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // R:0, VA:0, VP:0 |  EPOCH 1: BEFORE ANYBODY CAN INTERACT WITH VESTING CONTRACT
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(0);

            // R:0, VA:0, VP:150 |  EPOCH 2: AT THE BEGINNING OF THE  EPOCH WHEN PORTFOLIO DEPOSITS ARE ENABLED
            await ethers.provider.send("evm_increaseTime", [30000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |  EPOCH 2: HALF WAY INTO THE  EPOCH WHERE PORTFOLIO DEPOSITS ARE ENABLED
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |   EPOCH 3: AT THE BEGINNG OF START
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150 |  EPOCH 3: BETWEEN START AND CLIFF
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150  |  EPOCH 4: AT THE BEGINNING OF CLIFF
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:0, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 1
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:170, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 1
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*1/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:170, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 2
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*1/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:340, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 2
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*2/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:340, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 3
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*2/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:510, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 3
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*3/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:510, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 4
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*3/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:680, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 4
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*4/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:680, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - MIDDLE OF PERIOD 5
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*4/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:850, VP:150  |  EPOCH 4: BETWEEN CLIFF AND END - END OF PERIOD 5
            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(parseInt(amount*(100-percentage)/100*5/5));
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);

            // R:0, VA:850, VP:150  |  EPOCH 5: BEYOND THE END
            await ethers.provider.send("evm_increaseTime", [50000]);
            await ethers.provider.send("evm_mine")
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(amount*(100-percentage)/100);
            expect(vestedPercentageAmount).to.be.equal(amount*percentage/100);
        });

        it("Should not release vested tokens before start if period", async function () {
            period = 100;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start+50000, cliff, duration, startPortfolioDeposits, revocable, percentage, period, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);

            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TV-TEAR-01");
        });

    });
});

async function latestTime() {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}
