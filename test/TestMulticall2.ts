/**
 * The test runner for Multicall2 contract
 */

import Utils from './utils';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import type {
	MockToken,
	Multicall2,
	Multicall2__factory,
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";

const ZEROADDR = "0x0000000000000000000000000000000000000000"

describe("Multicall2", function () {
	let mock: MockToken;
	let Multicall2: Multicall2__factory;
	let multicall2: Multicall2;
	let target: string;
	let owner: SignerWithAddress;
	let admin: SignerWithAddress;
	let minter: SignerWithAddress;
	let alice: SignerWithAddress;
	let bob: SignerWithAddress;

	before(async function () {
		Multicall2 = await ethers.getContractFactory("Multicall2");
		multicall2 = await Multicall2.deploy();
		target = multicall2.address
	});

	beforeEach(async function () {
		const {owner: owner1, admin: admin1, auctionAdmin: auctionAdmin1, trader1: trader1, trader2} = await f.getAccounts();
		owner = owner1;
		admin = admin1;
		minter = auctionAdmin1;
		alice = trader1;
		bob = trader2;

		mock = await f.deployMockToken("MTOK", 18);

		await mock.connect(owner).addAdmin(admin.address);
		await mock.connect(admin).addMinter(minter.address);
		await mock.connect(minter).mint(owner.address, Utils.toWei('100000'));
		await owner.sendTransaction({from: owner.address, to: alice.address, value: Utils.toWei('500')})
		await owner.sendTransaction({from: owner.address, to: bob.address, value: Utils.toWei('500')})
		await mock.connect(owner).transfer(alice.address, Utils.parseUnits('500', 18))
		await mock.connect(owner).transfer(bob.address, Utils.parseUnits('500', 18))
	});

	describe('Multicall2', () => {

		it('Should use getBlockHash() correctly', async () => {
			const cBlockNum = await ethers.provider.getBlockNumber()
			const blockHash = await multicall2.getBlockHash(cBlockNum - 1)
			const block = await ethers.provider.getBlock(cBlockNum - 1);
			expect(blockHash).to.be.equal(block.hash)
		});

		it('Should use getBlockNumber() correctly', async () => {
			const blockNumber = await multicall2.getBlockNumber()
			const blockNum = await ethers.provider.getBlockNumber()
			expect(blockNumber).to.be.equal(blockNum)
		});

		it('Should use getCurrentBlockCoinbase() correctly', async () => {
			const currentBlockCoinbase = await multicall2.getCurrentBlockCoinbase()
			const cBlockNum = await ethers.provider.getBlockNumber()
			const block = await ethers.provider.getBlock(cBlockNum - 1)
			expect(currentBlockCoinbase).to.be.equal(block.miner)
		});

		it('Should use getCurrentBlockDifficulty() correctly', async () => {
			const currentBlockDifficulty = await multicall2.getCurrentBlockDifficulty()
			const cBlockNum = await ethers.provider.getBlockNumber()
			const block = await ethers.provider.getBlock(cBlockNum)
			expect(currentBlockDifficulty).to.be.equal(block.difficulty)
		});

		it('Should use getCurrentBlockGasLimit() correctly', async () => {
			const currentBlockGasLimit = await multicall2.getCurrentBlockGasLimit()
			const cBlockNum = await ethers.provider.getBlockNumber()
			const block = await ethers.provider.getBlock(cBlockNum)
			expect(currentBlockGasLimit).to.be.equal(block.gasLimit)
		});

		it('Should use getCurrentBlockTimestamp() correctly', async () => {
			const currentBlockTimeStamp = await multicall2.getCurrentBlockTimestamp()
			const cBlockNum = await ethers.provider.getBlockNumber()
			const block = await ethers.provider.getBlock(cBlockNum)
			expect(currentBlockTimeStamp).to.be.equal(block.timestamp)
		});

		it('Should use getEthBalance() correctly', async () => {
			const ethBalance1 = await multicall2.getEthBalance(alice.address)
			const ethBalance2 = await ethers.provider.getBalance(alice.address)
			expect(ethBalance1).to.be.equal(ethBalance2)
		});

		it('Should use getLastBlockHash() correctly', async () => {
			const lastBlockHash = await multicall2.getLastBlockHash()
			const cBlockNum = await ethers.provider.getBlockNumber()
			const lblock = await ethers.provider.getBlock(cBlockNum - 1)
			expect(lastBlockHash).to.be.equal(lblock.hash)
		});

		it('Should use aggregate() correctly', async () => {
			const calls = []

			const ABI = []
			const iface = []
			const calldata = []

			ABI.push(["function getBlockNumber()"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getBlockNumber", []))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function getCurrentBlockTimestamp()"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getCurrentBlockTimestamp", []))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function getEthBalance(address)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getEthBalance", [alice.address]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			await multicall2.aggregate(calls)
		});

		it('Should use blockAndAggregate() correctly', async () => {
			const calls = []

			const ABI = []
			const iface = []
			const calldata = []

			ABI.push(["function getBlockNumber()"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getBlockNumber", []))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function getCurrentBlockTimestamp()"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getCurrentBlockTimestamp", []))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function getEthBalance(address)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getEthBalance", [alice.address]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			await multicall2.blockAndAggregate(calls)
		});

		it('Should use tryAggregate() correctly', async () => {
			const calls = []

			const ABI = []
			const iface = []
			const calldata = []

			ABI.push(["function getBlockNumber()"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getBlockNumber", []))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function getEthBalance(address)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getEthBalance", [ZEROADDR]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			await multicall2.tryAggregate(true, calls)
		});


		it('Should use tryBlockAndAggregate() correctly', async () => {
			const calls = []

			const ABI = []
			const iface = []
			const calldata = []

			ABI.push(["function getBlockNumber()"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getBlockNumber", []))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function getEthBalance(address)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getEthBalance", [ZEROADDR]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			await multicall2.tryBlockAndAggregate(false, calls)
		});

		it('Should use tryBlockAndAggregate() with failures correctly', async () => {
			target = mock.address

			const calls = []

			const ABI = []
			const iface = []
			const calldata = []

			ABI.push(["function approve(address,uint256)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("approve", [multicall2.address, Utils.toWei('100')]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function transfer(address,uint256)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("transfer", [alice.address, Utils.toWei('100')]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			await expect(multicall2.tryBlockAndAggregate(true, calls)).to.be.revertedWith("Multicall2 aggregate: call failed")
		});

		it('Should use aggregate() with failures correctly', async () => {
			target = mock.address

			const calls = []

			const ABI = []
			const iface = []
			const calldata = []

			ABI.push(["function approve(address,uint256)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("approve", [multicall2.address, Utils.toWei('100')]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function transfer(address,uint256)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("transfer", [alice.address, Utils.toWei('100')]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			await expect(multicall2.aggregate(calls)).to.be.revertedWith("Multicall aggregate: call failed")
		});

	});
});
