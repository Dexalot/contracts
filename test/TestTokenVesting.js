const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const Utils = require('./utils.js');

describe("TokenVesting", function () {
    let Token;
    let testToken;
    let TokenVesting;
    let Portfolio;
    let portfolio;
    let owner;
    let investor1;
    let investor2;

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
        [owner, investor1, investor2] = await ethers.getSigners();
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

        amount = 1000;
    });

    describe("Vesting", function () {
        it("Assign total supply of tokens to the owner", async function () {
            const balance = await testToken.balanceOf(owner.address);
            expect(await testToken.totalSupply()).to.equal(balance);
        });

        it("Create vesting for an investor", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
            await tokenVesting.deployed();

            expect(await tokenVesting.beneficiary()).to.equal(investor1.address);
            expect(await tokenVesting.start()).to.equal(start);
            expect(await tokenVesting.cliff()).to.equal(start + cliff);
            expect(await tokenVesting.duration()).to.equal(duration);
            expect(await tokenVesting.revocable()).to.equal(revocable);
        });

        // TIME PARAMETERS FOR TEST
        // |---------PERIOD 1------------|----PERIOD 2---------|-------PERIOD 3----|-----PERIOD 4-----|-----PERIOD 5-----|
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

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, amount))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, amount);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(amount);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            // R:0, VA:0, VP:0 | PERIOD 1: BEFORE ANYBODY CAN INTERACT WITH VESTING CONTRACT
            now = await latestTime()
            released = await tokenVesting.released(testToken.address);
            vestedAmount = await tokenVesting.vestedAmount(testToken.address);
            vestedPercentageAmount = await tokenVesting.vestedPercentageAmount(testToken.address);
            console.log(`Time: ${now-currentTime} | Released: ${released} | vestedAmount ${vestedAmount} | vestedPercentageAmount: ${vestedPercentageAmount}`);
            expect(released).to.be.equal(0);
            expect(vestedAmount).to.be.equal(0);
            expect(vestedPercentageAmount).to.be.equal(0);

            // R:0, VA:0, VP:150 | PERIOD 2: AT THE BEGINNING OF THE PERIOD WHEN PORTFOLIO DEPOSITS ARE ENABLED
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

            // R:0, VA:0, VP:150 | PERIOD 2: HALF WAY INTO THE PERIOD WHERE PORTFOLIO DEPOSITS ARE ENABLED
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

            // R:0, VA:0, VP:150 |  PERIOD 3: AT THE BEGINNG OF START
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

            // R:0, VA:0, VP:150 | PERIOD 3: BETWEEN START AND CLIFF
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

            // R:0, VA:0, VP:150  | PERIOD 4: AT THE BEGINNING OF CLIFF
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

            // R:0, VA:340, VP:150  | PERIOD 4: BETWEEN CLIFF AND END
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

            // R:0, VA:510, VP:150  | PERIOD 4: BETWEEN CLIFF AND END
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

            // R:0, VA:850, VP:150  | PERIOD 5: AT THE END
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

            // R:0, VA:850, VP:150  | PERIOD 5: BEYOND THE END
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

        it("Should release vested tokens when duration has passed", async function () {
            let now;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
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

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
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
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TokenVesting: no balance on the contract");

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
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.revertedWith("TokenVesting: no balance on the contract");
        });

        it('Cannot release if contract has no balance', async function () {
            let now;
            cliff = 60000;
            duration = 120000;

            let tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
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
            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.be.revertedWith('TokenVesting: no balance on the contract');
        });

        it('Cannot be released before cliff', async function () {
            let now;
            cliff = 60000;
            duration = 120000;

            tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
            await tokenVesting.deployed();
            await tokenVesting.setPercentage(20);

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            expect(await testToken.balanceOf(tokenVesting.address)).to.equal(1000);

            //await expect(tokenVesting.connect(investor1).release(testToken.address)).to.be.revertedWith('TokenVesting: there is still time to cliff');
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

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
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

            await tokenVesting.revoke(testToken.address);

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

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
            await tokenVesting.deployed();

            await expect(tokenVesting.revoke(testToken.address)).to.be.revertedWith('TokenVesting: cannot revoke');
        });

        it('Should fail to be revoked a second time', async function () {
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
            await tokenVesting.deployed();

            await tokenVesting.revoke(testToken.address);
            await expect(tokenVesting.revoke(testToken.address)).to.be.revertedWith('TokenVesting: token already revoked');
        });

        it("Only owner can set the portfolio address", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
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

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
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
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(54);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(100);

            expect(await testToken.balanceOf(investor1.address)).to.equal(54);
            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(100);
        });

        it("Release ~50 tokens when cliff has passed", async function () {
            cliff = 5000;
            duration = 100000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
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
});

async function latestTime() {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}
