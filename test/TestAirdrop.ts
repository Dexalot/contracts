/**
 * The test runner for Dexalot Airdrop contract
 */

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import type {
    DexalotToken,
    Airdrop,
    Airdrop__factory,
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BytesLike } from 'ethers';

import MerkleTree from 'merkletreejs';
import keccak256 from 'keccak256';

interface Balance {
    index: number,
    address: string,
    balance: string
}

describe("Airdrop", function () {
    let testToken: DexalotToken;
    let Airdrop: Airdrop__factory;
    let airdrop: Airdrop;
    let owner: SignerWithAddress;
    let investor1: SignerWithAddress;
    let investor2: SignerWithAddress;

    let start: number;
    let cliff: number;
    let duration: number;
    let percentage: number;

    let merkleTree: MerkleTree;
    let currentTime: number;
    let root: BytesLike;
    let userBalances: Balance[];
    let userBalanceHashes: string[];
    let userItem1: Balance;
    let leaf1: string;
    let proof1: string[];
    let userItem2: Balance;
    let leaf2: string;
    let proof2: string[];

    const snapshot = [
        { "address": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "amount": "100" },
        { "address": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "amount": "100" },
        { "address": "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", "amount": "100" },
        { "address": "0x90f79bf6eb2c4f870365e785982e1f101e93b906", "amount": "100" }
    ];

    async function deployAirdrop() {
        airdrop = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

        await expect(testToken.transfer(airdrop.address, 1000))
            .to.emit(testToken, "Transfer")
            .withArgs(owner.address, airdrop.address, 1000);
        const airdropBalance = await testToken.balanceOf(airdrop.address);
        expect(airdropBalance).to.be.equal(1000);
    }

    before(async function () {
        Airdrop = await ethers.getContractFactory("Airdrop");
    });

    beforeEach(async function () {
        const { owner: owner1, admin: trader1, auctionAdmin: trader2 } = await f.getAccounts();
        owner = owner1;
        investor1 = trader1;
        investor2 = trader2;

        testToken = await f.deployDexalotToken();

        currentTime = await f.latestTime();
        start = currentTime;
        cliff = 0;
        duration = 1000;
        percentage = 10;

        userBalances = [];
        userBalanceHashes = [];

        snapshot.forEach((item, index) => {
            const hash = ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [index, item.address, item.amount]);
            const balance: Balance = {
                index: index,
                address: item.address,
                balance: item.amount,
            };

            userBalanceHashes.push(hash);
            userBalances.push(balance);
        });

        merkleTree = new MerkleTree(userBalanceHashes, keccak256, {
            sortLeaves: true,
            sortPairs: true,
        });
        root = merkleTree.getHexRoot();

        userItem1 = userBalances[1];
        leaf1 = userBalanceHashes[1];
        proof1 = merkleTree.getHexProof(leaf1);

        userItem2 = userBalances[2];
        leaf2 = userBalanceHashes[2];
        proof2 = merkleTree.getHexProof(leaf2);
    });

    describe("Settings", function () {
        it("Should be able to be deployed", async function () {
            airdrop = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);
            expect(await airdrop.root()).to.be.equal(root);

            expect(await airdrop.start()).to.equal(start);
            expect(await airdrop.cliff()).to.equal(start + cliff);
            expect(await airdrop.duration()).to.equal(duration);
            expect(await airdrop.getPercentage()).to.equal(percentage);
        });
    });

    describe('Function permissions', () => {
        it('Should be paused and unpaused only by owner', async () => {
            await expect(airdrop.connect(investor1).pause()).to.revertedWith("Ownable:");
            await expect(airdrop.connect(investor1).unpause()).to.revertedWith("Ownable:");
        });

        it('Should send funds to owner via retrieveProjectToken only by owner', async () => {
            await expect(airdrop.connect(investor1).retrieveProjectToken()).to.revertedWith("Ownable:");
        });
    });

    describe('Pausable', async () => {
        beforeEach(async () => {
            await deployAirdrop();
            await airdrop.pause();
        });

        it('Should revert calling claim() when paused', async () => {
            const userItem = userBalances[1];
            const leaf = userBalanceHashes[1];
            const proof = merkleTree.getHexProof(leaf);

            await expect(airdrop.connect(investor1).claim(1, userItem.balance, proof)).to.revertedWith("Pausable: paused");
        });

        it('Should not revert calling claim() when unpaused', async () => {
            await airdrop.unpause();

            const userItem = userBalances[1];
            const leaf = userBalanceHashes[1];
            const proof = merkleTree.getHexProof(leaf);

            await airdrop.connect(investor1).claim(1, userItem.balance, proof);

            const claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);
        });
    });

    describe("Claim", function () {
        it("Should claim rewards", async function () {
            await deployAirdrop();

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.emit(airdrop, "Claimed");

            let claimed = await testToken.balanceOf(userItem1.address);
            expect(claimed).to.be.equal(10);

            let released = await airdrop.released(1);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop.connect(investor1).claim(1, userItem1.balance, proof1))
                .to.emit(airdrop, "Claimed");

            claimed = await testToken.balanceOf(userItem1.address);
            expect(claimed).to.be.equal(55);

            released = await airdrop.released(1);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.emit(airdrop, "Claimed");

            claimed = await testToken.balanceOf(userItem1.address);
            expect(claimed).to.be.equal(100);

            released = await airdrop.released(1);
            expect(released).to.be.equal(claimed);
        });

        it("Should claim rewards for multiple claimers", async function () {
            await deployAirdrop();

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.emit(airdrop, "Claimed");

            await expect(airdrop
                .connect(investor2)
                .claim(2, userItem2.balance, proof2))
                .to.emit(airdrop, "Claimed");

            let claimed = await testToken.balanceOf(userItem1.address);
            let released = await airdrop.released(1);
            expect(claimed).to.be.equal(10);
            expect(released).to.be.equal(claimed);

            claimed = await testToken.balanceOf(userItem2.address);
            released = await airdrop.released(2);
            expect(claimed).to.be.equal(10);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.emit(airdrop, "Claimed");

            await expect(airdrop
                .connect(investor2)
                .claim(2, userItem2.balance, proof2))
                .to.emit(airdrop, "Claimed");

            claimed = await testToken.balanceOf(userItem1.address);
            released = await airdrop.released(1);
            expect(claimed).to.be.equal(55);
            expect(released).to.be.equal(claimed);

            claimed = await testToken.balanceOf(userItem2.address);
            released = await airdrop.released(2);
            expect(claimed).to.be.equal(55);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.emit(airdrop, "Claimed");

            await expect(airdrop
                .connect(investor2)
                .claim(2, userItem2.balance, proof2))
                .to.emit(airdrop, "Claimed");

            claimed = await testToken.balanceOf(userItem1.address);
            released = await airdrop.released(1);
            expect(claimed).to.be.equal(100);
            expect(released).to.be.equal(claimed);

            claimed = await testToken.balanceOf(userItem2.address);
            released = await airdrop.released(2);
            expect(claimed).to.be.equal(100);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.revertedWith("A-NTAD-01");

            await expect(airdrop
                .connect(investor2)
                .claim(2, userItem2.balance, proof2))
                .to.revertedWith("A-NTAD-01");
        });

        it("Should release amount of percentage when vesting started before the cliff", async function () {
            start = start + 10000;
            cliff = 10000;
            duration = 100000;
            percentage = 10;

            await deployAirdrop();

            const userItem = userBalances[1];
            const leaf = userBalanceHashes[1];
            const proof = merkleTree.getHexProof(leaf);

            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop.connect(investor1).claim(1, userItem.balance, proof))
                .to.emit(airdrop, "Claimed");

            const claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);

            const released = await airdrop.released(1);
            expect(released).to.be.equal(claimed);
        });

        it("Should raise error claiming before start", async function () {
            start = start + 10000;

            await deployAirdrop();

            const userItem = userBalances[1];
            const leaf = userBalanceHashes[1];
            const proof = merkleTree.getHexProof(leaf);

            await expect(airdrop.connect(investor1).claim(1, userItem.balance, proof))
                .to.revertedWith("A-TOOE-01");

            const claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(0);

            const released = await airdrop.released(1);
            expect(released).to.be.equal(claimed);
        });

        it("Should fail to claim when Airdrop does not have enough balance", async function () {
            airdrop = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.revertedWith("A-CNET-01");
        });

        it("Should fail to claim before start date", async function () {
            start = start + 10000;
            cliff = 10000;
            duration = 100000;
            percentage = 10;

            await deployAirdrop();

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.revertedWith("A-TOOE-01");
        });

        it("Should allow to claim specified percentage after start", async function () {
            await deployAirdrop();

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.emit(airdrop, "Claimed");

            const claimed = await testToken.balanceOf(userItem1.address);
            expect(claimed).to.be.equal(10);

            const released = await airdrop.released(1);
            expect(released).to.be.equal(claimed);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.revertedWith("A-NTAD-01");
        });

        it("Should not allow to claim with invalid merkle proof1 or leaf values", async function () {
            await deployAirdrop();

            const invalidAmount = 150;

            await expect(airdrop
                .connect(investor1)
                .claim(1, invalidAmount, proof1))
                .to.revertedWith("A-MPNV-01");

            const userItem = userBalances[1];
            const leaf = userBalanceHashes[0]; // SET WRONG LEAF
            const proof = merkleTree.getHexProof(leaf);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.revertedWith("A-MPNV-01");
        });

        it("Should handle releasableAmount", async function () {
            start = start + 1000;
            cliff = 500;
            duration = 1000;
            percentage = 10;

            await deployAirdrop();

            const validAmount = 100;
            const invalidAmount = 150;

            // before start, releasable amount is 0
            expect(await airdrop
                .connect(investor1)
                .releasableAmount(1, validAmount, proof1))
                .to.be.equal(0);

            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine", []);

            // at start, revert with invalid amount
            await expect(airdrop
                .connect(investor1)
                .releasableAmount(1, invalidAmount, proof1))
                .to.revertedWith("A-MPNV-02");

            // at start, releasable amount is just initial percentage
            expect(await airdrop
                .connect(investor1)
                .releasableAmount(1, validAmount, proof1))
                .to.be.equal(10);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine", []);

            // at cliff, releasable amount is still just initial percentage
            expect(await airdrop
                .connect(investor1)
                .releasableAmount(1, validAmount, proof1))
                .to.be.equal(10);

            await ethers.provider.send("evm_increaseTime", [250]);
            await ethers.provider.send("evm_mine", []);

            // at 75% of duration, releasable amount is initial percentage and half of remaining
            expect(await airdrop
                .connect(investor1)
                .releasableAmount(1, validAmount, proof1))
                .to.be.equal(55);

            await ethers.provider.send("evm_increaseTime", [250]);
            await ethers.provider.send("evm_mine", []);

            // at duration, releasable amount is initial percentage and remaining
            expect(await airdrop
                .connect(investor1)
                .releasableAmount(1, validAmount, proof1))
                .to.be.equal(100);

        });

        it("Should not allow to claim more after all tokens are claimed", async function () {
            await deployAirdrop();

            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.emit(airdrop, "Claimed");

            const claimed = await testToken.balanceOf(userItem1.address);
            expect(claimed).to.be.equal(100);

            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem1.balance, proof1))
                .to.revertedWith("A-NTAD-01");
        });
    });

    describe("Should allow to retrieve remaining/excess/accidental tokens", function () {
        it("Should allow owner to retrieve remaining project tokens to own address", async function () {
            await deployAirdrop(); // contract has 1000 wei token

            const beforeRetrieved = await testToken.balanceOf(owner.address);

            await airdrop.retrieveProjectToken();

            const afterRetrieved = await testToken.balanceOf(owner.address);

            expect(afterRetrieved.sub(beforeRetrieved)).to.be.equal(1000);
        });

        it("Should allow only owner to retrieve remaining other tokens to owner address", async function () {
            await deployAirdrop(); // contract has 1000 wei token

            const beforeRetrieved = await testToken.balanceOf(owner.address);

            // fail from non-owner
            await expect(airdrop.connect(investor1).retrieveOtherToken(testToken.address))
                .to.be.revertedWith("Ownable: caller is not the owner");
            // succeed from owner
            await airdrop.retrieveOtherToken(testToken.address);

            const afterRetrieved = await testToken.balanceOf(owner.address);

            expect(afterRetrieved.sub(beforeRetrieved)).to.be.equal(1000);
        });
    });

    describe("Edge Cases", function () {
        it("Shoudl handle correctly 0 cliff, 0 duration, 100% initial", async function () {
            start = currentTime;
            cliff = 0;
            duration = 0;
            percentage = 100;

            airdrop = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

            await expect(testToken.transfer(airdrop.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdrop.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdrop.address);
            expect(airdropBalance).to.be.equal(1000);

            const userItem = userBalances[1];
            const leaf = userBalanceHashes[1];
            const proof = merkleTree.getHexProof(leaf);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdrop, "Claimed");

            const claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);
        });

        it("Should handle correctly 0 cliff, 0 duration, 10% initial", async function () {
            start = currentTime;
            cliff = 0;
            duration = 0;
            percentage = 10;

            airdrop = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

            await expect(testToken.transfer(airdrop.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdrop.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdrop.address);
            expect(airdropBalance).to.be.equal(1000);

            const userItem = userBalances[1];
            const leaf = userBalanceHashes[1];
            const proof = merkleTree.getHexProof(leaf);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdrop, "Claimed");

            const claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);
        });

        it("Should handle correctly 0 cliff, 100 duration, 100% initial", async function () {
            start = currentTime;
            cliff = 0;
            duration = 100;
            percentage = 100;

            airdrop = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

            await expect(testToken.transfer(airdrop.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdrop.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdrop.address);
            expect(airdropBalance).to.be.equal(1000);

            const userItem = userBalances[1];
            const leaf = userBalanceHashes[1];
            const proof = merkleTree.getHexProof(leaf);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdrop, "Claimed");

            const claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);

            let released = await airdrop.released(1);
            expect(released).to.be.equal(100);

            await ethers.provider.send("evm_increaseTime", [100]);
            await ethers.provider.send("evm_mine", []);

            await expect(airdrop
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.be.revertedWith("A-NTAD-01");

            released = await airdrop.released(1);
            expect(released).to.be.equal(100);
        });
    });

});
