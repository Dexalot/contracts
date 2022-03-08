/**
 * The test runner for Dexalot Portfolio contract
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

const Utils = require('./utils.js');

let DexalotToken;
let owner;
let admin;
let auctionAdmin;
let trader1;
let trader2;
let foundationSafe;
let alot;


describe("DexalotToken", () => {

    before(async () => {
        DexalotToken = await ethers.getContractFactory("DexalotToken");
    });

    beforeEach(async function () {
        [owner, admin, auctionAdmin, trader1, trader2, foundationSafe] = await ethers.getSigners();
        console.log("Owner:", owner.address);
    });

    it("Should deploy correctly", async function () {
        alot = await DexalotToken.deploy();
        expect(await alot.owner()).to.be.equal(owner.address);
        expect(await alot.name()).to.be.equal("Dexalot Token");
        expect(await alot.symbol()).to.be.equal("ALOT");
        expect(await alot.decimals()).to.be.equal(18);
        expect(await alot.totalSupply()).to.be.equal(Utils.toWei(parseInt(100e6).toString()));
    });

    it("Should pause from the admin account", async function () {
        alot = await DexalotToken.deploy();
        // fail from non admin accounts
        await expect(alot.connect(trader1).pause()).to.revertedWith("Ownable: caller is not the owner");
        // succeed from admin accounts
        await alot.connect(owner).pause();
        expect(await alot.paused()).to.be.equal(true);
    });

    it("Should unpause from the admin account", async function () {
        alot = await DexalotToken.deploy();
        // pause first
        await alot.connect(owner).pause();
        expect(await alot.paused()).to.be.equal(true);
        // fail from non admin accounts
        await expect(alot.connect(trader1).unpause()).to.revertedWith("Ownable: caller is not the owner");
        // succeed from admin accounts
        await alot.connect(owner).unpause();
        expect(await alot.paused()).to.be.equal(false);
    });

    it("Should burn correctly from admin account reducing total supply", async function () {
        alot = await DexalotToken.deploy();
        await alot.connect(owner).approve(alot.address, Utils.toWei(parseInt(10e6).toString()));
        await alot.connect(owner).burn(Utils.toWei(parseInt(10e6).toString()));
        expect(await alot.totalSupply()).to.be.equal(Utils.toWei(parseInt(90e6).toString()));
    });

    it("Should send from owner to another address", async function () {
        alot = await DexalotToken.deploy();
        await alot.connect(owner).transfer(trader1.address, Utils.toWei(parseInt(20e6).toString()));
        expect(await alot.balanceOf(owner.address)).to.be.equal(Utils.toWei(parseInt(80e6).toString()));
        expect(await alot.balanceOf(trader1.address)).to.be.equal(Utils.toWei(parseInt(20e6).toString()));
        expect(await alot.totalSupply()).to.be.equal(Utils.toWei(parseInt(100e6).toString()));
    });

    it("Should be able to burn from a regular account", async function () {
        alot = await DexalotToken.deploy();
        await alot.connect(owner).transfer(trader1.address, Utils.toWei(parseInt(20e6).toString()));
        await alot.connect(trader1).approve(alot.address, Utils.toWei(parseInt(10e6).toString()));
        await alot.connect(trader1).burn(Utils.toWei(parseInt(10e6).toString()));
        expect(await alot.balanceOf(owner.address)).to.be.equal(Utils.toWei(parseInt(80e6).toString()));
        expect(await alot.balanceOf(trader1.address)).to.be.equal(Utils.toWei(parseInt(10e6).toString()));
        expect(await alot.totalSupply()).to.be.equal(Utils.toWei(parseInt(90e6).toString()));
    });

});
