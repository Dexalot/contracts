const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256');

const Utils = require('./utils.js');

describe("AirdropVesting", function () {
    let Token;
    let testToken;
    let Airdrop;
    let airdropContract;
    let Portfolio;
    let portfolio;
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

    let dt = Utils.fromUtf8("ALOT");

    async function deployAirdrop() {
        airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage, portfolio.address);

        await expect(testToken.transfer(airdropContract.address, 1000))
            .to.emit(testToken, "Transfer")
            .withArgs(owner.address, airdropContract.address, 1000);
        const airdropBalance = await testToken.balanceOf(airdropContract.address);
        expect(airdropBalance).to.be.equal(1000);
    }

    before(async function () {
        Token = await ethers.getContractFactory("DexalotToken");
        Airdrop = await ethers.getContractFactory("AirdropVesting");
        Portfolio = await ethers.getContractFactory("Portfolio");
    });

    beforeEach(async function () {
        [owner, investor1, investor2] = await ethers.getSigners();
        testToken = await Token.deploy();
        await testToken.deployed();

        portfolio = await upgrades.deployProxy(Portfolio);

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
            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage, portfolio.address);
            expect(await airdropContract.root()).to.be.equal(root);

            expect(await airdropContract.start()).to.equal(start);
            expect(await airdropContract.cliff()).to.equal(start + cliff);
            expect(await airdropContract.duration()).to.equal(duration);
            expect(await airdropContract.getPercentage()).to.equal(percentage);
            expect(await airdropContract.getPortfolio()).to.equal(portfolio.address);
        });
    });

    describe('Function permissions', () => {
        it('only owner address can call pause', async () => {
            await expect(airdropContract.connect(investor1).pause()).to.revertedWith("Ownable: caller is not the owner");
            await expect(airdropContract.connect(investor1).unpause()).to.revertedWith("Ownable: caller is not the owner");
        });

        it('only owner address can retrieve funds', async () => {
            await expect(airdropContract.connect(investor1).retrieveFund()).to.revertedWith("Ownable: caller is not the owner");
        });

        it('only owner address can set portfolio', async () => {
            await expect(airdropContract.connect(investor1).setPortfolio(portfolio.address)).to.revertedWith("Ownable: caller is not the owner");
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

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof, false)).to.revertedWith("Pausable: paused");
        });

        it('should not revert calling claim() when unpaused', async () => {
            await airdropContract.unpause();

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await airdropContract.connect(investor1).claim(1, userItem.balance, proof, false);

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);
        });
    });

    describe("Claim", function () {
        it("Should claim rewards", async function () {
            await deployAirdrop();

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);

            let released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(55);

            released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
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
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            await expect(airdropContract
                .connect(investor2)
                .claim(2, userItem2.balance, proof2, false))
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
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            await expect(airdropContract
                .connect(investor2)
                .claim(2, userItem2.balance, proof2, false))
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
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            await expect(airdropContract
                .connect(investor2)
                .claim(2, userItem2.balance, proof2, false))
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
                .claim(1, userItem.balance, proof, false))
                .to.revertedWith("AirdropVesting: no tokens are due");

            await expect(airdropContract
                .connect(investor2)
                .claim(2, userItem2.balance, proof2, false))
                .to.revertedWith("AirdropVesting: no tokens are due");
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

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof, false))
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

            await expect(airdropContract.connect(investor1).claim(1, userItem.balance, proof, false))
                .to.revertedWith("AirdropVesting: too early");

            claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(0);

            let released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);
        });

        it("Cannot claim when Airdrop does not have enough balance", async function () {
            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage, portfolio.address);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
                .to.revertedWith("AirdropVesting: Contract doesnt have enough tokens");
        });

        it("Cannot claim before start date", async function () {
            start = start + 10000;
            cliff = 10000;
            duration = 100000;
            percentage = 10;

            await deployAirdrop();

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
                .to.revertedWith("AirdropVesting: too early");
        });

        it("Can only claim specified percentage after start", async function () {
            await deployAirdrop();

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            var claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(10);

            let released = await airdropContract.released(1);
            expect(released).to.be.equal(claimed);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
                .to.revertedWith("AirdropVesting: no tokens are due");
        });

        it("Cannot claim with invalid merkle proof or leaf values", async function () {
            await deployAirdrop();

            let invalidAmount = 150;

            await expect(airdropContract
                .connect(investor1)
                .claim(1, invalidAmount, proof, false))
                .to.revertedWith("AirdropVesting: Merkle Proof is not valid");

            userItem = userBalanceAndHashes[1];
            leaf = userBalanceHashes[0]; // SET WRONG LEAF
            proof = merkleTree.getHexProof(leaf);

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
                .to.revertedWith("AirdropVesting: Merkle Proof is not valid");
        });

        it("Cannot claim more after all tokens are claimed", async function () {
            await deployAirdrop();

            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);

            await ethers.provider.send("evm_increaseTime", [1000]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false))
                .to.revertedWith("AirdropVesting: no tokens are due");
        });
    });

    describe("Portfolio", function () {
        it("Owner can set Portfolio address", async function () {
            await deployAirdrop();

            await airdropContract.setPortfolio(investor2.address);

            let newPortfolio = await airdropContract.getPortfolio();

            expect(newPortfolio).to.be.equal(investor2.address)
        });

        it("Cannot set invalid address", async function () {
            await deployAirdrop();

            await expect(airdropContract
                .setPortfolio("0x0000000000000000000000000000000000000000"))
                .to.be.revertedWith("AirdropVesting: portfolio is the zero address")
        });

        it("Can claim to Portfolio", async function () {
            let am = 0; // auction mode OFF

            await deployAirdrop();

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(airdropContract.address, "Dexalot");

            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, true))
                .to.emit(airdropContract, "Claimed");
            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(10);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);
        });

        it("Can claim to Portfolio then can claim to own wallet", async function () {
            let am = 0; // auction mode OFF

            await deployAirdrop();

            let userItem = userBalanceAndHashes[1];
            let leaf = userBalanceHashes[1];
            let proof = merkleTree.getHexProof(leaf);

            await portfolio.addToken(dt, testToken.address, am);
            await portfolio.addAuctionAdmin(owner.address);
            await portfolio.addTrustedContract(airdropContract.address, "Dexalot");

            await testToken.connect(investor1).approve(portfolio.address, Utils.toWei('1000'));
            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, true)) // Claimed to Portfolio
                .to.emit(airdropContract, "Claimed");
            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(10);
            expect(await testToken.balanceOf(investor1.address)).to.equal(0);

            let released = await airdropContract.released(1);
            expect(released).to.be.equal(10);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false)) // Claimed to Wallet
                .to.emit(airdropContract, "Claimed");
            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(10);
            expect(await testToken.balanceOf(investor1.address)).to.equal(45);

            released = await airdropContract.released(1);
            expect(released).to.be.equal(55);

            await ethers.provider.send("evm_increaseTime", [500]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false)) // Claimed to Wallet
                .to.emit(airdropContract, "Claimed");
            expect((await portfolio.getBalance(investor1.address, dt))[0]).to.equal(10);
            expect(await testToken.balanceOf(investor1.address)).to.equal(90);

            released = await airdropContract.released(1);
            expect(released).to.be.equal(100);
        });
    });

    describe("Retrieve Fund", function () {
        it("Owner can retrieve funds to own address", async function () {
            await deployAirdrop(); // contract has 1000 wei token

            let beforeRetrieved = await testToken.balanceOf(owner.address);

            await airdropContract.retrieveFund();

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

            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage, portfolio.address);

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
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);
        });

        it("0 cliff, 0 duration, 10% initial", async function () {
            start = currentTime;
            cliff = 0;
            duration = 0;
            percentage = 10;

            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage, portfolio.address);

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
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);
        });

        it("0 cliff, 100 duration, 100% initial", async function () {
            start = currentTime;
            cliff = 0;
            duration = 100;
            percentage = 100;

            airdropContract = await Airdrop.deploy(testToken.address, root, start, cliff, duration, percentage, portfolio.address);

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
                .claim(1, userItem.balance, proof, false))
                .to.emit(airdropContract, "Claimed");

            let claimed = await testToken.balanceOf(userItem.address);
            expect(claimed).to.be.equal(100);

            released = await airdropContract.released(1);
            expect(released).to.be.equal(100);

            await ethers.provider.send("evm_increaseTime", [100]);
            await ethers.provider.send("evm_mine");

            await expect(airdropContract
                .connect(investor1)
                .claim(1, userItem.balance, proof, false)) // Claimed to Wallet
                .to.be.revertedWith("AirdropVesting: no tokens are due");

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
