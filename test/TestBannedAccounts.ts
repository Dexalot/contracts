/**
 * The test runner for Banned Accounts Storage
 */

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BannedAccounts } from '../typechain-types';

describe("Banned Accounts Storage", () => {
    let bannedAccounts: BannedAccounts;

    beforeEach(async function () {
        const { admin } = await f.getAccounts();

        const BannedAccounts = await ethers.getContractFactory("BannedAccounts");
        bannedAccounts = (await upgrades.deployProxy(BannedAccounts, [admin.address])) as BannedAccounts;
        await bannedAccounts.deployed();
    });

    it("Should deploy correctly", async () => {
        const { owner, admin } = await f.getAccounts();

        expect(await bannedAccounts.hasRole(await bannedAccounts.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
        expect(await bannedAccounts.hasRole(await bannedAccounts.BAN_ADMIN_ROLE(), admin.address)).to.be.true;
    });

    it("Should not initialize again after deployment", async function () {
        const { trader1 } = await f.getAccounts();

        await expect(bannedAccounts.initialize(trader1.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should ban and check address correctly", async () => {
        const { owner, admin, trader1 } = await f.getAccounts();

        // fail for account without BAN_ADMIN_ROLE
        await expect(bannedAccounts.connect(owner).banAccount(trader1.address, 1))   // BanReason.OFAC = 1
            .to.be.revertedWith("AccessControl");
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.false;

        // succeed for account with BAN_ADMIN_ROLE
        await bannedAccounts.connect(admin).banAccount(trader1.address, 1)           // BanReason.OFAC = 1
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.true;
    })

    it("Should ban multiple addresses correctly", async () => {
        const { owner, admin, trader1, trader2 } = await f.getAccounts();

        // fail for account without BAN_ADMIN_ROLE
        await expect(bannedAccounts.connect(owner).banAccounts([trader1.address, trader2.address], [1, 1]))
            .to.be.revertedWith("AccessControl");

        // fail for account without BAN_ADMIN_ROLE
        await expect(bannedAccounts.connect(admin).banAccounts([trader1.address, trader2.address], [1]))
            .to.be.revertedWith("BA-LENM-01");

        // succeed for account with BAN_ADMIN_ROLE
        await bannedAccounts.connect(admin).banAccounts([trader1.address, trader2.address], [1, 1])
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.true;
        expect(await bannedAccounts.isBanned(trader2.address)).to.be.true;
    })

    it("Should unban and check address correctly", async () => {
        const { owner, admin, trader1 } = await f.getAccounts();

        // ban trader1 as default
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.false;
        await bannedAccounts.connect(admin).banAccount(trader1.address, 1)          // BanReason.OFAC = 1
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.true;

        // fail for account without BAN_ADMIN_ROLE
        await expect(bannedAccounts.connect(owner).unbanAccount(trader1.address))
            .to.be.revertedWith("AccessControl");
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.true;

        // succeed for account with BAN_ADMIN_ROLE
        await bannedAccounts.connect(admin).unbanAccount(trader1.address)
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.false;
    })

    it("Should unban multiple addresses correctly", async () => {
        const { owner, admin, trader1, trader2 } = await f.getAccounts();

        // ban trader1 and trade2 as default
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.false;
        expect(await bannedAccounts.isBanned(trader2.address)).to.be.false;
        await bannedAccounts.connect(admin).banAccounts([trader1.address, trader2.address], [1, 1]);
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.true;
        expect(await bannedAccounts.isBanned(trader2.address)).to.be.true;

        // fail for account without BAN_ADMIN_ROLE
        await expect(bannedAccounts.connect(owner).unbanAccounts([trader1.address, trader2.address]))
            .to.be.revertedWith("AccessControl");

        // succeed for account with BAN_ADMIN_ROLE
        await bannedAccounts.connect(admin).unbanAccounts([trader1.address, trader2.address])
        expect(await bannedAccounts.isBanned(trader1.address)).to.be.false;
        expect(await bannedAccounts.isBanned(trader2.address)).to.be.false;
    })

    it("Should ban and get ban reason correctly", async () => {
        const { admin, trader1 } = await f.getAccounts();

        expect(await bannedAccounts.getBanReason(trader1.address)).to.be.equal(0);   // BanReason.NOTBANNED = 0

        await bannedAccounts.connect(admin).banAccount(trader1.address, 1)           // BanReason.OFAC = 1
        expect(await bannedAccounts.getBanReason(trader1.address)).to.be.equal(1);

        await bannedAccounts.connect(admin).banAccount(trader1.address, 2)           // BanReason.ABUSE = 2
        expect(await bannedAccounts.getBanReason(trader1.address)).to.be.equal(2);

        await bannedAccounts.connect(admin).banAccount(trader1.address, 3)           // BanReason.TERMS = 3
        expect(await bannedAccounts.getBanReason(trader1.address)).to.be.equal(3);

        // fail with incorrect arguments
        await expect(bannedAccounts.connect(admin).banAccount(trader1.address, 4))
            .to.be.revertedWith("Transaction reverted: function was called with incorrect parameters");
    })

})
