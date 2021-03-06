/**
 * The test runner for Dexalot Airdrop contract
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256');

describe("Airdrop", function () {
    let Token;
    let testToken;
    let Airdrop;
    let airdropContract;
    let owner;
    let investor1;

    let start;
    let cliff;
    let duration;
    let percentage;

    let merkleTree;
    let root;
    let userBalanceAndHashes = [];
    let userBalanceHashes = [];
    let userItem;
    let leaf;
    let proof;
    let userItem2;
    let leaf2;
    let proof2;

    let snapshot = [
        { "address": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "amount": "100" },
        { "address": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "amount": "100" },
        { "address": "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", "amount": "100" },
        { "address": "0x90f79bf6eb2c4f870365e785982e1f101e93b906", "amount": "100" }
    ];

    async function deployAirdrop() {
        airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

        await expect(testToken.transfer(airdropContract.address, 1000))
            .to.emit(testToken, "Transfer")
            .withArgs(owner.address, airdropContract.address, 1000);
        const airdropBalance = await testToken.balanceOf(airdropContract.address);
        expect(airdropBalance).to.be.equal(1000);
    }

    before(async function () {
        Token = await ethers.getContractFactory("DexalotToken");
        Airdrop = await ethers.getContractFactory("Airdrop");
    });

    beforeEach(async function () {
        [owner, investor1, investor2] = await ethers.getSigners();
        testToken = await Token.deploy();
        await testToken.deployed();

        currentTime = await latestTime();
        start = currentTime;
        cliff = 0;
        duration = 1000;
        percentage = 10;

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

        userItem = userBalanceAndHashes[1];
        leaf = userBalanceHashes[1];
        proof = merkleTree.getHexProof(leaf);

        userItem2 = userBalanceAndHashes[2];
        leaf2 = userBalanceHashes[2];
        proof2 = merkleTree.getHexProof(leaf2);
    });

    describe("Settings", function () {
        it("It can deploy", async function () {
            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);
            expect(await airdropContract.root()).to.be.equal(root);

            expect(await airdropContract.start()).to.equal(start);
            expect(await airdropContract.cliff()).to.equal(start + cliff);
            expect(await airdropContract.duration()).to.equal(duration);
            expect(await airdropContract.getPercentage()).to.equal(percentage);
        });
    });

    describe('Function permissions', () => {
        it('only owner address can call pause', async () => {
            await expect(airdropContract.connect(investor1).pause()).to.revertedWith("Ownable: caller is not the owner");
            await expect(airdropContract.connect(investor1).unpause()).to.revertedWith("Ownable: caller is not the owner");
        });

        it('only owner address can retrieve funds', async () => {
            await expect(airdropContract.connect(investor1).retrieveProjectToken()).to.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe('Pausable', async () => {
        beforeEach(async () => {
            await deployAirdrop();
            await airdropContract.pause();
        });

        it('should revert calling claim() when paused', async () => {
            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof)).to.revertedWith("Pausable: paused");
        });

        it('should not revert calling claim() when unpaused', async () => {
            await airdropContract.unpause();

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await airdropContract.connect(investor1).claim(1, userItem.balance, proof);

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);
        });
    });

    describe("Claim", function () {
        it("Should claim rewards", async function () {
            await deployAirdrop();

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);

            let released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(55);

            released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);

            released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);
        });

        it("Should claim rewards for multiple claimers", async function () {
            await deployAirdrop();

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            await expect(airdropContract
                .connect(investor2)
                .claim(2, userItem2.balance, proof2))
                .to.emit(airdropContract, "Claimed");

            var claimed = await testToken.balanceOf(userItem.address);
            let released = await airdropContract.released(1);
            expect(claimed).to.be.equal(10);
            expect(released).to.be.equal(claimed);

            claimed = await testToken.balanceOf(userItem2.address);
            released = await airdropContract.released(2);
            expect(claimed).to.be.equal(10);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            await expect(airdropContract
                .connect(investor2)
                .claim(2, userItem2.balance, proof2))
                .to.emit(airdropContract, "Claimed");

            claimed = await testToken.balanceOf(userItem.address);
            released = await airdropContract.released(1);
            expect(claimed).to.be.equal(55);
            expect(released).to.be.equal(claimed);

            claimed = await testToken.balanceOf(userItem2.address);
            released = await airdropContract.released(2);
            expect(claimed).to.be.equal(55);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            await expect(airdropContract
                .connect(investor2)
                .claim(2, userItem2.balance, proof2))
                .to.emit(airdropContract, "Claimed");

            claimed = await testToken.balanceOf(userItem.address);
            released = await airdropContract.released(1);
            expect(claimed).to.be.equal(100);
            expect(released).to.be.equal(claimed);

            claimed = await testToken.balanceOf(userItem2.address);
            released = await airdropContract.released(2);
            expect(claimed).to.be.equal(100);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.revertedWith("A-NTAD-01");

            await expect(airdropContract
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

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await ethers.provider.send("evm_increaseTime", [10000]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);

            let released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);
        });

        it("Should raise error claiming before start", async function () {
            start = start + 10000;

            await deployAirdrop();

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof))
                .to.revertedWith("A-TOOE-01");

            claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(0);

            let released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);
        });

        it("Cannot claim when Airdrop does not have enough balance", async function () {
            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.revertedWith("A-CNET-01");
        });

        it("Cannot claim before start date", async function () {
            start = start + 10000;
            cliff = 10000;
            duration = 100000;
            percentage = 10;

            await deployAirdrop();

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.revertedWith("A-TOOE-01");
        });

        it("Can only claim specified percentage after start", async function () {
            await deployAirdrop();

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);

            let released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.revertedWith("A-NTAD-01");
        });

        it("Cannot claim with invalid merkle proof or leaf values", async function () {
            await deployAirdrop();

            let invalidAmount = 150;

            await expect(airdropContract
                .connect(investor1)
                .claim(1, invalidAmount, proof))
                .to.revertedWith("A-MPNV-01");

            userItem = userBalanceAndHashes[1];
            leaf = userBalanceHashes[0]; // SET WRONG LEAF
            proof = merkleTree.getHexProof(leaf);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.revertedWith("A-MPNV-01");
        });

        it("Can handle releasableAmount", async function () {
            start = start + 1000;
            cliff = 500;
            duration = 1000;
            percentage = 10;

            await deployAirdrop();

            let validAmount = 100;
            let invalidAmount = 150;

            // before start, releasable amount is 0
            expect(await airdropContract
                .connect(investor1)
                .releasableAmount(1, validAmount, proof))
                .to.be.equal(0);

            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine");

            // at start, revert with invalid amount
            await expect(airdropContract
                .connect(investor1)
                .releasableAmount(1, invalidAmount, proof))
                .to.revertedWith("A-MPNV-02");

            // at start, releasable amount is just initial percentage
            expect(await airdropContract
                .connect(investor1)
                .releasableAmount(1, validAmount, proof))
                .to.be.equal(10);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            // at cliff, releasable amount is still just initial percentage
            expect(await airdropContract
                .connect(investor1)
                .releasableAmount(1, validAmount, proof))
                .to.be.equal(10);

            await ethers.provider.send("evm_increaseTime", [250]);
            await ethers.provider.send("evm_mine");

            // at 75% of duration, releasable amount is initial percentage and half of remaining
            expect(await airdropContract
                .connect(investor1)
                .releasableAmount(1, validAmount, proof))
                .to.be.equal(55);

            await ethers.provider.send("evm_increaseTime", [250]);
            await ethers.provider.send("evm_mine");

            // at duration, releasable amount is initial percentage and remaining
            expect(await airdropContract
                .connect(investor1)
                .releasableAmount(1, validAmount, proof))
                .to.be.equal(100);

        });

        it("Cannot claim more after all tokens are claimed", async function () {
            await deployAirdrop();

            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);

            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.revertedWith("A-NTAD-01");
        });
    });

    describe("Retrieve remaining/excess/accidental tokens", function () {
        it("Owner can retrieve remaining project tokens to own address", async function () {
            await deployAirdrop(); // contract has 1000 wei token

            let beforeRetrieved = await testToken.balanceOf(owner.address);

            await airdropContract.retrieveProjectToken();

            let afterRetrieved = await testToken.balanceOf(owner.address);

            expect(afterRetrieved.sub(beforeRetrieved)).to.be.equal(1000);
        });

        it("Owner can retrieve remaining other tokens to own address", async function () {
            await deployAirdrop(); // contract has 1000 wei token

            let beforeRetrieved = await testToken.balanceOf(owner.address);

            await airdropContract.retrieveOtherToken(testToken.address);

            let afterRetrieved = await testToken.balanceOf(owner.address);

            expect(afterRetrieved.sub(beforeRetrieved)).to.be.equal(1000);
        });
    });

    describe("Edge Cases", function () {
        it("0 cliff, 0 duration, 100% initial", async function () {
            start = currentTime;
            cliff = 0;
            duration = 0;
            percentage = 100;

            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

            await expect(testToken.transfer(airdropContract.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdropContract.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdropContract.address);
            expect(airdropBalance).to.be.equal(1000);

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);
        });

        it("0 cliff, 0 duration, 10% initial", async function () {
            start = currentTime;
            cliff = 0;
            duration = 0;
            percentage = 10;

            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

            await expect(testToken.transfer(airdropContract.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdropContract.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdropContract.address);
            expect(airdropBalance).to.be.equal(1000);

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);
        });

        it("0 cliff, 100 duration, 100% initial", async function () {
            start = currentTime;
            cliff = 0;
            duration = 100;
            percentage = 100;

            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage);

            await expect(testToken.transfer(airdropContract.address, 1000))
                .to.emit(testToken, "Transfer")
                .withArgs(owner.address, airdropContract.address, 1000);
            const airdropBalance = await testToken.balanceOf(airdropContract.address);
            expect(airdropBalance).to.be.equal(1000);

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);

            released = await airdropContract.released(1);
            expect(released).to.be.equal(100);

            await ethers.provider.send("evm_increaseTime", [100]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof))
                .to.be.revertedWith("A-NTAD-01");

            released = await airdropContract.released(1);
            expect(released).to.be.equal(100);
        });
    });
});

async function latestTime() {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}
