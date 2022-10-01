/**
 * The test runner for Dexalot Bytes32LinkedListLibrary contract
 */

import Utils from './utils';

import type {
    Bytes32LinkedListLibraryMock,
    Bytes32LinkedListLibraryMock__factory,
} from '../typechain-types'

import { expect } from "chai";
import { ethers } from "hardhat";
import { BytesLike } from 'ethers';

describe("Bytes32LinkedListLibraryMock", function () {
	let Bytes32LinkedListLibraryMock: Bytes32LinkedListLibraryMock__factory;
	let list: Bytes32LinkedListLibraryMock;
	let entries: BytesLike[];

	const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

	before(async function () {
		Bytes32LinkedListLibraryMock = await ethers.getContractFactory("Bytes32LinkedListLibraryMock");
	});

	beforeEach(async function () {
		entries = []
		list = await Bytes32LinkedListLibraryMock.deploy();
		for(let i=0; i<20; i++) {
			entries.push(Utils.fromUtf8(`${i}`));
		}
	});

	describe('Bytes32LinkedListLibraryMock', () => {

		it('Should use listExists() correctly starting from a right leaf', async () => {
			// not initialized and populated: false
			expect(await list.listExists()).to.be.false;

			// insert one element: true = NEXT
			await list.insert(ZERO_BYTES32, entries[0], true);
			expect(await list.listExists()).to.be.true;
			expect(await list.sizeOf()).to.be.equal(1);
		});

		it('Should use listExists() correctly starting from a left leaf', async () => {
			// insert one element: false = PREV
			await list.insert(ZERO_BYTES32, entries[0], false);
			// fail adding zero node
			expect(await list.sizeOf()).to.be.equal(1);
			await list.insert(entries[0], ZERO_BYTES32, false);
			expect(await list.sizeOf()).to.be.equal(1);
			expect(await list.listExists()).to.be.true;
		});

		it('Should use nodeExists() correctly', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			// head node exists: true
			expect(await list.nodeExists(entries[0])).to.be.true;
			// second node is not inserted yet: false
			expect(await list.nodeExists(entries[1])).to.be.false;
			// insert second node: true
			await list.insert(entries[0], entries[1], true);
			expect(await list.nodeExists(entries[1])).to.be.true;
		});

		it('Should use sizeOf() correctly', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			// insert remaining nodes
			for(let i=1; i<20; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			expect(await list.sizeOf()).to.be.equal(entries.length);
		});

		it('Should use getNode() correctly', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			// insert remaining nodes
			for(let i=1; i<20; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			const nodes = await list.getNode(entries[4]);
			expect(nodes[0]).to.be.true;
			expect(nodes[1]).to.be.equal(entries[3]);
			expect(nodes[2]).to.be.equal(entries[5]);
		});

		it('Should use getAdjacent() correctly', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			// insert remaining nodes
			for(let i=1; i<20; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			// direction: true
			const nodesTrue = await list.getAdjacent(entries[8], true);
			expect(nodesTrue[0]).to.be.true;
			expect(nodesTrue[1]).to.be.equal(entries[9]);
			// direction: false
			const nodesFalse = await list.getAdjacent(entries[8], false);
			expect(nodesFalse[0]).to.be.true;
			expect(nodesFalse[1]).to.be.equal(entries[7]);
		});

		it('Should use remove() correctly', async () => {
			// try to remove a zero bytes32 node
			await list.remove(ZERO_BYTES32);

			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			// insert remaining nodes
			for(let i=1; i<20; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			// before removal node exists
			expect(await list.nodeExists(entries[11])).to.be.true;
			expect(await list.sizeOf()).to.be.equal(entries.length);
			// direction: false
			await list.remove(entries[11]);
			expect(await list.nodeExists(entries[11])).to.be.false;
			expect(await list.sizeOf()).to.be.equal(entries.length-1);
		});

		it('Should use push() correctly', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			// insert the rest of first 8 nodes
			for(let i=1; i<4; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			// insert 9th node to the head
			await list.push(entries[4], true);
			const nodes1 = await list.getNode(entries[4]);
			expect(nodes1[0]).to.be.true;
			expect(nodes1[1]).to.be.equal(ZERO_BYTES32);
			expect(nodes1[2]).to.be.equal(entries[0]);
			// insert 10th node to the tail
			await list.push(entries[5], false);
			const nodes2 = await list.getNode(entries[5]);
			expect(nodes2[0]).to.be.true;
			expect(nodes2[1]).to.be.equal(entries[3]);
			expect(nodes2[2]).to.be.equal(ZERO_BYTES32);
		});

		it('Should use push() correctly', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			// insert the rest of first 8 nodes
			for(let i=1; i<8; i++) {
				await list.insert(entries[i-1], entries[i], true);
			}
			// pop head
			expect(await list.nodeExists(entries[0])).to.be.true;
			await list.pop(true)
			expect(await list.nodeExists(entries[0])).to.be.false;
			// pop tails
			expect(await list.nodeExists(entries[7])).to.be.true;
			await list.pop(false)
			expect(await list.nodeExists(entries[7])).to.be.false;
		});

		it('Should return zero string in bytes32 for a non-existent node from getNode()', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			const nodes = await list.getNode(entries[1]);
			expect(nodes[0]).to.be.false;
			expect(nodes[1]).to.be.equal(ZERO_BYTES32);
			expect(nodes[2]).to.be.equal(ZERO_BYTES32);
		});

		it('Should return zero string in bytes32 for a non-existent node from getAdjacent()', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			const nodes = await list.getAdjacent(entries[1], true);
			expect(nodes[0]).to.be.false;
			expect(nodes[1]).to.be.equal(ZERO_BYTES32);
		});

		it('Should return false for a non-existent node from insert()', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			await list.insert(entries[1], entries[2], true);
			expect(await list.nodeExists(entries[0])).to.be.true;
			expect(await list.nodeExists(entries[1])).to.be.false;
			expect(await list.nodeExists(entries[2])).to.be.false;
		});

		it('Should return false for a non-existent node from insert()', async () => {
			// insert head node
			await list.insert(ZERO_BYTES32, entries[0], true);
			await list.insert(entries[0], entries[1], true);
			await list.remove(entries[2]);
			expect(await list.nodeExists(entries[0])).to.be.true;
			expect(await list.nodeExists(entries[1])).to.be.true;
			expect(await list.nodeExists(entries[2])).to.be.false;
		});

	});
});
