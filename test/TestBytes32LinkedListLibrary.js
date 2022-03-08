const { expect } = require("chai");
const { ethers } = require("hardhat");

const Utils = require('./utils.js');

describe("TestBytes32LinkedListLibrary", function () {
	let TestBytes32LinkedListLibrary
	let list
	let entries

	let zero_str_bytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000"

	before(async function () {
		TestBytes32LinkedListLibrary = await ethers.getContractFactory("TestBytes32LinkedListLibrary");
	});

	beforeEach(async function () {
		entries = []
		list = await TestBytes32LinkedListLibrary.deploy();
		for(let i=0; i<20; i++) {
			entries.push(Utils.fromUtf8(`${i}`))
		}
	});

	describe('TestBytes32LinkedListLibrary', () => {

		it('should use listExists() correctly', async () => {
			// not initialized and populated: false
			expect(await list.listExists()).to.be.equal(false);
			// insert one element: true
			await list.insert(zero_str_bytes32, entries[0], true);
			expect(await list.listExists()).to.be.equal(true);
		});

		it('should use nodeExists() correctly', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			// head node exists: true
			expect(await list.nodeExists(entries[0])).to.be.equal(true);
			// second node is not inserted yet: false
			expect(await list.nodeExists(entries[1])).to.be.equal(false);
			// insert second node: true
			await list.insert(entries[0], entries[1], true);
			expect(await list.nodeExists(entries[1])).to.be.equal(true);
		});

		it('should use sizeOf() correctly', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			// insert remaining nodes
			for(let i=1; i<20; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			expect(await list.sizeOf()).to.be.equal(entries.length);
		});

		it('should use getNode() correctly', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			// insert remaining nodes
			for(let i=1; i<20; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			let nodes = await list.getNode(entries[4]);
			expect(nodes[0]).to.be.equal(true);
			expect(nodes[1]).to.be.equal(entries[3]);
			expect(nodes[2]).to.be.equal(entries[5]);
		});

		it('should use getAdjacent() correctly', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			// insert remaining nodes
			for(let i=1; i<20; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			// direction: true
			let nodesTrue = await list.getAdjacent(entries[8], true);
			expect(nodesTrue[0]).to.be.equal(true);
			expect(nodesTrue[1]).to.be.equal(entries[9]);
			// direction: false
			let nodesFalse = await list.getAdjacent(entries[8], false);
			expect(nodesFalse[0]).to.be.equal(true);
			expect(nodesFalse[1]).to.be.equal(entries[7]);
		});

		it('should use remove() correctly', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			// insert remaining nodes
			for(let i=1; i<20; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			// before removal node exists
			expect(await list.nodeExists(entries[11])).to.be.equal(true);
			expect(await list.sizeOf()).to.be.equal(entries.length);
			// direction: false
			await list.remove(entries[11]);
			expect(await list.nodeExists(entries[11])).to.be.equal(false);
			expect(await list.sizeOf()).to.be.equal(entries.length-1);
		});

		it('should use push() correctly', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			// insert the rest of first 8 nodes
			for(let i=1; i<4; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			// insert 9th node to the head
			await list.push(entries[4], true);
			let nodes1 = await list.getNode(entries[4]);
			expect(nodes1[0]).to.be.equal(true);
			expect(nodes1[1]).to.be.equal(zero_str_bytes32);
			expect(nodes1[2]).to.be.equal(entries[0]);
			// insert 10th node to the tail
			await list.push(entries[5], false);
			let nodes2 = await list.getNode(entries[5]);
			expect(nodes2[0]).to.be.equal(true);
			expect(nodes2[1]).to.be.equal(entries[3]);
			expect(nodes2[2]).to.be.equal(zero_str_bytes32);
		});

		it('should use push() correctly', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			// insert the rest of first 8 nodes
			for(let i=1; i<8; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			// pop head
			expect(await list.nodeExists(entries[0])).to.be.equal(true);
			await list.pop(true)
			expect(await list.nodeExists(entries[0])).to.be.equal(false);
			// pop tails
			expect(await list.nodeExists(entries[7])).to.be.equal(true);
			await list.pop(false)
			expect(await list.nodeExists(entries[7])).to.be.equal(false);
		});

		it('should return zero string in bytes32 for a non-existent node from getNode()', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			let nodes = await list.getNode(entries[1]);
			expect(nodes[0]).to.be.equal(false);
			expect(nodes[1]).to.be.equal(zero_str_bytes32);
			expect(nodes[2]).to.be.equal(zero_str_bytes32);
		});

		it('should return zero string in bytes32 for a non-existent node from getAdjacent()', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			let nodes = await list.getAdjacent(entries[1], true);
			expect(nodes[0]).to.be.equal(false);
			expect(nodes[1]).to.be.equal(zero_str_bytes32);
		});

		it('should return false for a non-existent node from insert()', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			await list.insert(entries[1], entries[2], true);
			expect(await list.nodeExists(entries[0])).to.be.equal(true);
			expect(await list.nodeExists(entries[1])).to.be.equal(false);
			expect(await list.nodeExists(entries[2])).to.be.equal(false);
		});

		it('should return false for a non-existent node from insert()', async () => {
			// insert head node
			await list.insert(zero_str_bytes32, entries[0], true);
			await list.insert(entries[0], entries[1], true);
			await list.remove(entries[2]);
			expect(await list.nodeExists(entries[0])).to.be.equal(true);
			expect(await list.nodeExists(entries[1])).to.be.equal(true);
			expect(await list.nodeExists(entries[2])).to.be.equal(false);
		});

	});
});
