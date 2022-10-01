/**
 * The test runner for Dexalot Staking contract
 */

import Utils from './utils';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import type {
    DexalotToken,
    Staking,
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from 'ethers';

describe("Staking", function () {
	let stakingToken: DexalotToken;
	let staking: Staking;
	let owner: SignerWithAddress;
	let investor1: SignerWithAddress;
	let investor2: SignerWithAddress;
	let rewardAmountInStakingContract: BigNumber;
	let rewardRate = 1000;     // initialRate = 1000 for 10% = numerator of 1000/10000
	const duration = 5184000;  // rewardsDuration = 60 days = 60 * 60 * 24 * 60 = 5184000

	async function deployStaking() {
		staking = await f.deployStaking(stakingToken.address, stakingToken.address, rewardRate, duration)
		await staking.deployed();
		rewardAmountInStakingContract = Utils.toWei('50');
		await stakingToken.transfer(staking.address, rewardAmountInStakingContract);
    }

	before(async function () {
        // nothing to be done here
	});

	beforeEach(async function () {
		[owner, investor1, investor2] = await ethers.getSigners();
		stakingToken = await f.deployDexalotToken();
		await stakingToken.deployed();
	});

	describe('Settings', () => {
		it("Should not initialize again after deployment", async function () {
			await deployStaking();
            await expect(staking.initialize(stakingToken.address, stakingToken.address, rewardRate, duration))
                .to.be.revertedWith("Initializable: contract is already initialized");
        });

		it('Should set rewards token on constructor', async () => {
			await deployStaking();
			expect(await staking.rewardsToken()).to.be.equal(stakingToken.address);
		});

		it('Should set staking token on constructor', async () => {
			await deployStaking();
			expect(await staking.stakingToken()).to.be.equal(stakingToken.address);
		});

		it('Should set owner on constructor', async () => {
			await deployStaking();
			expect(await staking.owner()).to.be.equal(owner.address);
		});
	});

	describe('Function permissions', () => {
		it('Should allow only owner address to call pause', async () => {
			await deployStaking();
			await expect(staking.connect(investor1).pause()).to.revertedWith("Ownable: caller is not the owner");
			await expect(staking.connect(investor1).unpause()).to.revertedWith("Ownable: caller is not the owner");
		});

		it('Should allow only owner address to call setRewardRate', async () => {
			await deployStaking();
			await expect(staking.connect(investor1).setRewardRate(10)).to.revertedWith("Ownable: caller is not the owner");
		});

		it('Should allow only owner address to call setRewardsDuration', async () => {
			await deployStaking();
			await expect(staking.connect(investor1).setRewardsDuration(0)).to.revertedWith("Ownable: caller is not the owner");
		});

		it('Should allow only owner address to call pause staking', async () => {
			await deployStaking();
			await expect(staking.connect(investor1).pauseStaking()).to.revertedWith("Ownable: caller is not the owner");
			await expect(staking.connect(investor1).unpauseStaking()).to.revertedWith("Ownable: caller is not the owner");
		});

		it('Should allow only owner address to call recoverFunds', async () => {
			await deployStaking();
			await expect(staking.connect(investor1).recoverFunds()).to.revertedWith("Ownable: caller is not the owner");
		});
	});

	describe('Pausable', async () => {
		beforeEach(async () => {
			await deployStaking();
			await staking.pause();
		});

		it('Should revert calling stake() when paused', async () => {
			const totalToStake = Utils.toWei('10');
			await expect(staking.connect(investor1).stake(totalToStake)).to.revertedWith("Pausable: paused");
		});

		it('Should revert calling unstake() when paused', async () => {
			const totalToStake = Utils.toWei('10');
			await expect(staking.connect(investor1).unstake(totalToStake)).to.revertedWith("Pausable: paused");
		});

		it('Should revert calling claim() when paused', async () => {
			await expect(staking.connect(investor1).claim()).to.revertedWith("Pausable: paused");
		});

		it('Should revert calling stake() when staking paused', async () => {
			const totalToStake = Utils.toWei('10');

			await staking.unpause();
			await staking.pauseStaking();

			await expect(staking.connect(investor1).stake(totalToStake)).to.revertedWith("S-SHBP-01");
		});

		it('Should revert calling restake() when contract or staking paused', async () => {
			// fail contract paused
			await expect(staking.connect(investor1).restake()).to.revertedWith("Pausable: paused");

			await staking.unpause();
			await staking.pauseStaking();

			// fail staking is paused
			await expect(staking.connect(investor1).restake()).to.revertedWith("S-SHBP-02");
		});

		it('Should not revert calling stake() when unpaused', async () => {
			await staking.unpause();

			const totalToStake = Utils.toWei('10');
			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);

			await staking.connect(investor1).stake(totalToStake);

			expect(await stakingToken.balanceOf(staking.address)).to.be.equal(totalToStake.add(rewardAmountInStakingContract));
		});

		it('Should not revert calling stake() when staking unpaused', async () => {
			await staking.unpause();
			await staking.pauseStaking();

			const totalToStake = Utils.toWei('10');
			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);

			await expect(staking.connect(investor1).stake(totalToStake)).to.revertedWith("S-SHBP-01");

			await staking.unpauseStaking();

			await staking.connect(investor1).stake(totalToStake);

			expect(await stakingToken.balanceOf(staking.address)).to.be.equal(totalToStake.add(rewardAmountInStakingContract));
		});
	});

	describe('Handling of rewardPerToken()', () => {
		beforeEach(async () => {
			await deployStaking();
		});

		it('Should return 0', async () => {
			expect(await staking.rewardPerToken()).to.be.eq(0);
		});

		it('Should be > 0', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			expect(await staking.totalStake()).to.be.equal(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400]);
			await ethers.provider.send("evm_mine", []);

			const earned1 = await staking.earned(investor1.address);
			const rpt = await staking.rewardPerToken();
			expect(rpt).to.be.equal(earned1.div(10));
		});

		it('Should not acrrue rewards beyond periodFinish', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake.mul(2));
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400*60]);
			await ethers.provider.send("evm_mine", []);

			const earned1 = await staking.earned(investor1.address);
			const rpt = await staking.rewardPerToken();
			expect(rpt).to.be.equal(earned1.div(10));

			await ethers.provider.send("evm_increaseTime", [86400*60]);
			await ethers.provider.send("evm_mine", []);

			const earned2 = await staking.earned(investor1.address);
			expect(earned1).to.be.equal(earned2);
		});
	});

	describe('Handling of setRewardRate()', () => {
		beforeEach(async () => {
			await deployStaking();
		});

		it('Should not allow rewardRate to be zero', async () => {
			await deployStaking();
			await expect(staking.setRewardRate(0)).to.revertedWith("S-RCNZ-01");
		});

		it('Should set reward rate correctly', async () => {
			await expect(staking.setRewardRate(1000)).to.emit(staking, "RewardRateUpdated").withArgs(1000);
		});
	});

	describe('Handling of setRewardsDuration()', () => {
		beforeEach(async () => {
			await deployStaking();
		});

		it('Should not allow setting the rewards duration before period ends', async () => {
			await expect(staking.setRewardsDuration(180)).to.revertedWith("S-DMBC-01");
		});

		it('Should set rewards duration correctly after period ends', async () => {
			await ethers.provider.send("evm_increaseTime", [86400*60]);
			await ethers.provider.send("evm_mine", []);
			await expect(staking.setRewardsDuration(180)).to.emit(staking, "RewardsDurationUpdated").withArgs(180);
		});
	});

	describe('Handling of stake()', () => {
		beforeEach(async () => {
			await deployStaking();
		});

		it('Should increase staking balance by staking', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);

			expect(await staking.stakeOf(investor1.address)).to.be.equal(0);
			expect(await stakingToken.balanceOf(investor1.address)).to.be.equal(totalToStake);

			await staking.connect(investor1).stake(totalToStake);

			expect(await staking.stakeOf(investor1.address)).to.be.equal(totalToStake);
			expect(await stakingToken.balanceOf(investor1.address)).to.be.equal(0);
		});

		it('Should not allow to stake 0', async () => {
			await expect(staking.stake(0)).to.be.revertedWith("S-CNSZ-01");
		});

		it('Should not allow to stake after period ended', async () => {
			const totalToStake = Utils.toWei('10');

			await ethers.provider.send("evm_increaseTime", [86400*60]);
			await ethers.provider.send("evm_mine", []);

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);

			await expect(staking.connect(investor1).stake(totalToStake)).to.be.revertedWith("S-PHBE-01");
		});
	});

	describe('Handling of unstake()', () => {
		beforeEach(async () => {
			await deployStaking();
		});

		it('Should not allow to unstake if nothing staked', async () => {
			const totalToStake = Utils.toWei('10');
			await expect(staking.unstake(totalToStake)).to.be.revertedWith("");
		});

		it('Should not allow to unstake 0', async () => {
			await expect(staking.unstake(0)).to.be.revertedWith("S-CNWZ-01");
		});

		it('Should not allow to unstake more than staked', async () => {
			const totalToStake = Utils.toWei('10');
			await expect(staking.unstake(totalToStake.add(1))).to.be.revertedWith("S-CNWM-01");
		});

		it('Should increases stake token balance and decreases staking balance', async () => {
			const totalToStake = Utils.toWei('10');
			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			const initialStakingTokenBal = await stakingToken.balanceOf(investor1.address);
			const initialStakeBal = await staking.stakeOf(investor1.address);

			await staking.connect(investor1).unstake(totalToStake);

			const postStakingTokenBal = await stakingToken.balanceOf(investor1.address);
			const postStakeBal = await staking.stakeOf(investor1.address);

			expect(postStakeBal.add(totalToStake)).to.be.equal(initialStakeBal);
			expect(initialStakingTokenBal.add(totalToStake)).to.be.equal(postStakingTokenBal);
		});
	});

	describe('Handling of recoverFunds()', () => {
		beforeEach(async () => {
			await deployStaking();
		});

		it('Should recover funds at the start', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			const beforeRecoveryBalance = await stakingToken.balanceOf(owner.address);
			const beforeStakingBalance = await stakingToken.balanceOf(staking.address);
			const totalStake = await staking.totalStake();

			await staking.recoverFunds();

			const afterRecoveryBalance = await stakingToken.balanceOf(owner.address);
			const afterStakingBalance = await stakingToken.balanceOf(staking.address);

			// no rewards collected at this point
			expect(afterRecoveryBalance).to.be.equal(beforeRecoveryBalance.add(beforeStakingBalance.sub(totalStake)));
			expect(afterStakingBalance).to.be.equal(totalStake);
		});

		it('Should recover funds after rewards accummulated', async () => {
			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 30]);  // 30 days after start
			await ethers.provider.send("evm_mine", []);

			const beforeRecoveryBalance = await stakingToken.balanceOf(owner.address);
			const beforeStakingBalance = await stakingToken.balanceOf(staking.address);
			const totalStake = await staking.totalStake();

			await staking.recoverFunds();

			const afterRecoveryBalance = await stakingToken.balanceOf(owner.address);
			const afterStakingBalance = await stakingToken.balanceOf(staking.address);

			// after rewards collected at 50% of the duration
			expect(afterRecoveryBalance).to.be.equal(beforeRecoveryBalance.add(beforeStakingBalance.sub(totalStake)));
			expect(afterStakingBalance).to.be.equal(totalStake);
		});
	});

	describe('Integration Tests', () => {
		it('Should stake and claim', async () => {
			// set daily 1% reward rate to easily check calculations
			rewardRate = 36500;
			await deployStaking();

			const totalToStake = Utils.toWei('100');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 30]);  // 30 days after start
			await ethers.provider.send("evm_mine", []);

			const rpt = await staking.rewardPerToken();
			expect(rpt.sub(Utils.toWei('0.3')).toNumber()).to.be.lessThan(Utils.toWei('0.0001').toNumber()); // 100 token will earn 0.3 per token with daily 1% adter 30 days
			const earned1 = await staking.earned(investor1.address);
			expect(earned1.sub(Utils.toWei('30')).toNumber()).to.be.lessThan(Utils.toWei('0.0001').toNumber()); // 100 token will earn 30 with daily 1% after 30 days
			expect(rpt).to.be.equal(earned1.div(100));

			const check = rpt.mul(totalToStake).div(Utils.toWei('1'));
			expect(earned1).to.be.equal(check);

			const balanceBeforeGetReward = await stakingToken.balanceOf(investor1.address);
			await staking.connect(investor1).claim();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.above(balanceBeforeGetReward.div(100000).toNumber());
		});

		it('Should stake and restake', async () => {
			// set daily 1% reward rate to easily check calculations
			rewardRate = 36500;
			await deployStaking();

			const totalToStake = Utils.toWei('100');

			// before anything staked restake() has no effect
			expect(await staking.stakeOf(investor1.address)).to.be.equal(0);
			expect(await stakingToken.balanceOf(staking.address)).to.be.equal(Utils.toWei('50'));
			await staking.connect(investor1).restake();
			expect(await staking.stakeOf(investor1.address)).to.be.equal(0);
			expect(await stakingToken.balanceOf(staking.address)).to.be.equal(Utils.toWei('50'));

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 30]);  // 30 days after start
			await ethers.provider.send("evm_mine", []);

			const rpt = await staking.rewardPerToken();
			expect(rpt.sub(Utils.toWei('0.3')).toNumber()).to.be.lessThan(Utils.toWei('0.0001').toNumber()); // 100 token will earn 0.3 per token with daily 1% adter 30 days
			const earned1 = await staking.earned(investor1.address);
			expect(earned1.sub(Utils.toWei('30')).toNumber()).to.be.lessThan(Utils.toWei('0.0001').toNumber()); // 100 token will earn 30 with daily 1% after 30 days
			expect(rpt).to.be.equal(earned1.div(100));

			const check = rpt.mul(totalToStake).div(Utils.toWei('1'));
			expect(earned1).to.be.equal(check);

			const contractBalanceBefore = await stakingToken.balanceOf(staking.address);
			await staking.connect(investor1).restake();
			const staked = await staking.connect(investor1).stakeOf(investor1.address);
			await staking.connect(investor1).exit(staked);
			const contractBalanceAfter = await stakingToken.balanceOf(staking.address);

			expect(await staking.totalStake()).to.be.equal(0);
			expect(await staking.stakeOf(investor1.address)).to.be.equal(0);

			expect(parseFloat(Utils.fromWei(contractBalanceBefore.sub(earned1).sub(totalToStake).sub(contractBalanceAfter)))).to.be.lessThan(0.0001);
		});

		it('Should stake and exit', async () => {
			// set daily 1% reward rate to easily check calculations
			rewardRate = 36500;
			await deployStaking();

			const totalToStake = Utils.toWei('100');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 7]);  // 7 days after start
			await ethers.provider.send("evm_mine", []);

			const rewardsPerToken = await staking.rewardPerToken();
			expect(rewardsPerToken.sub(Utils.toWei('0.07')).toNumber()).to.be.lessThan(Utils.toWei('0.001').toNumber()); // 100 token will earn 0.07 per token with daily 1% adter 7 days

			const rewardsEarned = await staking.earned(investor1.address);
			const check = rewardsPerToken.mul(totalToStake).div(Utils.toWei('1'));
			expect(rewardsEarned).to.be.equal(check);

			const staked = await staking.connect(investor1).stakeOf(investor1.address);
			await staking.connect(investor1).exit(staked);
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward).to.be.above(totalToStake.add(rewardsEarned));
			expect(await staking.earned(investor1.address)).to.be.equal(0);
		});

		// |-------------------------|-------- 7 days ---------|-------- 7 days ---------|
		// |--- Investor#1 stakes ---|--------- Reward --------|--------- Reward --------|
		// |---------------------------------------------------| Investor#2 |-- Reward --|
		it('Should stake and claim - rewardRate: 3.65% annual, 0.01% daily, 7 days staking', async () => {
			// set daily 0.01% reward rate to easily check calculations
			rewardRate = 365;
			await deployStaking();

			const stakeAmount = 100;
			const totalToStake = Utils.toWei(stakeAmount.toString());

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.transfer(investor2.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await stakingToken.connect(investor2).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 7]);
			await ethers.provider.send("evm_mine", []);

			const rewardsPerToken = await staking.rewardPerToken();

			// 100 token will earn 0.0007 per token with daily 0.01% adter 7 days
			// to avoid integer arithmetic errors confirm calculated rewards is between 0.07*0.9990 - 0.07*1.0010 range
			expect(rewardsPerToken.toNumber()).to.be.greaterThanOrEqual(Utils.toWei('0.07').mul(9990).div(1e6).toNumber());
			expect(rewardsPerToken.toNumber()).to.be.lessThanOrEqual(Utils.toWei('0.07').mul(10010).div(1e6).toNumber());

			// to avoid integer arithmetic errors confirm calculated rewards is between 0.0006990% - 0.0007010% range
			expect(rewardsPerToken.mul(stakeAmount).div(10000).toNumber()).to.be.greaterThanOrEqual(totalToStake.mul(6990).div(1e7).div(10000).toNumber());
			expect(rewardsPerToken.mul(stakeAmount).div(10000).toNumber()).to.be.lessThanOrEqual(totalToStake.mul(7010).div(1e7).div(10000).toNumber());
			const rewardsEarned = await staking.earned(investor1.address);
			const check = rewardsPerToken.mul(totalToStake).div(Utils.toWei('1'));
			expect(rewardsEarned).to.be.equal(check);

			const balanceBeforeGetReward = await stakingToken.balanceOf(investor1.address);
			await staking.connect(investor1).claim();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.above(balanceBeforeGetReward.div(100000).toNumber());

			await staking.connect(investor2).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 7]);
			await ethers.provider.send("evm_mine", []);

			const rewardsEarned2 = await staking.earned(investor2.address);
			const rewardsPerToken2 = await staking.rewardPerToken();
			const check2 = rewardsPerToken2.mul(totalToStake).div(Utils.toWei('1')).div(2);
			expect(check2.div(10000).toNumber()).to.be.greaterThanOrEqual(rewardsEarned2.div(10000).toNumber());
		});

		it('Should stake and claim - rewardRate: 100% annual, 1 year staking', async () => {
			// set 100% annual reward rate
			rewardRate = 10000;
			await deployStaking();

			const stakeAmount = 10;
			const totalToStake = Utils.toWei(stakeAmount.toString());

			// let the initial 60 days pass
			await ethers.provider.send("evm_increaseTime", [86400 * 60]);
			await ethers.provider.send("evm_mine", []);

			// start a new 365 day period
			await staking.setRewardsDuration(86400 * 365);

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.transfer(investor2.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await stakingToken.connect(investor2).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);
			await staking.connect(investor2).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 365]);
			await ethers.provider.send("evm_mine", []);

			expect(await staking.rewardRate()).to.be.equal(10000);
			const rewardsPerToken = await staking.rewardPerToken();
			// to avoid integer arithmetic errors confirm calculated rewards is between 99.99% - 100.01% range
			expect(rewardsPerToken.mul(stakeAmount).div(10000).toNumber()).to.be.greaterThanOrEqual(totalToStake.mul(9999).div(10000).div(10000).toNumber());
			expect(rewardsPerToken.mul(stakeAmount).div(10000).toNumber()).to.be.lessThanOrEqual(totalToStake.mul(10001).div(10000).div(10000).toNumber());

			const rewardsEarned = await staking.earned(investor1.address);
			const check = rewardsPerToken.mul(totalToStake).div(Utils.toWei('1'));
			expect(rewardsEarned).to.be.equal(check);

			const balanceBeforeGetReward = await stakingToken.balanceOf(investor1.address);
			await staking.connect(investor1).claim();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.above(balanceBeforeGetReward.div(100000).toNumber());

			const balanceBeforeGetReward2 = await stakingToken.balanceOf(investor2.address);
			await staking.connect(investor2).claim();
			const balanceAfterGetReward2 = await stakingToken.balanceOf(investor2.address);
			expect(balanceAfterGetReward2.div(100000).toNumber()).to.be.above(balanceBeforeGetReward2.div(100000).toNumber());
		});

		it('Should stake and claim - time passed', async () => {
			await deployStaking();

			const totalToStake = Utils.toWei('10');

			await stakingToken.transfer(investor1.address, totalToStake);
			await stakingToken.connect(investor1).approve(staking.address, totalToStake);
			await staking.connect(investor1).stake(totalToStake);

			await ethers.provider.send("evm_increaseTime", [86400 * 59]);
			await ethers.provider.send("evm_mine", []);

			await staking.connect(investor1).claim();

			await ethers.provider.send("evm_increaseTime", [86400]);
			await ethers.provider.send("evm_mine", []);

			const balanceBeforeGetReward = await stakingToken.balanceOf(investor1.address);
			await staking.connect(investor1).claim();
			const balanceAfterGetReward = await stakingToken.balanceOf(investor1.address);

			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.above(balanceBeforeGetReward.div(100000).toNumber());

			await ethers.provider.send("evm_increaseTime", [86400]);
			await ethers.provider.send("evm_mine", []);

			await staking.connect(investor1).claim();
			const balanceAfterLock = await stakingToken.balanceOf(investor1.address);
			expect(balanceAfterGetReward.div(100000).toNumber()).to.be.equal(balanceAfterLock.div(100000).toNumber());
		});
	});
});
