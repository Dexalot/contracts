/**
 * The test runner for Dexalot Portfolio contract
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

const Utils = require('./utils.js');

let MockToken;
let owner;
let admin;
let auctionAdmin;
let trader1;
let minter1;
let foundationSafe;
let mock;


describe("MockToken", () => {

    before(async () => {
        MockToken = await ethers.getContractFactory("MockToken");
    });

    beforeEach(async function () {
        [owner, admin, auctionAdmin, trader1, minter1, foundationSafe] = await ethers.getSigners();
        console.log("Owner:", owner.address);
    });

    it("Should deploy correctly", async function () {
        mock = await MockToken.deploy("Mock Token", "MTOK", 18);
        expect(await mock.name()).to.be.equal("Mock Token");
        expect(await mock.symbol()).to.be.equal("MTOK");
        expect(await mock.decimals()).to.be.equal(18);
        expect(await mock.totalSupply()).to.be.equal(0);
    });

    it("Should set up the admin and minter roles correctly", async function () {
        const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
        mock = await MockToken.deploy("Mock Token", "MTOK", 18);
        expect(await mock.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).to.be.equal(1);
        expect(await mock.getRoleMemberCount(MINTER_ROLE)).to.be.equal(1);
        expect(await mock.getRoleMember(DEFAULT_ADMIN_ROLE, 0)).to.be.equal(owner.address);
        expect(await mock.getRoleMember(MINTER_ROLE, 0)).to.be.equal(owner.address);
    });

    it("Should allow adding and removing admin from owner account", async function () {
        const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const ZERO = '0x0000000000000000000000000000000000000000';
        mock = await MockToken.deploy("Mock Token", "MTOK", 18);
        // fail to add for non admin account
        await expect(mock.connect(trader1).addAdmin(admin.address)).to.revertedWith("M-OACC-01");
        // fail to add zero address as admin
        await expect(mock.connect(owner).addAdmin(ZERO)).to.revertedWith("M-ZANA-01");
        // add new admin
        await mock.connect(owner).addAdmin(admin.address);
        expect(await mock.isAdmin(admin.address)).to.be.equal(true);
        // fail to remove for non admin account
        await expect(mock.connect(trader1).removeAdmin(admin.address)).to.revertedWith("M-OACC-02");
        // remove new admin
        await mock.connect(owner).removeAdmin(admin.address);
        expect(await mock.isAdmin(admin.address)).to.be.equal(false);
        // fail to remove the last admin
        await expect(mock.connect(owner).removeAdmin(owner.address)).to.revertedWith("M-ALOA-01");
    });

    it("Should allow adding and removing minter from owner account", async function () {
        const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
        const ZERO = '0x0000000000000000000000000000000000000000';
        mock = await MockToken.deploy("Mock Token", "MTOK", 18);
        // fail to add for non admin account
        await expect(mock.connect(trader1).addMinter(minter1.address)).to.revertedWith("M-OACC-03");
        // fail to add zero address as minter
        await expect(mock.connect(owner).addMinter(ZERO)).to.revertedWith("M-ZANA-02");
        // add new admin
        await mock.connect(owner).addMinter(minter1.address);
        // fail to remove for non admin account
        await expect(mock.connect(trader1).removeMinter(minter1.address)).to.revertedWith("M-OACC-04");
        // remove new admin
        await mock.connect(owner).removeMinter(minter1.address);
        expect(await mock.hasRole(MINTER_ROLE, minter1.address)).to.be.equal(false);
        // fail to remove the last minter
        await expect(mock.connect(owner).removeMinter(minter1.address)).to.revertedWith("M-ALOA-02");
    });

    it("Should mint correctly from minter account increasing total supply", async function () {
        mock = await MockToken.deploy("Mock Token", "MTOK", 18);
        await mock.connect(owner).mint(trader1.address, Utils.toWei(parseInt(10e6).toString()));
        expect(await mock.totalSupply()).to.be.equal(Utils.toWei(parseInt(10e6).toString()));
        expect(await mock.balanceOf(trader1.address)).to.be.equal(Utils.toWei(parseInt(10e6).toString()));
    });

    it("Should send from owner to another address", async function () {
        mock = await MockToken.deploy("Mock Token", "MTOK", 18);
        await mock.connect(owner).mint(owner.address, Utils.toWei(parseInt(100e6).toString()));
        await mock.connect(owner).transfer(trader1.address, Utils.toWei(parseInt(20e6).toString()));
        expect(await mock.balanceOf(owner.address)).to.be.equal(Utils.toWei(parseInt(80e6).toString()));
        expect(await mock.balanceOf(trader1.address)).to.be.equal(Utils.toWei(parseInt(20e6).toString()));
        expect(await mock.totalSupply()).to.be.equal(Utils.toWei(parseInt(100e6).toString()));
    });
});
