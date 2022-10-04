/**
 * The test runner for Dexalot RBTLibrary contract
 */

import { ethers } from "hardhat";

import type {
    RBTLibraryMock,
    RBTLibraryMock__factory,
} from '../typechain-types'

import { expect } from "chai";

describe("RBTLibraryMock", function () {
	let RBTLibraryMock: RBTLibraryMock__factory;
	let tree: RBTLibraryMock;
	let keys: number[];

	before(async function () {
		RBTLibraryMock = await ethers.getContractFactory("RBTLibraryMock") as RBTLibraryMock__factory;
	});

	beforeEach(async function () {
		tree = await RBTLibraryMock.deploy() as RBTLibraryMock;
	});

	describe('RBTLibraryMock', () => {

		it('Should use isEmpty() correctly', async () => {
			expect(await tree.isEmpty(10)).to.be.false;
			expect(await tree.isEmpty(0)).to.be.true;
		});

		it('Should use getEmpty() correctly', async () => {
			expect(await tree.getEmpty()).to.be.equal(0);
		});

		it('Should use exists() correctly', async () => {
			// not initialized and populated: false
			expect(await tree.exists('1')).to.be.false;
			// insert one element: true
			await tree.insert(1, 1);
			expect(await tree.exists(1)).to.be.true;
		});

		it('Should use insert() correctly', async () => {
			for (let i=1; i<21; i++) {
				await tree.insert(i, i);
			}
			for (let i=1; i<21; i++) {
				expect(await tree.exists(i)).to.be.true;
			}
			// empty key
			await expect(tree.insert(0, 0)).to.be.revertedWith("R-KIEM-01");
			// existing key
			await expect(tree.insert(10, 15)).to.be.revertedWith("R-KEXI-01");
		});

		it('Should use remove() correctly', async () => {
			for (let i=1; i<21; i++) {
				await tree.insert(i, i);
			}
			// remove empty key
			await expect(tree.remove(0)).to.be.revertedWith("R-KIEM-02");
			// remove non-existing key
			await expect(tree.remove(25)).to.be.revertedWith("R-KDNE-02");
			// remove existing key
			expect(await tree.exists(15)).to.be.true;
			await tree.remove(15)
			expect(await tree.exists(15)).to.be.false;
			// reinsert 15
			await tree.insert(15, 15);
			for (let i=1; i<21; i++) {
				await tree.remove(i);
			}
			// randomized insertion and removal of a larger tree
			keys = [];
			for (let i=1; i<101; i++) {
				keys.push(i);
			}
			shuffle(keys);
			for (let i=0; i<100; i++) {
				await tree.insert(keys[i], 2*keys[i]);
			}
			shuffle(keys);
			for (let i=0; i<100; i++) {
				await tree.remove(keys[i]);
			}
		});

		it('Should use root() correctly', async () => {
			for (let i=1; i<21; i++) {
				await tree.insert(i, i);
			}
			expect(await tree.root()).to.be.equal(8);
		});

		it('Should use first() correctly', async () => {
			for (let i=1; i<21; i++) {
				await tree.insert(i, i);
			}
			expect(await tree.first()).to.be.equal(1);
		});

		it('Should use last() correctly', async () => {
			for (let i=1; i<21; i++) {
				await tree.insert(i, i);
			}
			expect(await tree.last()).to.be.equal(20);
		});

		it('Should use next() correctly', async () => {
			for (let i=1; i<21; i++) {
				await tree.insert(i, i);
			}
			expect(await tree.next(13)).to.be.equal(14);
			await expect(tree.next(0)).to.be.revertedWith("R-TIEM-01");
		});

		it('Should use prev() correctly', async () => {
			for (let i=1; i<21; i++) {
				await tree.insert(i, i);
			}
			expect(await tree.prev(14)).to.be.equal(13);
			await expect(tree.prev(0)).to.be.revertedWith("R-TIEM-02");
		});

		it('Should use getNode() correctly', async () => {
			for (let i=1; i<21; i++) {
				await tree.insert(i, 2*i);
			}
			// non-existent key = 25
			await expect(tree.getNode(25)).to.be.revertedWith("R-KDNE-01");
			// key = 4
			const node1 = await tree.getNode(4);
			let key = node1[0];
			let parent = node1[1];
			let left = node1[2];
			let right = node1[3];
			let red = node1[4];
			let value = node1[5];
			console.log(`Key: ${key} :: Parent: ${parent} :: Left: ${left} :: Right: ${right} :: Red: ${red} :: Value: ${value}`);
			expect(key).to.be.equal(4);
			expect(parent).to.be.equal(8);
			expect(left).to.be.equal(2);
			expect(right).to.be.equal(6);
			expect(red).to.be.true;
			expect(value).to.be.equal(8);
			// key = 8
			const node2 = await tree.getNode(8);
			key = node2[0];
			parent = node2[1];
			left = node2[2];
			right = node2[3];
			red = node2[4];
			value = node2[5];
			console.log(`Key: ${key} :: Parent: ${parent} :: Left: ${left} :: Right: ${right} :: Red: ${red} :: Value: ${value}`);
			expect(key).to.be.equal(8);
			expect(parent).to.be.equal(0);
			expect(left).to.be.equal(4);
			expect(right).to.be.equal(12);
			expect(red).to.be.false;
			expect(value).to.be.equal(16);
		});

		it('Should give correct tree state after random insert() and root removal', async () => {
			// initializing to a known state: 1, 3, 8, 6, 5, 7, 2, 4
			keys = [1, 3, 8, 6, 5, 7, 2, 4];
			// insert head
			await tree.insert(keys[0], 2*keys[0]);
			// insert rest
			for (let i=1; i<8; i++) {
				await tree.insert(keys[i], 2*keys[i]);
			}
			expect(await tree.root()).to.be.equal(3);
			expect(await tree.first()).to.be.equal(1);
			expect(await tree.last()).to.be.equal(8);
			// check root node details
			const node0 = await tree.getNode(3);
			let key = node0[0];
			let parent = node0[1];
			let left = node0[2];
			let right = node0[3];
			let red = node0[4];
			let value = node0[5];
			console.log(`Key: ${key} :: Parent: ${parent} :: Left: ${left} :: Right: ${right} :: Red: ${red} :: Value: ${value}`);
			expect(key).to.be.equal(3);
			expect(parent).to.be.equal(0);
			expect(left).to.be.equal(1);
			expect(right).to.be.equal(6);
			expect(red).to.be.false;
			expect(value).to.be.equal(6);
			// check left node below root node
			const node1 = await tree.getNode(1);
			key = node1[0];
			parent = node1[1];
			left = node1[2];
			right = node1[3];
			red = node1[4];
			value = node1[5];
			console.log(`Key: ${key} :: Parent: ${parent} :: Left: ${left} :: Right: ${right} :: Red: ${red} :: Value: ${value}`);
			expect(key).to.be.equal(1);
			expect(parent).to.be.equal(3);
			expect(left).to.be.equal(0);
			expect(right).to.be.equal(2);
			expect(red).to.be.false;
			expect(value).to.be.equal(2);
			// check right node below root node
			const node2 = await tree.getNode(6);
			key = node2[0];
			parent = node2[1];
			left = node2[2];
			right = node2[3];
			red = node2[4];
			value = node2[5];
			console.log(`Key: ${key} :: Parent: ${parent} :: Left: ${left} :: Right: ${right} :: Red: ${red} :: Value: ${value}`);
			expect(key).to.be.equal(6);
			expect(parent).to.be.equal(3);
			expect(left).to.be.equal(5);
			expect(right).to.be.equal(8);
			expect(red).to.be.true;
			expect(value).to.be.equal(12);
			// remove root node 3, new root is 4 making a more balanced tree
			await tree.remove(3);
			const node3 = await tree.getNode(await tree.root());
			key = node3[0];
			parent = node3[1];
			left = node3[2];
			right = node3[3];
			red = node3[4];
			value = node3[5];
			console.log(`Key: ${key} :: Parent: ${parent} :: Left: ${left} :: Right: ${right} :: Red: ${red} :: Value: ${value}`);
			expect(key).to.be.equal(4);
			expect(parent).to.be.equal(0);
			expect(left).to.be.equal(1);
			expect(right).to.be.equal(6);
			expect(red).to.be.false;
			expect(value).to.be.equal(8);
		});
	});

});

function shuffle(array: number[]) {
	let currentIndex = array.length, randomIndex;

	// While there remain elements to shuffle...
	while (currentIndex != 0) {
		// Pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex--;

		// And swap it with the current element.
		[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
	}

	return array;
  }
