const { expect } = require("chai");
const { ethers } = require("hardhat");

const Utils = require('./utils.js');

describe("Staking", function () {
	let StakingToken;
	// let RewardToken;
	let Staking;
	let stakingToken, rewardToken, staking;
	let owner;
	let investor1;
	let investor2;
	let rewardAmountInStakingContract;

	before(async function () {
		StakingToken = await ethers.getContractFactory("DexalotToken");
		// RewardToken = await ethers.getContractFactory("RewardToken");
		Staking = await ethers.getContractFactory("Staking");
	});

	beforeEach(async function () {
		[owner, investor1, investor2] = await ethers.getSigners();
		stakingToken = await StakingToken.deploy();
		// rewardToken = await RewardToken.deploy();
		await stakingToken.deployed();
		// await rewardToken.deployed();

		// rewardsDuration = 60 days = 60 * 60 * 24 * 60 = 5184000
		staking = await Staking.deploy(stakingToken.address, stakingToken.address, 60 * 60 * 24 * 60);
		await staking.deployed();

		await staking.setRewardRate(100);

		rewardAmountInStakingContract = Utils.toWei('50');
		await stakingToken.transfer(staking.address, rewardAmountInStakingContract);
	});

	describe('Settings', () => {
		it('should set rewards token on constructor', async () => {
			expect(await staking.rewardsToken()).to.be.equal(stakingToken.address);
		});

		it('should set staking token on constructor', async () => {
			expect(await staking.stakingToken()).to.be.equal(stakingToken.address);
		});

		it('should set owner on constructor', async () => {
			expect(await staking.owner()).to.be.equal(owner.address);
		});

		it('rewardRate cannot set to zero', async () => {
			await expect(staking.setRewardRate(0)).to.revertedWith("Staking: RewardRate cannot be zero");
		});
	});

	describe('Function permissions', () => {
		it('only owner address can call pause', async () => {
			await expect(staking.connect(investor1).pause()).to.revertedWith("Ownable: caller is not the owner");
			await expect(staking.connect(investor1).unpause()).to.revertedWith("Ownable: caller is not the owner");
		});

		it('only owner address can call setRewardRate', async () => {
			await expect(staking.connect(investor1).setRewardRate(10)).to.revertedWith("Ownable: caller is not the owner");
		});

		it('only owner address can call setRewardsDuration', async () => {
			await expect(staking.connect(investor1).setRewardsDuration(0)).to.revertedWith("Ownable: caller is not the owner");
		});

		it('only owner address can call pause staking', async () => {
			await expect(staking.connect(investor1).pauseStaking()).to.revertedWith("Ownable: caller is not the owner");
			await expect(staking.connect(investor1).unpauseStaking()).to.revertedWith("Ownable: caller is not the owner");
		});

		it('only owner address can call recoverFunds', async () => {
			await expect(staking.connect(investor1).recoverFunds(investor1.address)).to.revertedWith("Ownable: caller is not the owner");
		});
	});

	describe('Pausable', async () => {
		beforeEach(async () => {
			await staking.pause();
		});

		it('should revert calling stake() when paused', async () => {
			const totalToStake = Utils.toWei('10');
			await expect(staking.connect(investor1).stake(totalToStake)).to.revertedWith("Pausable: paused");
		});

		it('should revert calling withdraw() when paused', async () => {
			const totalToStake = Utils.toWei('10');
			await expect(staking.connect(investor1).withdraw(totalToStake)).to.revertedWith("Pausable: paused");
		});

		it('should revert calling getReward() when paused', async () => {
			await expect(staking.connect(investor1).getReward()).to.revertedWith("Pausable: paused");
		});

		it('should revert calling stake() when staking paused', async () => {
			const totalToStake = Utils.toWei('10');

			await staking.unpause();
			await staking.pauseStaking();

			await expect(staking.connect(investor1).stake(totalToStake)).to.revertedWith("Staking: Staking has been paused");
		});

		it('should not revert calling stake() when unpaused', async () => {
			await staking.unpause();

			const totalToStake = Utils.toWei('10');
			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);

			await staking.connect(investor1).stake(totalToStake);

			expect(await stakingToken.balanceOf(staking.address)).to.be.equal(totalToStake.add(rewardAmountInStakingContract));
		});

		it('should not revert calling stake() when staking unpaused', async () => {
			await staking.unpause();
			await staking.pauseStaking();

			const totalToStake = Utils.toWei('10');
			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);

			await expect(staking.connect(investor1).stake(totalToStake)).to.revertedWith("Staking: Staking has been paused");

			await staking.unpauseStaking();

			await staking.connect(investor1).stake(totalToStake);

			expect(await stakingToken.balanceOf(staking.address)).to.be.equal(totalToStake.add(rewardAmountInStakingContract));
		});
	});

	describe('rewardPerToken()', () => {
		it('should return 0', async () => {
			expect(await staking.rewardPerToken()).to.be.eq(0);
		});

		it('should be > 0', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			expect(await staking.totalSupply()).to.be.equal(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400]);
			await ethers.provider.send("evm_mine");

			const earned1 = await staking.earned(investor1.address);
			const rpt = await staking.rewardPerToken();
			expect(rpt).to.be.equal(earned1.div(10));
		});

		it('should not acrrue rewards beyond periodFinish', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake.mul(2));
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400*60]);
			await ethers.provider.send("evm_mine");

			const earned1 = await staking.earned(investor1.address);
			const rpt = await staking.rewardPerToken();
			expect(rpt).to.be.equal(earned1.div(10));

			await ethers.provider.send("evm_increaseTime", [86400*60]);
			await ethers.provider.send("evm_mine");

			const earned2 = await staking.earned(investor1.address);
    		expect(earned1).to.be.equal(earned2);
		});
	});

	describe('setRewardsDuration()', () => {
		it('cannot set rewards duration before period ends', async () => {
			const revertMsg = "Staking: Previous rewards period must be complete before changing the duration for the new period";
			await expect(staking.setRewardsDuration(180)).to.revertedWith(revertMsg);
		});

		it('sets rewards duration correctly after period ends', async () => {
			await ethers.provider.send("evm_increaseTime", [86400*60]);
			await ethers.provider.send("evm_mine");
			await expect(staking.setRewardsDuration(180)).to.emit(staking, "RewardsDurationUpdated").withArgs(180);
		});
	});

	describe('stake()', () => {
		it('staking increases staking balance', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);

			expect(await staking.balanceOf(investor1.address)).to.be.equal(0);
			expect(await stakingToken.balanceOf(investor1.address)).to.be.equal(totalToStake);

			await staking.connect(investor1).stake(totalToStake);

			expect(await staking.balanceOf(investor1.address)).to.be.equal(totalToStake);
			expect(await stakingToken.balanceOf(investor1.address)).to.be.equal(0);
		});

		it('cannot stake 0', async () => {
			await expect(staking.stake(0)).to.be.revertedWith("Staking: Cannot stake 0");
		});

		it('cannot stake after period ended', async () => {
			const totalToStake = Utils.toWei('10');

			await ethers.provider.send("evm_increaseTime", [86400*60]);
			await ethers.provider.send("evm_mine");

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);

			await expect(staking.connect(investor1).stake(totalToStake)).to.be.revertedWith("Staking: period has been ended");
		});
	});

	describe('withdraw()', () => {
		it('cannot withdraw if nothing staked', async () => {
			const totalToStake = Utils.toWei('10');
			await expect(staking.withdraw(totalToStake)).to.be.revertedWith("");
		});

		it('cannot withdraw 0', async () => {
			await expect(staking.withdraw(0)).to.be.revertedWith("Staking: Cannot withdraw 0");
		});

		it('should increases stake token balance and decreases staking balance', async () => {
			const totalToStake = Utils.toWei('10');
			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			const initialStakingTokenBal = await stakingToken.balanceOf(investor1.address);
			const initialStakeBal = await staking.balanceOf(investor1.address);

			await staking.connect(investor1).withdraw(totalToStake);

			const postStakingTokenBal = await stakingToken.balanceOf(investor1.address);
			const postStakeBal = await staking.balanceOf(investor1.address);

			expect(postStakeBal + totalToStake).to.be.equal(initialStakeBal);
			expect(initialStakingTokenBal + totalToStake).to.be.equal(postStakingTokenBal);
		});
	});

	describe('recoverFunds()', () => {
		it('should recover funds', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			const beforeStakingBalance = await stakingToken.balanceOf(staking.address);

			await staking.recoverFunds(investor2.address);

			const afterRecoveryBalance = await stakingToken.balanceOf(investor2.address);
			const afterStakingBalance = await stakingToken.balanceOf(staking.address);

			expect(afterStakingBalance).to.be.equal(0);
			expect(afterRecoveryBalance).to.be.equal(beforeStakingBalance);
		});
	});

	describe('Integration Tests', () => {
		it('stake and claim', async () => {
			// set daily 1% reward rate to easily check calculations
			const rewardRate = 36500;
			await staking.setRewardRate(rewardRate);

			const totalToStake = Utils.toWei('100');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 30]);  // 30 days after start
			await ethers.provider.send("evm_mine");

			expect(await staking.rewardRate()).to.be.equal(36500);
			const rpt = await staking.rewardPerToken();
			expect(rpt).to.be.equal(Utils.toWei('0.3'));     // 100 token will earn 0.3 per token with daily 1% adter 30 days
			const earned1 = await staking.earned(investor1.address);
			expect(earned1).to.be.equal(Utils.toWei('30'));  // 100 token will earn 30 with daily 1% after 30 days
			expect(rpt).to.be.equal(earned1.div(100));

			const check = rpt.mul(totalToStake).div(Utils.toWei('1'));
			expect(earned1).to.be.equal(check);

			const balanceBeforeGetReward = await stakingToken.balanceOf(investor1.address);
			await staking.connect(investor1).getReward();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.above(balanceBeforeGetReward.div(100000).toNumber());
		});

		it('stake and exit', async () => {
			// set daily 1% reward rate to easily check calculations
			const rewardRate = 36500;
			await staking.setRewardRate(rewardRate);

			const totalToStake = Utils.toWei('100');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 7]);  // 7 days after start
			await ethers.provider.send("evm_mine");

			expect(await staking.rewardRate()).to.be.equal(36500);
			const rewardsPerToken = await staking.rewardPerToken();
			expect(rewardsPerToken).to.be.equal(Utils.toWei('0.07'));     // 100 token will earn 0.07 per token with daily 1% adter 7 days

			const rewardsEarned = await staking.earned(investor1.address);
			const check = rewardsPerToken.mul(totalToStake).div(Utils.toWei('1'));
			expect(rewardsEarned).to.be.equal(check);

			await staking.connect(investor1).exit();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward).to.be.above(totalToStake.add(rewardsEarned));
			expect(await staking.earned(investor1.address)).to.be.equal(0);
		});

		// |-------------------------|-------- 7 days ---------|-------- 7 days ---------|
		// |--- Investor#1 stakes ---|--------- Reward --------|--------- Reward --------|
		// |---------------------------------------------------| Investor#2 |-- Reward --|
		it('stake and claim - rewardRate: 3.65% annual, 0.01% daily, 7 days staking', async () => {
			// set daily 0.01% reward rate to easily check calculations
			const rewardRate = 365;
			await staking.setRewardRate(rewardRate);

			const stakeAmount = 100;
			const totalToStake = Utils.toWei(stakeAmount.toString());

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.transfer(investor2.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await stakingToken.connect(investor2).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 7]);
			await ethers.provider.send("evm_mine");

			const rewardsPerToken = await staking.rewardPerToken();
			expect(rewardsPerToken).to.be.equal(Utils.toWei('0.0007'));     // 100 token will earn 0.0007 per token with daily 0.01% adter 7 days
			// to avoid integer arithmetic errors confirm calculated rewards is between 0.0006999% - 0.0007001% range
			expect(rewardsPerToken.mul(stakeAmount).div(10000).toNumber()).to.be.greaterThanOrEqual(totalToStake.mul(6999).div(1e7).div(10000).toNumber());
			expect(rewardsPerToken.mul(stakeAmount).div(10000).toNumber()).to.be.lessThanOrEqual(totalToStake.mul(7001).div(1e7).div(10000).toNumber());

			const rewardsEarned = await staking.earned(investor1.address);
			const check = rewardsPerToken.mul(totalToStake).div(Utils.toWei('1'));
			expect(rewardsEarned).to.be.equal(check);

			const balanceBeforeGetReward = await stakingToken.balanceOf(investor1.address);
			await staking.connect(investor1).getReward();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.above(balanceBeforeGetReward.div(100000).toNumber());

			await staking.connect(investor2).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 7]);
			await ethers.provider.send("evm_mine");

			const rewardsEarned2 = await staking.earned(investor2.address);
			const rewardsPerToken2 = await staking.rewardPerToken();
			const check2 = rewardsPerToken2.mul(totalToStake).div(Utils.toWei('1')).div(2);
			expect(check2.div(10000).toNumber()).to.be.greaterThanOrEqual(rewardsEarned2.div(10000).toNumber());
		});

		it('stake and claim - rewardRate: 100% annual, 1 year staking', async () => {
			// set 100% annual reward rate
			const rewardRate = 10000;
			await staking.setRewardRate(rewardRate);

			const stakeAmount = 10;
			const totalToStake = Utils.toWei(stakeAmount.toString());

			// let the initial 60 days pass
			await ethers.provider.send("evm_increaseTime", [86400 * 60]);
			await ethers.provider.send("evm_mine");

			// start a new 365 day period
			await staking.setRewardsDuration(86400 * 365);

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.transfer(investor2.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await stakingToken.connect(investor2).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);
			await staking.connect(investor2).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 365]);
			await ethers.provider.send("evm_mine");

			expect(await staking.rewardRate()).to.be.equal(10000);
			const rewardsPerToken = await staking.rewardPerToken();
			// to avoid integer arithmetic errors confirm calculated rewards is between 99.99% - 100.01% range
			expect(rewardsPerToken.mul(stakeAmount).div(10000).toNumber()).to.be.greaterThanOrEqual(totalToStake.mul(9999).div(10000).div(10000).toNumber());
			expect(rewardsPerToken.mul(stakeAmount).div(10000).toNumber()).to.be.lessThanOrEqual(totalToStake.mul(10001).div(10000).div(10000).toNumber());

			const rewardsEarned = await staking.earned(investor1.address);
			const check = rewardsPerToken.mul(totalToStake).div(Utils.toWei('1'));
			expect(rewardsEarned).to.be.equal(check);

			const balanceBeforeGetReward = await stakingToken.balanceOf(investor1.address);
			await staking.connect(investor1).getReward();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.above(balanceBeforeGetReward.div(100000).toNumber());

			const balanceBeforeGetReward2 = await stakingToken.balanceOf(investor2.address);
			await staking.connect(investor2).getReward();
			const balanceAfterGetReward2 = await stakingToken.balanceOf(investor2.address);
			expect(balanceAfterGetReward2.div(100000).toNumber()).to.be.above(balanceBeforeGetReward2.div(100000).toNumber());
		});

		it('stake and claim - time passed', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 59]);
			await ethers.provider.send("evm_mine");

			await staking.connect(investor1).getReward();

			await ethers.provider.send("evm_increaseTime", [86400]);
			await ethers.provider.send("evm_mine");

			const balanceBeforeGetReward = await stakingToken.balanceOf(investor1.address);
			await staking.connect(investor1).getReward();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.above(balanceBeforeGetReward.div(100000).toNumber());

			await ethers.provider.send("evm_increaseTime", [86400]);
			await ethers.provider.send("evm_mine");

			await staking.connect(investor1).getReward();
			const balanceAfterLock = await stakingToken.balanceOf(investor1.address);
			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.equal(balanceAfterLock.div(100000).toNumber());
		});
	});
});
