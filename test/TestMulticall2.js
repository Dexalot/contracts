const { expect } = require("chai");
const { ethers } = require("hardhat");

const Utils = require('./utils.js');

const ZEROADDR = "0x0000000000000000000000000000000000000000"

describe("Multicall2", function () {
	let MockToken
	let mock
	let Multicall2
	let multicall2
	let target

	before(async function () {
		MockToken = await ethers.getContractFactory("MockToken");
		Multicall2 = await ethers.getContractFactory("Multicall2");
		multicall2 = await Multicall2.deploy();
		target = multicall2.address
	});

	beforeEach(async function () {
		[owner, admin, minter, alice, bob] = await ethers.getSigners();
		mock = await MockToken.deploy("Mock Token", "MTOK", 18);
		await mock.connect(owner).addAdmin(admin.address);
		await mock.connect(admin).addMinter(minter.address);
		await mock.connect(minter).mint(owner.address, Utils.toWei('100000'));
		await owner.sendTransaction({from: owner.address, to: alice.address, value: Utils.toWei('500')})
		await owner.sendTransaction({from: owner.address, to: bob.address, value: Utils.toWei('500')})
		await mock.connect(owner).transfer(alice.address, Utils.parseUnits('500', 18))
		await mock.connect(owner).transfer(bob.address, Utils.parseUnits('500', 18))
	});

	describe('Multicall2', () => {

		it('should use getBlockHash() correctly', async () => {
			let cblock = await ethers.provider.getBlock()
			let block = await ethers.provider.getBlock(cblock.number - 1)  // 1 block before the current
			let blockHash = await multicall2.getBlockHash(cblock.number - 1)
			expect(blockHash).to.be.equal(block.hash)
		});

		it('should use getBlockNumber() correctly', async () => {
			let blockNumber = await multicall2.getBlockNumber()
			let block = await ethers.provider.getBlock()
			expect(blockNumber).to.be.equal(block.number)
		});

		it('should use getCurrentBlockCoinbase() correctly', async () => {
			let currentBlockCoinbase = await multicall2.getCurrentBlockCoinbase()
			let block = await ethers.provider.getBlock()
			expect(currentBlockCoinbase).to.be.equal(block.miner)
		});

		it('should use getCurrentBlockDifficulty() correctly', async () => {
			let currentBlockDifficulty = await multicall2.getCurrentBlockDifficulty()
			let block = await ethers.provider.getBlock()
			expect(currentBlockDifficulty).to.be.equal(block.difficulty)
		});

		it('should use getCurrentBlockGasLimit() correctly', async () => {
			let currentBlockGasLimit = await multicall2.getCurrentBlockGasLimit()
			let block = await ethers.provider.getBlock()
			expect(currentBlockGasLimit).to.be.equal(block.gasLimit)
		});

		it('should use getCurrentBlockTimestamp() correctly', async () => {
			let currentBlockTimeStamp = await multicall2.getCurrentBlockTimestamp()
			let block = await ethers.provider.getBlock()
			expect(currentBlockTimeStamp).to.be.equal(block.timestamp)
		});

		it('should use getEthBalance() correctly', async () => {
			let ethBalance1 = await multicall2.getEthBalance(alice.address)
			let ethBalance2 = await ethers.provider.getBalance(alice.address)
			expect(ethBalance1).to.be.equal(ethBalance2)
		});

		it('should use getLastBlockHash() correctly', async () => {
			let lastBlockHash = await multicall2.getLastBlockHash()
			let cblock = await ethers.provider.getBlock()
			let lblock = await ethers.provider.getBlock(cblock.number - 1)
			expect(lastBlockHash).to.be.equal(lblock.hash)
		});

		it('should use aggregate() correctly', async () => {
			let tx

			let calls = []

			let ABI = []
			let iface = []
			let calldata = []

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

			tx = await multicall2.aggregate(calls)
		});

		it('should use blockAndAggregate() correctly', async () => {
			let tx

			let calls = []

			let ABI = []
			let iface = []
			let calldata = []

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

			tx = await multicall2.blockAndAggregate(calls)
		});

		it('should use tryAggregate() correctly', async () => {
			let tx

			let calls = []

			let ABI = []
			let iface = []
			let calldata = []

			ABI.push(["function getBlockNumber()"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getBlockNumber", []))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function getEthBalance(address)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getEthBalance", [ZEROADDR]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			tx = await multicall2.tryAggregate(true, calls)
		});


		it('should use tryBlockAndAggregate() correctly', async () => {
			let tx

			let calls = []

			let ABI = []
			let iface = []
			let calldata = []

			ABI.push(["function getBlockNumber()"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getBlockNumber", []))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function getEthBalance(address)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("getEthBalance", [ZEROADDR]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			tx = await multicall2.tryBlockAndAggregate(false, calls)
		});

		it('should use tryBlockAndAggregate() with failures correctly', async () => {
			let tx

			target = mock.address

			let calls = []

			let ABI = []
			let iface = []
			let calldata = []

			ABI.push(["function approve(address,uint256)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("approve", [multicall2.address, Utils.toWei('100')]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			ABI.push(["function transfer(address,uint256)"]);
			iface.push(new ethers.utils.Interface(ABI[ABI.length-1]));
			calldata.push(iface[ABI.length-1].encodeFunctionData("transfer", [alice.address, Utils.toWei('100')]))
			calls.push({"target": target, "callData": calldata[ABI.length-1]})

			tx = await expect(multicall2.tryBlockAndAggregate(true, calls)).to.be.revertedWith("Multicall2 aggregate: call failed")
		});

		it('should use aggregate() with failures correctly', async () => {
			let tx

			target = mock.address

			let calls = []

			let ABI = []
			let iface = []
			let calldata = []

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
