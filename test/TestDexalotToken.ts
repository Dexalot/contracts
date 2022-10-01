/**
 * The test runner for DexalotToken contract
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { DexalotToken } from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";

let alot: DexalotToken;
let owner: SignerWithAddress;
let trader1: SignerWithAddress;

describe("DexalotToken", () => {

    before(async () => {
        // nothing to be done here
    });

    beforeEach(async function () {
        const {owner: owner1, trader1: trader1_} = await f.getAccounts();
        owner = owner1;
        trader1 = trader1_;
    });

    it("Should deploy correctly", async function () {
        alot = await f.deployDexalotToken();
        expect(await alot.owner()).to.be.equal(owner.address);
        expect(await alot.name()).to.be.equal("Dexalot Token");
        expect(await alot.symbol()).to.be.equal("ALOT");
        expect(await alot.decimals()).to.be.equal(18);
        expect(await alot.totalSupply()).to.be.equal(Utils.toWei(100e6.toString()));
    });

    it("Should pause from the admin account", async function () {
        alot = await f.deployDexalotToken();
        // fail from non admin accounts
        await expect(alot.connect(trader1).pause()).to.revertedWith("Ownable: caller is not the owner");
        // succeed from admin accounts
        await alot.connect(owner).pause();
        expect(await alot.paused()).to.be.true;
    });

    it("Should unpause from the admin account", async function () {
        alot = await f.deployDexalotToken();
        // pause first
        await alot.connect(owner).pause();
        expect(await alot.paused()).to.be.true;
        // fail from non admin accounts
        await expect(alot.connect(trader1).unpause()).to.revertedWith("Ownable: caller is not the owner");
        // succeed from admin accounts
        await alot.connect(owner).unpause();
        expect(await alot.paused()).to.be.false;
    });

    it("Should burn correctly from admin account reducing total supply", async function () {
        alot = await f.deployDexalotToken();
        await alot.connect(owner).approve(alot.address, Utils.toWei(10e6.toString()));
        await alot.connect(owner).burn(Utils.toWei(10e6.toString()));
        expect(await alot.totalSupply()).to.be.equal(Utils.toWei(90e6.toString()));
    });

    it("Should send from owner to another address", async function () {
        alot = await f.deployDexalotToken();
        // pause
        await alot.connect(owner).pause();
        await expect(alot.connect(owner).transfer(trader1.address, Utils.toWei(20e6.toString())))
            .to.be.revertedWith("Pausable: paused");
        // unpause
        await alot.connect(owner).unpause();
        await alot.connect(owner).transfer(trader1.address, Utils.toWei(20e6.toString()));
        expect(await alot.balanceOf(owner.address)).to.be.equal(Utils.toWei(80e6.toString()));
        expect(await alot.balanceOf(trader1.address)).to.be.equal(Utils.toWei(20e6.toString()));
        expect(await alot.totalSupply()).to.be.equal(Utils.toWei(100e6.toString()));
    });

    it("Should be able to burn from a regular account", async function () {
        alot = await f.deployDexalotToken();
        await alot.connect(owner).transfer(trader1.address, Utils.toWei(20e6.toString()));
        await alot.connect(trader1).approve(alot.address, Utils.toWei(10e6.toString()));
        await alot.connect(trader1).burn(Utils.toWei(10e6.toString()));
        expect(await alot.balanceOf(owner.address)).to.be.equal(Utils.toWei(80e6.toString()));
        expect(await alot.balanceOf(trader1.address)).to.be.equal(Utils.toWei(10e6.toString()));
        expect(await alot.totalSupply()).to.be.equal(Utils.toWei(90e6.toString()));
    });

});
