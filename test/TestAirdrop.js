/**
 * The test runner for Dexalot Airdrops contract
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256');

const Utils = require('./utils.js');

describe("Airdrop", function () {
    let Token;
    let testToken;
    let Airdrop;
    let airdropContract;
    let owner;
    let investor1;

    let merkleTree;
    let root;
    let userBalanceAndHashes = [];
    let userBalanceHashes = [];

    let snapshot = [
        { "address": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "amount": "100" },
        { "address": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "amount": "100" },
        { "address": "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", "amount": "100" },
        { "address": "0x90f79bf6eb2c4f870365e785982e1f101e93b906", "amount": "100" }
    ];

    before(async function () {
        Token = await ethers.getContractFactory("DexalotToken");
        Airdrop = await ethers.getContractFactory("Airdrop");
    });

    beforeEach(async function () {
        [owner, investor1] = await ethers.getSigners();
        testToken = await Token.deploy();
        await testToken.deployed();


        userBalanceAndHashes = [];
        userBalanceHashes = [];

        snapshot.forEach((item, index) => {
            let hash = ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [index, item.address, item.amount]);
            let balance = {
                address: item.address,
                balance: item.amount,
                index: index,
            };

            userBalanceHashes.push(hash);
            userBalanceAndHashes.push(balance);
        });

        merkleTree = new MerkleTree(userBalanceHashes, keccak256, {
            sortLeaves: true,
            sortPairs: true,
        });
        root = merkleTree.getHexRoot();

        airdropContract = await Airdrop.deploy(testToken.address, root);
        expect(await airdropContract.root()).to.be.equal(root);
    });

    describe("Airdrop", function () {
        it("User can claim rewards", async function () {
            await expect(testToken.transfer(airdropContract.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdropContract.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdropContract.address);
            expect(airdropBalance).to.be.equal(1000);

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            let canClaim = await airdropContract.canClaim(1);
            expect(canClaim).to.be.true;

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(userItem.balance);

            canClaim = await airdropContract.canClaim(1);
            expect(canClaim).to.be.false;
        });

        it("User can claim rewards but contract does not have enough tokens", async function () {
            await expect(testToken.transfer(airdropContract.address, 10))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdropContract.address, 10);
            const airdropBalance = await testToken.balanceOf(airdropContract.address);
            expect(airdropBalance).to.be.equal(10);

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            let canClaim = await airdropContract.canClaim(1);
            expect(canClaim).to.be.true;

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof))
                .to.revertedWith("Contract doesnt have enough tokens");
        });

        it("User can not claim rewards for twice", async function () {
            await expect(testToken.transfer(airdropContract.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdropContract.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdropContract.address);
            expect(airdropBalance).to.be.equal(1000);

            var userItem = userBalanceAndHashes[1];
            var leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await airdropContract.connect(investor1).claim(1, userItem.balance, proof);

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(userItem.balance);

            let canClaim = await airdropContract.canClaim(1);
            expect(canClaim).to.be.false;
            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof)).to.be.revertedWith('Tokens have already been claimed');
        });

        it("User can not claim rewards with invalid merkle proof", async function () {
            await expect(testToken.transfer(airdropContract.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdropContract.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdropContract.address);
            expect(airdropBalance).to.be.equal(1000);

            var userItem = userBalanceAndHashes[1];
            var leaf = userBalanceHashes[0]; // SET WRONG LEAF
            let proof = merkleTree.getHexProof(leaf);

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof)).to.be.revertedWith('Merkle Proof is not valid');

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(0);
        });

        it("Should pause from the admin account", async function () {
            // fail from non admin accounts
            await expect(airdropContract.connect(investor1).pause()).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await airdropContract.connect(owner).pause();
            expect(await airdropContract.paused()).to.be.equal(true);
        });

        it("Should unpause from the admin account", async function () {
            // pause first
            await airdropContract.connect(owner).pause();
            expect(await airdropContract.paused()).to.be.equal(true);
            // fail from non admin accounts
            await expect(airdropContract.connect(investor1).unpause()).to.revertedWith("Ownable: caller is not the owner");
            // succeed from admin accounts
            await airdropContract.connect(owner).unpause();
            expect(await airdropContract.paused()).to.be.equal(false);
        });

        it("Should retrieve remaining funds from the contract", async function () {
            await expect(testToken.transfer(airdropContract.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdropContract.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdropContract.address);
            expect(airdropBalance).to.be.equal(1000);

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            let canClaim = await airdropContract.canClaim(1);
            expect(canClaim).to.be.true;

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(userItem.balance);

            // 100 claimed there shoudl be 900 remaining
            var bal1 = await testToken.balanceOf(owner.address);
            await airdropContract.retrieveFund();
            var bal2 = await testToken.balanceOf(owner.address);
            expect(bal2.sub(bal1)).to.be.equal(900)
        });

    });
});
