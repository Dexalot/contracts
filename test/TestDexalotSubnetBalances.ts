/**
 * The test runner for Dexalot Balance Merkle Storage
 */

import Utils from './utils';

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DexalotSubnetBalances } from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe("Balance Merkle Storage", () => {
    let dexalotSubnetBalances: DexalotSubnetBalances;
    let writer: SignerWithAddress;

    beforeEach(async function () {
        const { foundationSafe } = await f.getAccounts();
        writer = foundationSafe;
        const DexalotSubnetBalances = await ethers.getContractFactory("DexalotSubnetBalances");
        dexalotSubnetBalances = (await upgrades.deployProxy(DexalotSubnetBalances, [writer.address])) as DexalotSubnetBalances;
        await dexalotSubnetBalances.deployed();
    });

    it("Should deploy correctly", async () => {
        const {owner, foundationSafe} = await f.getAccounts();

        expect(await dexalotSubnetBalances.hasRole(await dexalotSubnetBalances.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
        expect(await dexalotSubnetBalances.hasRole(await dexalotSubnetBalances.WRITER_ROLE(), foundationSafe.address)).to.be.true;
    });

    it("Should not initialize again after deployment", async function () {
        const { foundationSafe } = await f.getAccounts();
        writer = foundationSafe;
        await expect(dexalotSubnetBalances.initialize(writer.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should set single tree", async () => {
        const { trader1 } = await f.getAccounts();

        const time = Math.floor(Date.now() / 1000);

        // fail for non-writer
        await expect(dexalotSubnetBalances.connect(trader1).setBalances(
            Utils.fromUtf8("AVAX"),
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            "ipfs://AVAX",
            time,
        )).to.be.revertedWith("AccessControl: account")

        await dexalotSubnetBalances.connect(writer)
        .setBalances(
            Utils.fromUtf8("AVAX"),
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            "ipfs://",
            time,
        )

        const balance = await dexalotSubnetBalances.balances(Utils.fromUtf8("AVAX"));

        expect(balance[0]).to.equal(time);
        expect(balance[1]).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
        expect(balance[2]).to.equal("ipfs://");
    })

    it("Should set multiple trees", async () => {
        const { trader1 } = await f.getAccounts();

        const time = Math.floor(Date.now() / 1000);

        // fail for non-writer
        await expect(dexalotSubnetBalances.connect(trader1).setBatchBalances(
            [
                Utils.fromUtf8("AVAX"),
                Utils.fromUtf8("ALOT")
            ],
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000001"
            ],
            [
                "ipfs://AVAX",
                "ipfs://ALOT"
            ],
            time,
        )).to.be.revertedWith("AccessControl: account")

        await dexalotSubnetBalances.connect(writer)
        .setBatchBalances(
            [
                Utils.fromUtf8("AVAX"),
                Utils.fromUtf8("ALOT"),
            ],
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000001",
            ],
            [
                "ipfs://AVAX",
                "ipfs://ALOT",
            ],
            time,
        )

        const balanceAVAX = await dexalotSubnetBalances.balances(Utils.fromUtf8("AVAX"));
        const balanceALOT = await dexalotSubnetBalances.balances(Utils.fromUtf8("ALOT"));

        expect(balanceAVAX[0]).to.equal(time);
        expect(balanceAVAX[1]).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
        expect(balanceAVAX[2]).to.equal("ipfs://AVAX");

        expect(balanceALOT[0]).to.equal(time);
        expect(balanceALOT[1]).to.equal("0x0000000000000000000000000000000000000000000000000000000000000001");
        expect(balanceALOT[2]).to.equal("ipfs://ALOT");
    })
})
