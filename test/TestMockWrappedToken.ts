/**
 * The test runner for Dexalot MockToken contract
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { MockWrappedToken } from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from 'ethers';

describe("MockWrappedToken", () => {

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let minter1: SignerWithAddress;
    let mock: MockWrappedToken;

    before(async () => {
        // nothing to be done here
    });

    beforeEach(async function () {
        const {owner: owner1, admin: admin1, trader1: trader1_, trader2: trader2_} = await f.getAccounts();
        owner = owner1;
        admin = admin1;
        trader1 = trader1_;
        minter1 = trader2_;
        mock = await f.deployMockWrappedToken("WMTOK", 18);
    });

    it("Should deploy correctly", async function () {

        expect(await mock.name()).to.be.equal("Mock Wrapped WMTOK Token");
        expect(await mock.symbol()).to.be.equal("WMTOK");
        expect(await mock.decimals()).to.be.equal(18);
        expect(await mock.totalSupply()).to.be.equal(0);
    });

    it("Should set up the admin and minter roles correctly", async function () {
        const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";

        expect(await mock.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).to.be.equal(1);
        expect(await mock.getRoleMemberCount(MINTER_ROLE)).to.be.equal(1);
        expect(await mock.getRoleMember(DEFAULT_ADMIN_ROLE, 0)).to.be.equal(owner.address);
        expect(await mock.getRoleMember(MINTER_ROLE, 0)).to.be.equal(owner.address);
    });


    it("Should allow adding and removing admin from owner account", async function () {
        const ZERO = '0x0000000000000000000000000000000000000000';

        // fail to add for non admin account
        await expect(mock.connect(trader1).addAdmin(admin.address)).to.revertedWith("M-OACC-01");
        // fail to add zero address as admin
        await expect(mock.connect(owner).addAdmin(ZERO)).to.revertedWith("M-ZANA-01");
        // add new admin
        await mock.connect(owner).addAdmin(admin.address);
        expect(await mock.isAdmin(admin.address)).to.be.true;
        // fail to remove for non admin account
        await expect(mock.connect(trader1).removeAdmin(admin.address)).to.revertedWith("M-OACC-02");
        // remove new admin
        await mock.connect(owner).removeAdmin(admin.address);
        expect(await mock.isAdmin(admin.address)).to.be.false;
        // fail to remove the last admin
        await expect(mock.connect(owner).removeAdmin(owner.address)).to.revertedWith("M-ALOA-01");

    });

    it("Should allow adding and removing minter from owner account", async function () {
        const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
        const ZERO = '0x0000000000000000000000000000000000000000';

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
        expect(await mock.hasRole(MINTER_ROLE, minter1.address)).to.be.false;
        // fail to remove the last minter
        await expect(mock.connect(owner).removeMinter(minter1.address)).to.revertedWith("M-ALOA-02");
    });

    it("Should mint correctly from minter account increasing total supply", async function () {

        // fail from non-minter
        await expect(mock.connect(trader1).mint(trader1.address, Utils.toWei(parseInt(10e6.toString()).toString())))
            .to.be.revertedWith("AccessControl:");
        // succeed from minter
        await mock.connect(owner).mint(trader1.address, Utils.toWei(parseInt(10e6.toString()).toString()));
        expect(await mock.totalSupply()).to.be.equal(Utils.toWei(parseInt(10e6.toString()).toString()));
        expect(await mock.balanceOf(trader1.address)).to.be.equal(Utils.toWei(parseInt(10e6.toString()).toString()));
    });

    it("Should send from owner to another address", async function () {

        await mock.connect(owner).mint(owner.address, Utils.toWei(parseInt(100e6.toString()).toString()));
        await mock.connect(owner).transfer(trader1.address, Utils.toWei(parseInt(20e6.toString()).toString()));
        expect(await mock.balanceOf(owner.address)).to.be.equal(Utils.toWei(parseInt(80e6.toString()).toString()));
        expect(await mock.balanceOf(trader1.address)).to.be.equal(Utils.toWei(parseInt(20e6.toString()).toString()));
        expect(await mock.totalSupply()).to.be.equal(Utils.toWei(parseInt(100e6.toString()).toString()));
    });

    it("Should wrap correctly", async function () {

        const amount = "10"
        expect (await mock.connect(trader1).deposit({value: Utils.toWei(amount),
            gasLimit: 700000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei")})).to.emit(mock, "Deposit")
            .withArgs(trader1.address, Utils.toWei(amount));
        expect(await mock.balanceOf(trader1.address)).to.be.equal(Utils.toWei(amount));
        expect(await mock.totalSupply()).to.be.equal(Utils.toWei(amount));
    });

    it("Should unwrap correctly", async function () {
        const amount = "10"
        const wad ="5"
        expect (await mock.connect(trader1).deposit({value: Utils.toWei(amount),
            gasLimit: 700000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei")})).to.emit(mock, "Deposit")
            .withArgs(trader1.address, Utils.toWei(amount));
        // not enough balance
        await expect( mock.connect(trader1).withdraw(Utils.toWei("15"))).to.be.revertedWith("Insufficient balance");

        expect (await mock.connect(trader1).withdraw(Utils.toWei(wad))).to.emit(mock, "Withdrawal")
            .withArgs(trader1.address, Utils.toWei(wad));
        expect(await mock.totalSupply()).to.be.equal(Utils.toWei(wad)); //10 - 5 = 5
    });

});
