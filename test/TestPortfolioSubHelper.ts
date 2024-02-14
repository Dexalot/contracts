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
    const BTCb = Utils.fromUtf8("BTCb");

    const tradePairIds = [AVAX, ALOT ];
    const makerRates = [5, 12];
    const takerRates = [15, 18];
    const defaultMaker = 20;
    const defaultTaker = 30;

    let trader1:SignerWithAddress;

    before(async function () {
        const accounts = await f.getAccounts()
        trader1 = accounts.trader1;
    });

    beforeEach(async function () {

        const PortfolioSubHelper = await ethers.getContractFactory("PortfolioSubHelper");
        portfolioSubHelper = (await upgrades.deployProxy(PortfolioSubHelper)) as PortfolioSubHelper;
        await portfolioSubHelper.deployed();
    });

    it("Should deploy correctly", async () => {
        const { owner } = await f.getAccounts();
        expect(await portfolioSubHelper.hasRole(await portfolioSubHelper.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;

    });

    it("Should not initialize again after deployment", async function () {

        await expect(portfolioSubHelper.initialize())
            .to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should add & remove admin accounts for rates correctly", async () => {
        // fail for non owner
        await expect(portfolioSubHelper.connect(trader1).addAdminAccountForRates(trader1.address, "trader1"))
            .to.be.revertedWith("AccessControl");

        expect(await portfolioSubHelper.adminAccountsForRates(trader1.address)).to.be.false;

        await expect(portfolioSubHelper.addAdminAccountForRates(ethers.constants.AddressZero, "trader1")).to.be.revertedWith("P-ZADDR-01");

        // succeed for owner
        await expect(portfolioSubHelper.addAdminAccountForRates(trader1.address, "trader1"))
            .to.emit(portfolioSubHelper, "AddressSet")
            .withArgs("ADMIN_RATES", "ADD", trader1.address, ethers.constants.HashZero);
        expect(await portfolioSubHelper.adminAccountsForRates(trader1.address)).to.be.true;
        expect(await portfolioSubHelper.isAdminAccountForRates(trader1.address)).to.be.true;


        let rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(0);
        expect(rates.takerRate).to.be.equal(0);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(0);
        expect(rates.takerRate).to.be.equal(0);

        // fail for non owner
        await expect(portfolioSubHelper.connect(trader1).removeAdminAccountForRates(trader1.address))
            .to.be.revertedWith("AccessControl");

        await expect(portfolioSubHelper.removeAdminAccountForRates(trader1.address))
            .to.emit(portfolioSubHelper, "AddressSet")
            .withArgs("ADMIN_RATES", "REMOVE", trader1.address, ethers.constants.HashZero);
        expect(await portfolioSubHelper.adminAccountsForRates(trader1.address)).to.be.false;
        expect(await portfolioSubHelper.isAdminAccountForRates(trader1.address)).to.be.false;

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(defaultMaker);
        expect(rates.takerRate).to.be.equal(defaultTaker);

    })

    it("Should add rebates accounts correctly", async () => {

        let rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(defaultMaker);
        expect(rates.takerRate).to.be.equal(defaultTaker);

        // fail for account without DEFAULT_ADMIN
        await expect(portfolioSubHelper.connect(trader1).addRebateAccountForRates(trader1.address, "trader1", tradePairIds, makerRates, takerRates))
            .to.be.revertedWith("AccessControl");
        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("");

        await expect(portfolioSubHelper.addRebateAccountForRates(ethers.constants.AddressZero, "trader1", tradePairIds, makerRates, takerRates)).to.be.revertedWith("P-ZADDR-01");
        // succeed for owner
        await expect(portfolioSubHelper.addRebateAccountForRates(trader1.address, "trader1", tradePairIds, makerRates, takerRates))
            .to.emit(portfolioSubHelper, "AddressSet")
            .withArgs("REBATE_RATES", "ADD", trader1.address, AVAX);

        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("trader1");
        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        //console.log (rates)
        expect(rates.makerRate).to.be.equal(makerRates[0]);
        expect(rates.takerRate).to.be.equal(takerRates[0]);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(makerRates[1]);
        expect(rates.takerRate).to.be.equal(takerRates[1]);

    })

    it("Should remove tradpairs from rebates accounts for a given account correctly", async () => {


        await expect(portfolioSubHelper.addRebateAccountForRates(trader1.address, "trader1", tradePairIds, makerRates, takerRates))
        .to.emit(portfolioSubHelper, "AddressSet")
            .withArgs("REBATE_RATES", "ADD", trader1.address, AVAX);

        //Fail for non owner
        await expect(portfolioSubHelper.connect(trader1).removeTradePairsFromRebateAccount(trader1.address, tradePairIds)).to.be.revertedWith("AccessControl");
        // No changes
        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("trader1");
        let rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(makerRates[0]);
        expect(rates.takerRate).to.be.equal(takerRates[0]);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(makerRates[1]);
        expect(rates.takerRate).to.be.equal(takerRates[1]);


        await expect(portfolioSubHelper.removeTradePairsFromRebateAccount(trader1.address, [AVAX]))
        .to.emit(portfolioSubHelper, "AddressSet")
            .withArgs("REBATE_RATES", "REMOVE-TRADEPAIR", trader1.address, AVAX);

        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("trader1");

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, AVAX, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(defaultMaker);
        expect(rates.takerRate).to.be.equal(defaultTaker);

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(makerRates[1]);
        expect(rates.takerRate).to.be.equal(takerRates[1]);


        await expect(portfolioSubHelper.removeTradePairsFromRebateAccount(trader1.address, [ALOT]))
        .to.emit(portfolioSubHelper, "AddressSet")
            .withArgs("REBATE_RATES", "REMOVE-TRADEPAIR", trader1.address, ALOT);

        //Removing the tradepair without using  removeRebateAccountForRates but we get back the default rates
        expect(await portfolioSubHelper.organizations(trader1.address)).to.be.equal("trader1");

        rates = await portfolioSubHelper.getRates(trader1.address, trader1.address, ALOT, defaultMaker, defaultTaker);
        expect(rates.makerRate).to.be.equal(defaultMaker);
        expect(rates.takerRate).to.be.equal(defaultTaker);

    })

    it("Should add convertible tokens correctly ", async () => {

        // fail for non owner
        await expect(portfolioSubHelper.connect(trader1).addConvertibleToken(BTCb, BTC))
            .to.be.revertedWith("AccessControl");

        await expect(portfolioSubHelper.addConvertibleToken(ethers.constants.HashZero, BTC))
            .to.be.revertedWith("P-ZADDR-01");
        await expect(portfolioSubHelper.addConvertibleToken(BTCb, ethers.constants.HashZero))
            .to.be.revertedWith("P-ZADDR-01");

        await portfolioSubHelper.addConvertibleToken(BTCb, BTC);

        expect( await portfolioSubHelper.getSymbolToConvert(BTCb)).to.be.equal(BTC);

    })


    it("Should remove convertible tokens correctly ", async () => {

        // fail for non owner
        await expect(portfolioSubHelper.connect(trader1).removeConvertibleToken(BTCb))
            .to.be.revertedWith("AccessControl");

        await portfolioSubHelper.removeConvertibleToken(ethers.constants.HashZero);

        await portfolioSubHelper.removeConvertibleToken(BTCb);

        expect( await portfolioSubHelper.getSymbolToConvert(BTCb)).to.be.equal(ethers.constants.HashZero);

    })

})
