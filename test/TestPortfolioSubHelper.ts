/**
 * The test runner for PortfolioSubHelper
 */

import * as f from "./MakeTestSuite";
import Utils from './utils';
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { PortfolioSubHelper } from '../typechain-types';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("PortfolioSubHelper", () => {
    let portfolioSubHelper: PortfolioSubHelper;

    const AVAX = Utils.fromUtf8("AVAX");
    const ALOT = Utils.fromUtf8("ALOT");
    const BTC = Utils.fromUtf8("BTC");


    const tradePairIds = [AVAX, ALOT ];
    const makerRates = [5, 12];
    const takerRates = [15, 18];
    const defaultMaker = 20;
    const defaultTaker = 30;

    const makerRebates = [9, 39, 89]; //9%, 39%, 89%
    const takerRebates = [5, 48, 74]; //5%, 48%, 74%

    // Based on Default Maker Taker Rates
    const expectedMakerRebateFromDefault = [182, 122, 22]; //0.182% = 20 * (100-9) / 10
    const expectedTakerRebateFromDefault = [285, 156, 78]; //0.285% = 30 * (100-5) / 10


    //Proposed Maker/Taker Rates
    const proposedMaker = 10
    const proposedTaker = 12

    const expectedMakerRebateFromProposed = [91, 61, 11];  //0.091% = 10 * (100-9) / 10
    const expectedTakerRebateFromProposed = [114, 62, 31]; //0.114%, 0.062%, 0.031%,


    let trader1:SignerWithAddress;
    let trader2: SignerWithAddress;
    let other1: SignerWithAddress;
    let traders: string[];

    before(async function () {
        const accounts = await f.getAccounts()
        trader1 = accounts.trader1;
        trader2 = accounts.trader2;
        other1 = accounts.other1;

        traders = [trader1.address, trader2.address, other1.address];
    });

    beforeEach(async function () {

        const PortfolioSubHelper = await ethers.getContractFactory("PortfolioSubHelper");
        portfolioSubHelper = (await upgrades.deployProxy(PortfolioSubHelper)) as PortfolioSubHelper;
        await portfolioSubHelper.deployed();
    });

    it("Should deploy correctly", async () => {
        const { owner } = await f.getAccounts();
        expect(await portfolioSubHelper.hasRole(await portfolioSubHelper.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
        expect(await portfolioSubHelper.minTakerRate()).to.be.equal(5);
    });

    it("Should not initialize again after deployment", async function () {

        await expect(portfolioSubHelper.initialize())
            .to.be.revertedWith("Initializable: contract is already initialized");
    });


    it("Should set min Taker rate correctly", async function () {
        // fail for non owner
        await expect(portfolioSubHelper.connect(trader1).setMinTakerRate(10))
            .to.be.revertedWith("AccessControl");

        await expect(portfolioSubHelper.setMinTakerRate(0))
            .to.be.revertedWith("P-MTNZ-01");

        // succeed for owner
        await expect(portfolioSubHelper.setMinTakerRate(10))
            .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("MIN_TAKER_RATE", "UPDATE", ethers.constants.AddressZero, ethers.constants.HashZero, 0, 10);
        expect(await portfolioSubHelper.minTakerRate()).to.be.equal(10);
    });

    it("Should add & remove admin accounts for rates correctly", async () => {
        // fail for non owner
        await expect(portfolioSubHelper.connect(trader1).addAdminAccountForRates(trader1.address, "trader1"))
            .to.be.revertedWith("AccessControl");

        expect(await portfolioSubHelper.adminAccountsForRates(trader1.address)).to.be.false;

        await expect(portfolioSubHelper.addAdminAccountForRates(ethers.constants.AddressZero, "trader1")).to.be.revertedWith("P-ZADDR-01");

        // succeed for owner
        await expect(portfolioSubHelper.addAdminAccountForRates(trader1.address, "trader1"))
            .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("ADMIN_RATES", "ADD", trader1.address, ethers.constants.HashZero,0,0);
        expect(await portfolioSubHelper.adminAccountsForRates(trader1.address)).to.be.true;
        expect(await portfolioSubHelper.isAdminAccountForRates(trader1.address)).to.be.true;


        let rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(0);
        expect(rates.taker).to.be.equal(0);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(0);
        expect(rates.taker).to.be.equal(0);

        // fail for non owner
        await expect(portfolioSubHelper.connect(trader1).removeAdminAccountForRates(trader1.address))
            .to.be.revertedWith("AccessControl");

        await expect(portfolioSubHelper.removeAdminAccountForRates(trader1.address))
            .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("ADMIN_RATES", "REMOVE", trader1.address, ethers.constants.HashZero,0,0);
        expect(await portfolioSubHelper.adminAccountsForRates(trader1.address)).to.be.false;
        expect(await portfolioSubHelper.isAdminAccountForRates(trader1.address)).to.be.false;

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(defaultMaker * 10);
        expect(rates.taker).to.be.equal(defaultTaker * 10);

    })

    it("Should add rate override accounts correctly", async () => {

        let rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(defaultMaker * 10);
        expect(rates.taker).to.be.equal(defaultTaker * 10);

        // fail for account without DEFAULT_ADMIN
        await expect(portfolioSubHelper.connect(trader1).addToRateOverrides(trader1.address, "trader1", tradePairIds, makerRates, takerRates))
            .to.be.revertedWith("AccessControl");
        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("");

        await expect(portfolioSubHelper.addToRateOverrides(ethers.constants.AddressZero, "trader1", tradePairIds, makerRates, takerRates)).to.be.revertedWith("P-ZADDR-01");
        // succeed for owner
        await expect(portfolioSubHelper.addToRateOverrides(trader1.address, "trader1", tradePairIds, makerRates, takerRates))
            .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("RATE_OVERRIDE", "ADD", trader1.address, AVAX, makerRates[0], takerRates[0]);

        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("trader1");
        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        //console.log (rates)
        expect(rates.maker).to.be.equal(makerRates[0] * 10);
        expect(rates.taker).to.be.equal(takerRates[0] * 10);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(makerRates[1] * 10);
        expect(rates.taker).to.be.equal(takerRates[1] * 10);

    })

    it("Should remove tradpairs from rebates accounts for a given account correctly", async () => {


        await expect(portfolioSubHelper.addToRateOverrides(trader1.address, "trader1", tradePairIds, makerRates, takerRates))
        .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("RATE_OVERRIDE", "ADD", trader1.address, AVAX, makerRates[0], takerRates[0]);

        //Fail for non owner
        await expect(portfolioSubHelper.connect(trader1).removeTradePairsFromRateOverrides(trader1.address, tradePairIds)).to.be.revertedWith("AccessControl");
        // No changes
        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("trader1");
        let rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(makerRates[0]*10);
        expect(rates.taker).to.be.equal(takerRates[0]*10);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(makerRates[1]*10);
        expect(rates.taker).to.be.equal(takerRates[1]*10);


        await expect(portfolioSubHelper.removeTradePairsFromRateOverrides(trader1.address, [AVAX]))
        .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("RATE_OVERRIDE", "REMOVE-TRADEPAIR", trader1.address, AVAX,0,0);

        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("trader1");

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(defaultMaker*10);
        expect(rates.taker).to.be.equal(defaultTaker*10);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(makerRates[1]*10);
        expect(rates.taker).to.be.equal(takerRates[1]*10);


        await expect(portfolioSubHelper.removeTradePairsFromRateOverrides(trader1.address, [ALOT]))
        .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("RATE_OVERRIDE", "REMOVE-TRADEPAIR", trader1.address, ALOT,0,0);

        //Removing the tradepair without using  removeRebateAccountForRates but we get back the default rates
        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("trader1");

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(defaultMaker*10);
        expect(rates.taker).to.be.equal(defaultTaker*10);

    })

    it("Should market maker get preferential rate on maker & volume rebate on the taker", async () => {
        let rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(defaultMaker * 10);
        expect(rates.taker).to.be.equal(defaultTaker * 10);

        await expect(portfolioSubHelper.addToRateOverrides(trader1.address, "trader1", tradePairIds, makerRates, takerRates))
        .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("RATE_OVERRIDE", "ADD", trader1.address, AVAX, makerRates[0], takerRates[0]);

        //Delete ALOT taker rate with 255
        await expect(portfolioSubHelper.addToRateOverrides(trader1.address, "trader1", [ALOT], [makerRates[1]], [255]))
        .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("RATE_OVERRIDE", "ADD", trader1.address, ALOT, makerRates[1], 255);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(makerRates[1] * 10);
        expect(rates.taker).to.be.equal(defaultTaker * 10);

        //Set Volume Rebates for taker
        await expect(portfolioSubHelper.addVolumeBasedRebates([trader1.address], [makerRebates[0]], [takerRebates[0]]))
        .to.emit(portfolioSubHelper, "RateChanged")
        .withArgs("REBATES", "UPDATED", trader1.address, ethers.constants.HashZero, makerRebates[0], takerRebates[0]);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(makerRates[1] * 10); // returns the preferential rate , not the volume
        expect(rates.taker).to.be.equal(expectedTakerRebateFromDefault[0]);


        //Delete AVAX taker rate with 255
        await expect(portfolioSubHelper.addToRateOverrides(trader1.address, "trader1", [AVAX], [255], [takerRates[0]]))
        .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("RATE_OVERRIDE", "ADD", trader1.address, AVAX, 255, takerRates[0]);

        //Volume Rebates for maker is still active

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(expectedMakerRebateFromDefault[0]);
        expect(rates.taker).to.be.equal(takerRates[0] * 10 ); // returns the preferential rate , not the volume


    })

    it("Should add volume based rebates correctly", async () => {

        let rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.maker).to.be.equal(defaultMaker * 10);
        expect(rates.taker).to.be.equal(defaultTaker * 10);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, 0, 0);
        expect(rates.maker).to.be.equal(0);
        expect(rates.taker).to.be.equal(0);

        // fail for account without DEFAULT_ADMIN
        await expect(portfolioSubHelper.connect(trader1).addVolumeBasedRebates(traders,  makerRebates, takerRebates))
            .to.be.revertedWith("AccessControl");

        await expect(portfolioSubHelper.addVolumeBasedRebates([ethers.constants.AddressZero],  makerRebates, takerRebates))
            .to.be.revertedWith("P-LENM-01");

        //Silent fail for 0 address
        await portfolioSubHelper.addVolumeBasedRebates([ethers.constants.AddressZero], [makerRebates[0]], [takerRebates[0]]);
        await portfolioSubHelper.addVolumeBasedRebates([trader1.address], [101], [12]); // maker >100
        await portfolioSubHelper.addVolumeBasedRebates([trader1.address], [10], [100]); // taker >99


        // succeed for owner
        await expect(portfolioSubHelper.addVolumeBasedRebates(traders,  makerRebates, takerRebates))
            .to.emit(portfolioSubHelper, "RateChanged")
            .withArgs("REBATES", "UPDATED", trader1.address, ethers.constants.HashZero, makerRebates[0], takerRebates[0]);



        let i = 0;
        for (const addr of traders) {
            rates = await portfolioSubHelper.getRates(addr, addr, AVAX, defaultMaker, defaultTaker);
            expect(rates.maker).to.be.equal(expectedMakerRebateFromDefault[i]);
            expect(rates.taker).to.be.equal(expectedTakerRebateFromDefault[i]);
            //console.log(addr, rates.makerRate, rates.takerRate);
            i++;
        }

        i = 0;
        for (const addr of traders) {
            rates = await portfolioSubHelper.getRates(addr, addr, ALOT, proposedMaker, proposedTaker);
            expect(rates.maker).to.be.equal(expectedMakerRebateFromProposed[i]);
            expect(rates.taker).to.be.equal(expectedTakerRebateFromProposed[i]);
            //console.log(addr, rates.makerRate, rates.takerRate);
            i++;
        }

        i = 0;
        const takersVerySmall = [9, 5, 5]; // Based on 0 marker fee and only 1 bps(0.01%) taker fee =>  0.009%, 0.005%
        for (const addr of traders) {
            rates = await portfolioSubHelper.getRates(addr, addr, BTC, 0, 1);
            expect(rates.maker).to.be.equal(0);
            expect(rates.taker).to.be.equal(takersVerySmall[i]);
            //console.log(addr, rates.makerRate, rates.takerRate);
            i++;
        }

        // Delete volume rebate
        await expect(portfolioSubHelper.addVolumeBasedRebates([trader1.address],  [0], [0]))
        .to.emit(portfolioSubHelper, "RateChanged")
        .withArgs("REBATES", "UPDATED", trader1.address, ethers.constants.HashZero, 0, 0);
        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, BTC, 14, 20);
        expect(rates.maker).to.be.equal(14 * 10);
        expect(rates.taker).to.be.equal(20 * 10);
    })
})
