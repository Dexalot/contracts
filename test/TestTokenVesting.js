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
    let portfolioContract;

    let currentTime;
    let beneficiary;
    let start
    let cliff;
    let duration;
    let revocable;
    let percentage;

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
        portfolioContract = portfolio.address;

        currentTime = await latestTime();
        beneficiary = investor1.address;
        start = currentTime;
        cliff = 0;
        duration = 1000;
        revocable = true;
        percentage = 10;
    });

    describe("Vesting", function () {
        it("Assign total supply of tokens to the owner", async function () {
            const balance = await testToken.balanceOf(owner.address);
            expect(await testToken.totalSupply()).to.equal(balance);
        });

        it("Create vesting for an investor", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            expect(await tokenVesting.beneficiary()).to.equal(investor1.address);
            expect(await tokenVesting.start()).to.equal(start);
            expect(await tokenVesting.cliff()).to.equal(start + cliff);
            expect(await tokenVesting.duration()).to.equal(duration);
            expect(await tokenVesting.revocable()).to.equal(revocable);
        });

        it("Should release vested tokens when duration has passed", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            await ethers.provider.send("evm_increaseTime", [currentTime + duration]);
            await ethers.provider.send("evm_mine")

            await tokenVesting.connect(investor1).release(testToken.address);
            const releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(1000);
            expect(await tokenVesting.released(testToken.address)).to.equal(1000);
        });

        it("Should release partially vested tokens when cliff has passed", async function () {
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine")

            await tokenVesting.connect(investor1).release(testToken.address);
            const releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(500);
            expect(await tokenVesting.released(testToken.address)).to.equal(500);
        });

        it('Cannot be released before cliff', async function () {
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await expect(tokenVesting.connect(investor1).release(testToken.address)).to.be.revertedWith('TokenVesting: no tokens are due');
        });

        it('Should be revoked by owner if revocable is set', async function () {
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await tokenVesting.revoke(testToken.address);

            expect(await tokenVesting.revoked(testToken.address)).to.be.true;
        });

        it('Should fail to be revoked by owner if revocable not set', async function () {
            cliff = 60000;
            duration = 120000;
            revocable = false;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await expect(tokenVesting.revoke(testToken.address)).to.be.revertedWith('TokenVesting: cannot revoke');
        });

        it('Should fail to be revoked a second time', async function () {
            cliff = 60000;
            duration = 120000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await tokenVesting.revoke(testToken.address);
            await expect(tokenVesting.revoke(testToken.address)).to.be.revertedWith('TokenVesting: token already revoked');
        });

        it("Should release percentage", async function () {
            cliff = 5000;
            duration = 120000;
            percentage = 15;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
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
            expect(releasedBalance).to.equal(150);
            expect(await tokenVesting.released(testToken.address)).to.equal(150);

            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);
            releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(259);
            expect(await tokenVesting.released(testToken.address)).to.equal(259);
        });

        it("Should be able to set for funding to the portfolio", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            let isFunding = await tokenVesting.isFundingPortfolio(testToken.address);
            expect(isFunding).to.equal(false);

            await tokenVesting.connect(investor1).setFundingPortfolio(testToken.address, true);
            isFunding = await tokenVesting.isFundingPortfolio(testToken.address);
            expect(isFunding).to.equal(true);
        });

        it("Only beneficiery can set for funding to the portfolio", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await expect(tokenVesting.setFundingPortfolio(testToken.address, true)).to.be.revertedWith('Only beneficiary');
        });

        it("Only owner can set the portfolio address", async function () {
            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await expect(tokenVesting.connect(investor1).setPortfolio(testToken.address)).to.be.revertedWith('Ownable: caller is not the owner');

            await tokenVesting.setPortfolio(testToken.address);
            expect(await tokenVesting.getPortfolio()).to.be.equal(testToken.address);
        });

        it("Should be able to fund the portfolio", async function () {
            cliff = 5000;
            duration = 100000;
            let dt = Utils.fromUtf8("ALOT");
            let am = 0; // auction mode OFF

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await tokenVesting.connect(investor1).setFundingPortfolio(testToken.address, true);
            isFunding = await tokenVesting.isFundingPortfolio(testToken.address);
            expect(isFunding).to.equal(true);

            await expect(testToken.transfer(tokenVesting.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(1000);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

            await testToken.connect(investor1).approve(tokenVesting.address, Utils.toWei('1000'));
            await testToken.connect(investor1).approve(portfolioContract, Utils.toWei('1000'));

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(tokenVesting.address, "Dexalot");

            await tokenVesting.connect(investor1).release(testToken.address);
            expect(await tokenVesting.released(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(50);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(50);

            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(100);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);

            expect(await tokenVesting.released(testToken.address)).to.equal(150);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(50);

            expect(await testToken.balanceOf(investor1.address)).to.equal(50);
            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(100);
        });

        it("Check amount 50", async function () {
            cliff = 5000;
            duration = 100000;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
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
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(50);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(50);

            // await tokenVesting.connect(investor1).release(testToken.address);
            // expect(await tokenVesting.released(testToken.address)).to.equal(100);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);
            releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(150);
            expect(await tokenVesting.released(testToken.address)).to.equal(150);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(100);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(50);
        });

        it("Check amount 5", async function () {
            cliff = 86400;
            duration = 604800;
            percentage = 20;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, 12345678))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 12345678);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(12345678);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);
            let releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(2469135);
            expect(await tokenVesting.released(testToken.address)).to.equal(2469135);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(1763729);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(705406);

            // let ves = await tokenVesting.vestedAmount(testToken.address);
            // let per = await tokenVesting.vestedPercentageAmount(testToken.address);
            // let rel = await tokenVesting.released(testToken.address);
            // let able = ves.add(per).sub(rel);
            // console.log(ves.toString());
            // console.log(per.toString());
            // console.log(rel.toString());
            // console.log(able.toString());

            // await tokenVesting.connect(investor1).release(testToken.address);
            // expect(await tokenVesting.released(testToken.address)).to.equal(2469135);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);
            releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(4232824);
            expect(await tokenVesting.released(testToken.address)).to.equal(4232824);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(3527418);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(705406);

            // ves = await tokenVesting.vestedAmount(testToken.address);
            // per = await tokenVesting.vestedPercentageAmount(testToken.address);
            // rel = await tokenVesting.released(testToken.address);
            // able = ves.add(per).sub(rel);
            // console.log(ves.toString());
            // console.log(per.toString());
            // console.log(rel.toString());
            // console.log(able.toString());

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");
            // ves = await tokenVesting.vestedAmount(testToken.address);
            // per = await tokenVesting.vestedPercentageAmount(testToken.address);
            // rel = await tokenVesting.released(testToken.address);
            // able = ves.add(per).sub(rel);
            // console.log(ves.toString());
            // console.log(per.toString());
            // console.log(rel.toString());
            // console.log(able.toString());

        });

        it("Check amount no percentage", async function () {
            cliff = 86400;
            duration = 604800;
            percentage = 10;

            const tokenVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, revocable, percentage, portfolioContract);
            await tokenVesting.deployed();

            await expect(testToken.transfer(tokenVesting.address, 12345678))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 12345678);
            const vestingBalance = await testToken.balanceOf(tokenVesting.address);
            expect(vestingBalance).to.equal(12345678);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);
            let releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(1763729);
            expect(await tokenVesting.released(testToken.address)).to.equal(1763729);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(1763729);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(0);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");

            await tokenVesting.connect(investor1).release(testToken.address);
            releasedBalance = await testToken.balanceOf(investor1.address);
            expect(releasedBalance).to.equal(3527418);
            expect(await tokenVesting.released(testToken.address)).to.equal(3527418);
            expect(await tokenVesting.vestedAmount(testToken.address)).to.equal(3527418);
            expect(await tokenVesting.vestedPercentageAmount(testToken.address)).to.equal(0);

            await ethers.provider.send("evm_increaseTime", [cliff]);
            await ethers.provider.send("evm_mine");
            // let vest = await tokenVesting.vestedAmount(testToken.address);
            // let rel = await tokenVesting.released(testToken.address);

            // console.log(vest.toString());
            // console.log(rel.toString());
        });
    });
});

async function latestTime() {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}
