/**
 * The test runner for Dexalot Portfolio Bridge Main
 */

import Utils from "./utils";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    PortfolioBridgeMain,
    PortfolioMain,
    LZEndpointMock,
    MainnetRFQ,
    PortfolioSub,
    MockToken,
    InventoryManager,
    LzV2App,
} from "../typechain-types"

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";


describe("MultiChain Deployments & Interactions", () => {
    let portfolioAvax: PortfolioMain;
    let portfolioArb: PortfolioMain;
    let portfolioBase: PortfolioMain;
    let portfolioGun: PortfolioMain;
    let portfolioSub: PortfolioSub;
    let inventoryManager: InventoryManager;

    let lzEndpointMain: LZEndpointMock;
    let lzEndpointGun: LZEndpointMock;
    let lzEndpointArb: LZEndpointMock;
    let lzEndpointBase: LZEndpointMock;

    let lzAppAvax: LzV2App;
    let lzAppArb: LzV2App;
    let lzAppBase: LzV2App;
    let lzAppGun: LzV2App;

    let portfolioBridgeMain: PortfolioBridgeMain;
    let portfolioBridgeArb: PortfolioBridgeMain;
    let portfolioBridgeBase: PortfolioBridgeMain;
    let portfolioBridgeGun: PortfolioBridgeMain;

    let mainnetRFQAvax: MainnetRFQ;
    let mainnetRFQGun: MainnetRFQ;
    let mainnetRFQArb: MainnetRFQ;
    let mainnetRFQBase: MainnetRFQ;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    const token_decimals = 6;
    let USDTArb: MockToken;
    let USDtAvax: MockToken;

    const portfolios: PortfolioMain[] = [];
    const portfolioBridges: PortfolioBridgeMain[] = [];
    const lzEndpoints: LZEndpointMock[] = [];
    const lzApps: LzV2App[] = [];
    const mainnetRFQs: MainnetRFQ[] = [];
    // const auctionMode: any = 0;

    before(async function () {
        const { owner: owner1, admin: admin1, auctionAdmin: admin2, trader1: t1, trader2: t2 } = await f.getAccounts();
        owner = owner1;
        admin = admin1;
        auctionAdmin = admin2;
        trader1 = t1;
        trader2 = t2;

        console.log("Owner", owner.address);
        console.log("Admin", admin.address);
        console.log("AuctionAdmin", auctionAdmin.address);
        console.log("Trader1", trader1.address);
        console.log("Trader1", trader2.address);
        const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);
        await f.printTokens([portfolioContracts.portfolioAvax, portfolioContracts.portfolioArb, portfolioContracts.portfolioGun], portfolioContracts.portfolioSub, portfolioContracts.portfolioBridgeSub);
    });

    beforeEach(async function () {
        const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);
        portfolioAvax = portfolioContracts.portfolioAvax;
        portfolioArb = portfolioContracts.portfolioArb;
        portfolioBase = portfolioContracts.portfolioBase;
        portfolioGun = portfolioContracts.portfolioGun;
        portfolioSub = portfolioContracts.portfolioSub;

        inventoryManager = portfolioContracts.inventoryManager;

        portfolioBridgeMain = portfolioContracts.portfolioBridgeAvax;
        portfolioBridgeArb = portfolioContracts.portfolioBridgeArb;
        portfolioBridgeBase = portfolioContracts.portfolioBridgeBase;
        portfolioBridgeGun = portfolioContracts.portfolioBridgeGun;

        lzEndpointMain = portfolioContracts.lzEndpointAvax as LZEndpointMock;
        lzEndpointGun = portfolioContracts.lzEndpointGun as LZEndpointMock;
        lzEndpointArb = portfolioContracts.lzEndpointArb as LZEndpointMock;
        lzEndpointBase = portfolioContracts.lzEndpointBase as LZEndpointMock;

        lzAppAvax = portfolioContracts.lzAppAvax;
        lzAppArb = portfolioContracts.lzAppArb;
        lzAppBase = portfolioContracts.lzAppBase;
        lzAppGun = portfolioContracts.lzAppGun;

        mainnetRFQAvax = portfolioContracts.mainnetRFQAvax;
        mainnetRFQGun = portfolioContracts.mainnetRFQGun;
        mainnetRFQArb = portfolioContracts.mainnetRFQArb;
        mainnetRFQBase = portfolioContracts.mainnetRFQBase;
        //Clear the arrays
        portfolios.length = 0;
        portfolioBridges.length = 0;
        lzEndpoints.length = 0;
        mainnetRFQs.length =0;
        //Arrays should have the environment objects in the same order
        portfolios.push(portfolioAvax, portfolioArb, portfolioBase, portfolioGun);
        portfolioBridges.push(portfolioBridgeMain, portfolioBridgeArb, portfolioBridgeBase, portfolioBridgeGun);
        lzEndpoints.push(lzEndpointMain, lzEndpointArb, lzEndpointBase, lzEndpointGun);
        lzApps.push(lzAppAvax, lzAppArb, lzAppBase, lzAppGun);
        mainnetRFQs.push(mainnetRFQAvax, mainnetRFQArb, mainnetRFQBase, mainnetRFQGun);

        // Deploy 2 USDT to be traded as one. 1 for Avax 1 or Arb chains
        USDTArb = await f.deployMockToken("USDT", token_decimals)

        USDtAvax = await f.deployMockToken("USDt", token_decimals)
    });


    it("Should not initialize again after deployment", async function () {
        let counter = 0;
        for (const pb of portfolioBridges) {
            await expect(pb.initialize(lzApps[counter].address, owner.address))
                .to.be.revertedWith("Initializable: contract is already initialized");
            counter++;
        }

    });

    it("Should get portfolio address correctly ", async () => {
        let counter = 0;
        let previousPrtfAddress = "0x";
        for (const pb of portfolioBridges) {
            const prtfAddress = await pb.getPortfolio();
            expect(prtfAddress).to.equal(portfolios[counter].address);
            expect(prtfAddress).not.to.equal(previousPrtfAddress);
            previousPrtfAddress = prtfAddress;
            counter++;
        }
    });

    it("Should portfolio natives be all different ", async () => {
        let previousNative = "0x";
        for (const p of portfolios) {
            const native = await p.native();
            expect(native).not.to.equal(previousNative);
            previousNative = native;
        }
    });

    it("Should Default Destination be set to Dexalot Subnet for all mainnets", async () => {
        const { dexalotSubnet } = f.getChains();
        for (const pb of portfolioBridges) {
            expect(await pb.getDefaultDestinationChain()).to.be.equal(dexalotSubnet.chainListOrgId);
        }
    });


    it("Should all MainnetRFQs & PortfolioBridgeMain proper Roles setup on each other", async () => {
        let counter = 0;
        for (const mrfq of mainnetRFQs) {
            const bridgeUser_role = await portfolioBridges[counter].BRIDGE_USER_ROLE();
            const porfoliobridge_role = await mrfq.PORTFOLIO_BRIDGE_ROLE();
            expect(await mrfq.hasRole(porfoliobridge_role, portfolioBridges[counter].address)).to.be.true;
            expect(await portfolioBridges[counter].hasRole(bridgeUser_role, mrfq.address)).to.be.true;

            counter++;
        }
    });


    it("Should all Portfolios & PortfolioBridgeMain proper Roles setup on each other", async () => {
        let counter = 0;
        for (const p of portfolios) {
            const bridgeUser_role = await portfolioBridges[counter].BRIDGE_USER_ROLE();
            const porfoliobridge_role = await p.PORTFOLIO_BRIDGE_ROLE();
            expect(await portfolioBridges[counter].hasRole(bridgeUser_role, p.address)).to.be.true;
            expect(await p.hasRole(porfoliobridge_role, portfolioBridges[counter].address)).to.be.true;
            counter++;
        }
    });

    it("Should set portfolio", async () => {
        let counter = 0;
        const { chainsArray } = f.getChains();
        for (const pb of portfolioBridges) {
            await pb.grantRole(await pb.DEFAULT_ADMIN_ROLE(), admin.address);
            // fail for non-owner
            await expect(pb.connect(trader1).setPortfolio(portfolios[counter].address)).to.be.revertedWith("AccessControl:");

            // succeed for non-owner
            await pb.setPortfolio(portfolios[counter].address);
            expect(await pb.getPortfolio()).to.be.equal(portfolios[counter].address);
            const tokenDetails = await portfolios[counter].getTokenDetailsById(Utils.fromUtf8(chainsArray[counter].native + chainsArray[counter].chainListOrgId));
            expect(tokenDetails.symbol).to.be.equal(chainsArray[counter].nativeBytes32)
            const tokenNumber = chainsArray[counter].native === "AVAX" ? 2 : 1;
            expect((await pb.getTokenList()).length).to.equal(tokenNumber);
            counter++;
        }
    });


    it("Should not revoke role if it is the only member or portfolio", async () => {
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), mainnetRFQAvax.address))
            .to.emit(portfolioBridgeMain, "RoleUpdated");
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address)).to.be.revertedWith("PB-ALOA-02");
        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
        await expect(portfolioBridgeMain.revokeRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address))
            .to.emit(portfolioBridgeMain, "RoleUpdated")
            .withArgs("PORTFOLIOBRIDGE", "REMOVE-ROLE", await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
    });


    it("Should deposit native portfolioMain & withdraw from Subnet back to original host chain", async () => {
        //const { trader1 } = await f.getAccounts();
        const { chainsArray } = f.getChains();

        let deposit_amount = 10;  // ether
        let counter = 0;

        //await alot.mint(other1.address, (BigNumber.from(2)).mul(Utils.parseUnits(deposit_amount, 18)));
        //await portfolioMain.addToken(ALOT, alot.address, srcChainListOrgId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals));
        for (const p of portfolios) {
            await f.depositNative(p, trader1, deposit_amount.toString());
            expect((await portfolioSub.getBalance(trader1.address, chainsArray[counter].nativeBytes32)).total).to.equal(Utils.toWei(deposit_amount.toString()));
            // no other deposits in the portfolioMain so trader1 subnet balance should be equal
            expect(await ethers.provider.getBalance(p.address)).to.equal(Utils.toWei(deposit_amount.toString()));
            await trader1.getBalance();
            console.log("Portfolio balances", chainsArray[counter].native, Utils.fromWei((await portfolioSub.getBalance(trader1.address, chainsArray[counter].nativeBytes32)).total));
            deposit_amount += 10;
            counter++;
        }

        deposit_amount = 10;
        for (const c of chainsArray) {
            if (c.native === "ALOT") {
                continue;
            }
            const symbolId = Utils.fromUtf8(c.native + c.chainListOrgId);
            console.log("inventory", c.native + c.chainListOrgId, Utils.fromWei(await inventoryManager.get(c.nativeBytes32, symbolId)));
            expect(await inventoryManager.get(c.nativeBytes32, symbolId)).to.be.equal(Utils.toWei(deposit_amount.toString()));
            deposit_amount += 10;
        }

        // let endBalance = await trader1.getBalance();
        // // Because it is local, all native deposits are coming from the same chain.
        // expect(endBalance).to.be.greaterThan(initial_amount.sub(Utils.toWei('61'))); // Added 1 for gas
        // expect(await trader1.getBalance()).to.be.lessThan(initial_amount.sub(Utils.toWei('59'))); // removed 1 for gas

        deposit_amount = 10;
        counter = 0;
        for (const p of portfolios) {
            const cDetails = chainsArray[counter];
            const amount = (deposit_amount / 2).toString();
            console.log("chain to withdraw", cDetails.native + cDetails.chainListOrgId, cDetails.chainListOrgId, amount);
            await f.withdrawTokenToDst(portfolioSub, trader1, cDetails.nativeBytes32, cDetails.evm_decimals, amount, cDetails.chainListOrgId)
            expect((await portfolioSub.getBalance(trader1.address, cDetails.nativeBytes32)).total).to.equal(Utils.toWei(amount));
            // no other deposits in the portfolioMain so trader1 subnet balance should be equal
            expect(await ethers.provider.getBalance(p.address)).to.equal(Utils.toWei(amount));
            deposit_amount += 10;
            counter++;
        }


        deposit_amount = 10;
        counter = 0;
        for (const c of chainsArray) {
            if (c.native === "ALOT") {
                continue;
            }
            const symbolId = Utils.fromUtf8(c.native + c.chainListOrgId);
            expect(await inventoryManager.get(c.nativeBytes32, symbolId)).to.be.equal(Utils.toWei((deposit_amount / 2).toString()));
            console.log("inventory", c.native, Utils.fromWei(await inventoryManager.get(c.nativeBytes32, symbolId)));
            deposit_amount += 10;
        }
    });

    it("Should add USDT from two different mainnets to be traded as one", async () => {
        await USDtAvax.connect(trader1).approve(portfolioAvax.address, ethers.constants.MaxUint256);


        await f.addToken(portfolioAvax, portfolioSub, USDtAvax, 0.5, 0, true, 0);
        await f.addToken(portfolioArb, portfolioSub, USDTArb, 0.5, 0, true, 0, "USDt");
        //await f.addTokenSingleEnv(portfolioArb, USDTArb, 0.5, 0, true, 0);

        //await portfolioBridgeSub.addToken(Utils.fromUtf8("USDT"), USDTArb.address, arbitrumChain.chainListOrgId, arbitrumChain.evm_decimals, 0);

        //await f.addToken(portfolioArb, portfolioSub, USDTArb, 0.5, 0, true, 0);
        // console.log("After");
        // await f.printTokens([portfolioAvax, portfolioArb], portfolioSub, portfolioBridgeSub);

        //await USDtAvax.mint(trader1.address, Utils.parseUnits(deposit_amount.toString(), 18));

        //wait f.depositToken(portfolioMain, other1, alot, 18, ALOT, deposit_amount, 0);
    });


    it("Should deposit ERC20 portfolioMain & withdraw from Subnet back to original host chain", async () => {

        const { cChain, arbitrumChain } = f.getChains();

        const mint_amount = 100;  // ether

        await f.addToken(portfolioAvax, portfolioSub, USDtAvax, 0.5, 0, true, 0);
        await f.addToken(portfolioArb, portfolioSub, USDTArb, 0.5, 0, true, 0, "USDt");

        await USDtAvax.mint(trader1.address, Utils.parseUnits(mint_amount.toString(), token_decimals));
        await USDTArb.mint(trader1.address, Utils.parseUnits(mint_amount.toString(), token_decimals));

        await USDtAvax.connect(trader1).approve(portfolioAvax.address, ethers.constants.MaxUint256);
        await USDTArb.connect(trader1).approve(portfolioArb.address, ethers.constants.MaxUint256);


        const deposit_amount = "10";

        // console.log("After");
        // await f.printTokens([portfolioAvax, portfolioArb], portfolioSub, portfolioBridgeSub);

        await f.depositToken(portfolioAvax, trader1, USDtAvax, token_decimals, Utils.fromUtf8("USDt"), deposit_amount);
        expect((await portfolioSub.getBalance(trader1.address, Utils.fromUtf8("USDt"))).total).to.equal(Utils.parseUnits(deposit_amount, token_decimals));

        // //expect(await ethers.provider.getBalance(portfolioAvax.address)).to.equal(Utils.toWei(deposit_amount.toString()));

        await f.depositToken(portfolioArb, trader1, USDTArb, token_decimals, Utils.fromUtf8("USDT"), deposit_amount);
        let totalDeposits = 20;
        expect((await portfolioSub.getBalance(trader1.address, Utils.fromUtf8("USDt"))).total).to.equal(Utils.parseUnits(totalDeposits.toString(), token_decimals));

        //expect(await ethers.provider.getBalance(portfolioAvax.address)).to.equal(Utils.toWei(deposit_amount.toString()));

        const symbol = Utils.fromUtf8("USDt");
        let symbolId = Utils.fromUtf8("USDt" + cChain.chainListOrgId);
        expect(await inventoryManager.get(symbol, symbolId)).to.be.equal(Utils.parseUnits(deposit_amount, token_decimals));
        console.log("inventory", Utils.toUtf8(symbolId), Utils.formatUnits((await inventoryManager.get(symbol, symbolId)), token_decimals));
        // symbol = Utils.fromUtf8("USDt");
        symbolId = Utils.fromUtf8("USDT" + arbitrumChain.chainListOrgId);
        expect(await inventoryManager.get(symbol, symbolId)).to.be.equal(Utils.parseUnits(deposit_amount, token_decimals));
        console.log("inventory", Utils.toUtf8(symbolId), Utils.formatUnits((await inventoryManager.get(symbol, symbolId)), token_decimals));

        const withdraw_amount = (Number(deposit_amount) / 2).toString();
        const cChainfee = await portfolioSub.getBridgeFee(0, cChain.chainListOrgId, symbol, Utils.parseUnits(withdraw_amount, token_decimals));
        console.log("Fee", Utils.formatUnits(cChainfee, token_decimals));

        await f.withdrawTokenToDst(portfolioSub, trader1, symbol, token_decimals, withdraw_amount, cChain.chainListOrgId)
        totalDeposits = totalDeposits - 5;

        expect((await portfolioSub.getBalance(trader1.address, symbol)).total).to.equal(Utils.parseUnits(totalDeposits.toString(), token_decimals));
        // no other deposits in the portfolioMain so trader1 subnet balance should be equal
        expect(await USDtAvax.balanceOf(portfolioAvax.address)).to.equal(Utils.parseUnits(withdraw_amount, token_decimals).add(cChainfee));

        const arbFee = await portfolioSub.getBridgeFee(0, arbitrumChain.chainListOrgId, symbol, Utils.parseUnits(withdraw_amount, token_decimals));
        console.log("Fee", Utils.formatUnits(arbFee, token_decimals));
        await f.withdrawTokenToDst(portfolioSub, trader1, symbol, token_decimals, withdraw_amount, arbitrumChain.chainListOrgId);
        totalDeposits = totalDeposits - 5;
        expect((await portfolioSub.getBalance(trader1.address, symbol)).total).to.equal(Utils.parseUnits(totalDeposits.toString(), token_decimals));
        // no other deposits in the portfolioMain so trader1 subnet balance should be equal
        expect(await USDTArb.balanceOf(portfolioArb.address)).to.equal(Utils.parseUnits(withdraw_amount, token_decimals).add(arbFee));

        symbolId = Utils.fromUtf8("USDt" + cChain.chainListOrgId);
        expect(await inventoryManager.get(symbol, symbolId)).to.be.equal(Utils.parseUnits(withdraw_amount, token_decimals).add(cChainfee));
        console.log("inventory", Utils.toUtf8(symbolId), Utils.formatUnits((await inventoryManager.get(symbol, symbolId)), token_decimals));

        symbolId = Utils.fromUtf8("USDT" + arbitrumChain.chainListOrgId);
        expect(await inventoryManager.get(symbol, symbolId)).to.be.equal(Utils.parseUnits(withdraw_amount, token_decimals).sub(arbFee));
        console.log("inventory", Utils.toUtf8(symbolId), Utils.formatUnits((await inventoryManager.get(symbol, symbolId)), token_decimals));

        // Try to withdraw the entire USDt inventory to Arbitrum
        expect(await portfolioSub.tokenTotals(symbol)).to.be.equal(Utils.parseUnits(deposit_amount, token_decimals).add(cChainfee).add(arbFee))
        await expect(f.withdrawTokenToDst(portfolioSub, trader1, Utils.fromUtf8("USDt"), token_decimals, deposit_amount, arbitrumChain.chainListOrgId)).to.be.revertedWith("IM-INVT-02");


    });
});
