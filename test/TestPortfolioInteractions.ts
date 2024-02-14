/**
 * The test runner for Dexalot Portfolio Interactions
 * Please DO test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import {
    PortfolioBridgeMain,
    PortfolioMain,
    PortfolioSub,
    MockToken,
    GasStation,
    TokenVestingCloneable,
    BannedAccounts__factory,
    TokenVestingCloneFactory,
    TokenVestingCloneable__factory,
    PortfolioBridgeSub,
} from '../typechain-types'

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe("Portfolio Interactions", () => {
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let portfolioBridgeMain: PortfolioBridgeMain;
    let portfolioBridgeSub: PortfolioBridgeSub;

    let TokenVestingCloneable: TokenVestingCloneable__factory;

    let gasStation: GasStation;

    let token_symbol: string;
    let token_decimals: number;
    let usdt: MockToken;
    let USDT: string;

    let alot_token_symbol: string;
    let alot_token_decimals: number;
    let alot: MockToken;
    let ALOT: string;

    // let avax_decimals: number;

    let mint_amount: string;
    let defaultDestinationChainId: number;

    let deposit_amount: string;
    let deposit_amount_less_fee: string;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    before(async () => {
        const { owner: owner1, admin: admin1, auctionAdmin: admin2, trader1: t1, trader2: t2 } = await f.getAccounts();
        owner = owner1;
        admin = admin1;
        auctionAdmin = admin2;
        trader1 = t1;
        trader2 = t2;


        console.log("Owner", owner.address);
        console.log("Admin", admin.address );
        console.log("AuctionAdmin", auctionAdmin.address);
        console.log("Trader1", trader1.address);
        console.log("Trader2", trader2.address);

        TokenVestingCloneable = await ethers.getContractFactory("TokenVestingCloneable") as TokenVestingCloneable__factory;
    })

    beforeEach(async function () {

        const portfolioContracts = await f.deployCompletePortfolio(true);
        portfolioMain = portfolioContracts.portfolioAvax;
        portfolioSub = portfolioContracts.portfolioSub;
        portfolioBridgeMain = portfolioContracts.portfolioBridgeAvax;
        portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
        gasStation= portfolioContracts.gasStation;
        alot = portfolioContracts.alot;

        defaultDestinationChainId = await portfolioBridgeSub.getDefaultDestinationChain();

        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await f.deployMockToken(token_symbol, token_decimals)
        USDT = Utils.fromUtf8(token_symbol);

        alot_token_symbol = "ALOT";
        alot_token_decimals = 18;

        ALOT = Utils.fromUtf8(alot_token_symbol);
        // avax_decimals = 18;

        mint_amount = '1000'
        deposit_amount = '200';  // ether
        deposit_amount_less_fee = (parseFloat(deposit_amount)).toString();
    });

    it("Should include BRIDGE_USER_ROLE in PortfolioBridge by default", async function () {
        console.log("Owner", owner.address);
        console.log("Admin", admin.address );
        console.log("AuctionAdmin", auctionAdmin.address);
        console.log("Trader1", trader1.address);

        const role = await portfolioMain.PORTFOLIO_BRIDGE_ROLE();

        expect(await portfolioMain.hasRole(role, portfolioBridgeMain.address)).to.be.true;
        expect(await portfolioSub.hasRole(role, portfolioBridgeSub.address)).to.be.true;

        //Can't remove itself from PORTFOLIO_ROLE
        await expect(portfolioMain.revokeRole(role, portfolioMain.address)).to.be.revertedWith("P-ALOA-02");
        await expect(portfolioSub.revokeRole(role, portfolioSub.address)).to.be.revertedWith("P-ALOA-02");
    });

    // AVAX
    it("Should deposit native tokens to portfolio", async () => {
        await owner.sendTransaction({to: portfolioMain.address, value: Utils.toWei(deposit_amount)});
        const res = await portfolioSub.getBalance(owner.address, Utils.fromUtf8("AVAX"));
        expect(res.total).to.equal(Utils.toWei(deposit_amount_less_fee));
        expect(res.available).to.equal(Utils.toWei(deposit_amount_less_fee));
    });

    // ALOT, SLIME, ...
    it("Should deposit ERC20 token to portfolio using depositToken()", async () => {
        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5); //gasSwapRatio 0.5

        await usdt.mint(owner.address, Utils.toWei(mint_amount));

        await usdt.approve(portfolioMain.address, Utils.toWei(deposit_amount));
        // fail paused
        await portfolioMain.connect(owner).pause()
        await expect(portfolioMain.depositToken(trader2.address, USDT, Utils.toWei(deposit_amount), 0)).to.be.revertedWith("Pausable: paused")
        await portfolioMain.connect(owner).unpause()
        // fail for account other then msg.sender
        await expect(portfolioMain.depositToken(trader2.address, USDT, Utils.toWei(deposit_amount), 0)).to.be.revertedWith("P-OODT-01");
        // fail for banned account
        const bannedAccountsAddr = await portfolioMain.getBannedAccounts();
        const BannedAccounts = await ethers.getContractFactory("BannedAccounts") as BannedAccounts__factory;
        const bannedAccounts = BannedAccounts.attach(bannedAccountsAddr);
        await bannedAccounts.grantRole(await bannedAccounts.BAN_ADMIN_ROLE(), owner.address);
        await bannedAccounts.banAccount(owner.address, 1); // 1=REASON is OFAC
        await expect(portfolioMain.depositToken(owner.address, USDT, Utils.toWei(deposit_amount), 0)).to.be.revertedWith("P-BANA-01");
        // succeed for msg.sender
        await bannedAccounts.unbanAccount(owner.address);
        await portfolioMain.depositToken(owner.address, USDT, Utils.toWei(deposit_amount), 0);

        const res = await portfolioSub.getBalance(owner.address, USDT);
        expect(res.total).to.equal(Utils.toWei(deposit_amount_less_fee));
        expect(res.available).to.equal(Utils.toWei(deposit_amount_less_fee));
     });

    // ALOT, SLIME, ...
    it("Should deposit ERC20 token to portfolio using depositTokenFromContract()", async () => {

        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5); //gasSwapRatio 0.5
        await usdt.mint(owner.address, Utils.toWei(mint_amount));

        await usdt.approve(portfolioMain.address, Utils.toWei(deposit_amount));
        // fail if msg.sender is not in trusted contracts
        await expect(portfolioMain.depositTokenFromContract(trader2.address, USDT, Utils.toWei(deposit_amount))).to.be.revertedWith("P-AOTC-01");

        await portfolioMain.addTrustedContract(owner.address, "TESTING");
        // fail if quantity is 0
        await expect(portfolioMain.depositTokenFromContract(trader2.address, USDT, 0)).to.be.revertedWith("P-DUTH-01");
        // fail if token is non-existent
        await expect(portfolioMain.depositTokenFromContract(trader2.address, Utils.fromUtf8("NONE"), Utils.toWei(deposit_amount))).to.be.revertedWith("P-ETNS-01");
        // fail for quantity more than balance
        await expect(portfolioMain.depositTokenFromContract(owner.address, USDT, Utils.toWei('1001'))).to.revertedWith("P-NETD-01");
    });

    // ALOT, SLIME ..
    it("Should withdraw ERC20 token from portfolio to mainnet", async () => {

        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5); //gasSwapRatio 0.5
        //"PB-SINA-01"
        await usdt.mint(owner.address, Utils.toWei(mint_amount));

        await usdt.approve(portfolioMain.address, Utils.toWei(deposit_amount));
        await portfolioMain.depositToken(owner.address, USDT, Utils.toWei(deposit_amount), 0);
        const withdrawal_amount = '100';
        const remaining_amount: number = Number(deposit_amount_less_fee) - parseFloat(withdrawal_amount)


        // fail for account other then msg.sender
        await expect(portfolioSub.connect(owner)["withdrawToken(address,bytes32,uint256,uint8)"](trader2.address, USDT, Utils.toWei(withdrawal_amount), 0)).to.be.revertedWith("P-OOWT-01");
        await expect(portfolioSub.connect(owner)["withdrawToken(address,bytes32,uint256,uint8,uint32)"](trader2.address, USDT, Utils.toWei(withdrawal_amount), 0, defaultDestinationChainId)).to.be.revertedWith("P-OOWT-01");
        // fail for 0 quantity
         await expect(f.withdrawToken(portfolioSub, owner, USDT, token_decimals, '0')).to.be.revertedWith("P-WUTH-01");
        // fail for non-existent token
         await expect(f.withdrawToken(portfolioSub, owner, Utils.fromUtf8("NONE"), token_decimals, withdrawal_amount)).to.be.revertedWith("P-ETNS-02");
        // succeed for msg.sender
        await f.withdrawToken(portfolioSub, owner, USDT, token_decimals, withdrawal_amount)
        const res = await portfolioSub.getBalance(owner.address, USDT);
        // Utils.printResults(owner.address, "after withdrawal", res, token_decimals);
        expect(parseFloat(Utils.fromWei(res.total)).toFixed(12)).to.equal(remaining_amount.toFixed(12));
        expect(parseFloat(Utils.fromWei(res.available)).toFixed(12)).to.equal(remaining_amount.toFixed(12));

        expect(await usdt.balanceOf(owner.address)).to.equal(
            Utils.toWei(mint_amount)
            .sub(Utils.toWei(deposit_amount))
            .add(Utils.toWei(withdrawal_amount))
        );
    });

    // AVAX ..
    it("Should withdraw AVAX from portfolio to mainnet", async () => {

        const initial_amount = await owner.getBalance();

        const tx: any = await owner.sendTransaction({to: portfolioMain.address, value: Utils.toWei(deposit_amount)});
        const txRes: any = await tx.wait()

        const withdrawal_amount = '100';
        const remaining_amount: number = Number(deposit_amount_less_fee) - parseFloat(withdrawal_amount)
        // fail for account other then msg.sender
               // fail for account other then msg.sender
        await expect(portfolioSub.connect(owner)["withdrawToken(address,bytes32,uint256,uint8)"](trader2.address, Utils.fromUtf8("AVAX"), Utils.toWei(withdrawal_amount), 0)).to.be.revertedWith("P-OOWT-01");
        await expect(portfolioSub.connect(owner)["withdrawToken(address,bytes32,uint256,uint8,uint32)"](trader2.address, Utils.fromUtf8("AVAX"), Utils.toWei(withdrawal_amount), 0, defaultDestinationChainId)).to.be.revertedWith("P-OOWT-01");
        // fail for 0 quantity
        await expect(f.withdrawToken(portfolioSub, owner, Utils.fromUtf8("AVAX"), token_decimals, '0')).to.be.revertedWith("P-WUTH-01");
        // fail for non-existent token
        await expect(f.withdrawToken(portfolioSub, owner, Utils.fromUtf8("NONE"), token_decimals, withdrawal_amount)).to.be.revertedWith("P-ETNS-02");
         // succeed for msg.sender
        await f.withdrawToken(portfolioSub, owner, Utils.fromUtf8("AVAX"), token_decimals, withdrawal_amount)
        const res = await portfolioSub.getBalance(owner.address, Utils.fromUtf8("AVAX"));
        // Utils.printResults(owner.address, "after withdrawal", res, avax_decimals);
        expect(parseFloat(Utils.fromWei(res.total)).toFixed(12)).to.equal(remaining_amount.toFixed(12));
        expect(parseFloat(Utils.fromWei(res.available)).toFixed(12)).to.equal(remaining_amount.toFixed(12));

        expect((await owner.getBalance()).toString().slice(0, 6)).to.equal(
            ethers.BigNumber.from(initial_amount)
            .sub(Utils.toWei(deposit_amount))
            .add(Utils.toWei(withdrawal_amount))
            .sub(txRes.effectiveGasPrice.mul(txRes.gasUsed))
            .toString().slice(0, 6)
        );
    });

    // Works individually but not works in coverage
    it("Should send Gas Token if it is not enough", async () => {
        const { other1 } = await f.getAccounts();
        await f.addToken(portfolioMain, portfolioSub, usdt, 0.1); //gasSwapRatio 0.5

        await usdt.mint(other1.address, ethers.utils.parseEther("1000"));
        await gasStation.setGasAmount(ethers.utils.parseEther("10"))

        const balance1 = await other1.getBalance();
        const value1 = (balance1).sub(ethers.utils.parseEther("10"));
        await other1.sendTransaction({
            to: owner.address,
            value: value1,
            gasPrice: ethers.utils.parseUnits('8', 'gwei')
        })

        expect((await portfolioSub.getBalance(other1.address, ALOT)).total).to.be.equal(0)

        const beforeBalance = await other1.getBalance()
        await usdt.connect(other1).approve(portfolioMain.address, Utils.parseUnits("500", token_decimals));
        const tx = await portfolioMain.connect(other1).depositToken(other1.address, USDT, Utils.parseUnits("500", token_decimals), 0);
        const receipt = await tx.wait()

        console.log ("cur bal", ethers.utils.formatEther(await other1.getBalance()),"bef" , ethers.utils.formatEther(beforeBalance)
                 , "gused", ethers.utils.formatEther(receipt.effectiveGasPrice.mul(receipt.gasUsed)) )

        expect((await other1.getBalance()).add(receipt.effectiveGasPrice.mul(receipt.gasUsed))).to.be.lt(beforeBalance.toString())

        expect((await portfolioSub.getBalance(other1.address, USDT)).total).to.be.equal(Utils.parseUnits("500", token_decimals))

        expect((await portfolioSub.getBalance(await portfolioSub.getTreasury(), USDT)).available).to.be.equal(0)
    });


    it("Should reduce bridge fee during AVAX deposit and withdraw & collect them", async () => {
        const bridgeFee = Utils.toWei("0.01")

        await portfolioMain.setBridgeParam(Utils.fromUtf8("AVAX"), bridgeFee, ethers.utils.parseUnits('0.1',token_decimals), true)
        await portfolioBridgeSub.setBridgeFees(defaultDestinationChainId, [Utils.fromUtf8("AVAX")], [bridgeFee])
        // fail paused
        await portfolioMain.connect(owner).pause()
        await expect(f.depositNative(portfolioMain, trader1, "0.009")).to.be.revertedWith("Pausable: paused")
        await portfolioMain.connect(owner).unpause()

        // fail if it is under the threshold
        await expect(f.depositNative(portfolioMain, trader1, "0.009")).to.be.revertedWith("P-DUTH-01")

        await f.depositNative(portfolioMain, trader1, "10")

        expect((await portfolioMain.bridgeFeeCollected(Utils.fromUtf8("AVAX"))).toString()).to.equal(bridgeFee)

        //fail for non-admin
        await expect(portfolioMain.connect(trader1).collectNativeBridgeFees())
        .to.be.revertedWith("AccessControl: account")

        const ownerBeforeBalance = await owner.getBalance()
        const ctx = await portfolioMain.collectNativeBridgeFees()
        const creceipt: any = await ctx.wait()
        const ownerAfterBalance = await owner.getBalance()

        expect(ownerAfterBalance.add((creceipt.gasUsed).mul(creceipt.effectiveGasPrice)).sub(ownerBeforeBalance).toString()).to.equal(bridgeFee)

        expect((await portfolioSub.getBalance(trader1.address, Utils.fromUtf8("AVAX"))).total.toString())
        .to.equal(ethers.utils.parseEther("10").sub(ethers.BigNumber.from(bridgeFee)).toString())

        // revert for amount < bridge fee
        await expect(f.withdrawToken(portfolioSub, trader1, Utils.fromUtf8("AVAX"), 18, "0.009"))
        .to.be.revertedWith("P-WUTH-01")

        // revert for amount = bridge fee
        await expect(f.withdrawToken(portfolioSub, trader1, Utils.fromUtf8("AVAX"), 18, "0.01"))
        .to.be.revertedWith("P-WUTH-01")


        const beforeBalance = await trader1.getBalance()
        const tx = await f.withdrawToken(portfolioSub, trader1, Utils.fromUtf8("AVAX"), 18, "5")
        const receipt = await tx.wait()
        const afterBalance = await trader1.getBalance()

        expect((await portfolioSub.getBalance(await portfolioSub.getTreasury(), Utils.fromUtf8("AVAX"))).total.toString()).to.equal(bridgeFee)

        expect(afterBalance.add((receipt.gasUsed).mul(receipt.effectiveGasPrice)).sub(beforeBalance).toString())
        .to.equal(ethers.utils.parseEther("5").sub(ethers.BigNumber.from(bridgeFee)).toString())
    });

    it("Should reduce bridge fee during ALOT deposit and withdraw & collect them", async () => {
        const bridgeFee = Utils.toWei("0.01")

        await alot.mint(trader1.address, ethers.utils.parseUnits('100',alot_token_decimals))
        await portfolioMain.setBridgeParam(ALOT, bridgeFee, ethers.utils.parseUnits('1',token_decimals), true)
        await portfolioBridgeSub.setBridgeFees(defaultDestinationChainId, [ALOT], [bridgeFee])
        //no bridge fee to collect, // Silent exit
        await portfolioMain.collectBridgeFees([ALOT]);
        expect(await portfolioBridgeSub.getBridgeFee(0, defaultDestinationChainId, ALOT)).to.be.equal(bridgeFee);
        expect( (await portfolioMain.bridgeParams(ALOT)).gasSwapRatio).to.be.equal(ethers.utils.parseUnits('1',alot_token_decimals));
        expect( (await portfolioSub.bridgeParams(ALOT)).gasSwapRatio).to.be.equal(ethers.utils.parseUnits('1',alot_token_decimals));

        // fail if it is under the threshold
        await expect(f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT, '1')).to.be.revertedWith("P-DUTH-01")

        await f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT, "10")

        //fail for non-admin
        await expect(portfolioMain.connect(trader1).collectBridgeFees([ALOT]))
        .to.be.revertedWith("AccessControl: account")

        //fail for non-existent token
        await expect(portfolioMain.collectBridgeFees([USDT]))
        .to.be.revertedWith("P-ETNS-02")

        const ownerTokenBeforeBalance = await alot.balanceOf(owner.address)
        await portfolioMain.collectBridgeFees([ALOT])
        const ownerTokenAfterBalance = await alot.balanceOf(owner.address)
        expect(ownerTokenAfterBalance.sub(ownerTokenBeforeBalance).toString()).to.equal(bridgeFee)

        expect((await portfolioSub.getBalance(trader1.address, ALOT)).total.toString())
        .to.equal(ethers.utils.parseEther("10").sub(ethers.BigNumber.from(bridgeFee)).toString())

        const traderTokenBeforeBalance = await alot.balanceOf(trader1.address)

        // revert for amount <= bridge fee
        await expect(f.withdrawToken(portfolioSub, trader1, ALOT, alot_token_decimals, "0.01"))
        .to.be.revertedWith("P-WUTH-01")


        await f.withdrawToken(portfolioSub, trader1, ALOT, alot_token_decimals, "5")

        expect((await portfolioSub.getBalance(await portfolioSub.getTreasury(), ALOT)).total.toString()).to.equal(bridgeFee)

        const traderTokenAfterBalance = await alot.balanceOf(trader1.address)

        expect(traderTokenAfterBalance.sub(traderTokenBeforeBalance).toString())
        .to.equal(ethers.utils.parseEther("5").sub(ethers.BigNumber.from(bridgeFee)).toString())
    });

    it("Should not deposit if it the parameters are incorrect", async () => {

        await expect(portfolioMain.connect(trader1).depositNative(
            trader2.address,
            0,
            {
                value: ethers.utils.parseEther("1"),
            }
        )).to.be.revertedWith("P-OOWN-02")

        await usdt.mint(trader1.address, ethers.utils.parseEther("100"))
        await usdt.connect(trader1).approve(portfolioMain.address, ethers.utils.parseEther("100"))

        await expect(portfolioMain.connect(trader1).depositToken(
            trader2.address,
            USDT,
            ethers.utils.parseEther("1"),
            0
        )).to.be.revertedWith("P-OODT-01")
    })

    it("Should not deposit if the amount is less than gasSwapRatios", async () => {

        await portfolioMain.setBridgeParam(Utils.fromUtf8("AVAX"), 0, ethers.utils.parseEther("10"), true);
        await portfolioSub.setBridgeParam(Utils.fromUtf8("AVAX"), 0, ethers.utils.parseEther("10"), true);

        await expect(f.depositNative(portfolioMain, trader1, "9")).to.be.revertedWith("P-DUTH-01")
        await alot.mint(trader1.address, ethers.utils.parseEther("100"))

        //Get Min Alot deposit   1*1.9
        const minDepAmnt = ethers.utils.formatEther(await portfolioMain.getMinDepositAmount(ALOT));

        await expect(f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT, minDepAmnt)).to.be.revertedWith("P-DUTH-01")
    })

    it("Should not deposit if the token only exists in mainnet", async () => {
        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5);
        await usdt.mint(trader1.address, ethers.utils.parseEther("100"))
        // This should technically fail in PortfolioSub, but doesn't revert because it is blocked by the bridge contract and revert is not propogated back
        //await expect(f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, "5")).to.be.revertedWith("P-ETNS-01")
    })

    it("Should not deposit or withdraw if the bridge is not enabled", async () => {

        // no need to add ALOT to subnet as it is added while deploying portfolioSub
        await alot.mint(trader1.address, ethers.utils.parseEther("100"))
        await f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT, "50")
        const bridge =1 // Celer

        // bridge not enabled in main
        await portfolioMain.enableBridgeProvider(bridge, false)
        await expect(f.depositNativeWithContractCall(portfolioMain, trader1, "5", bridge)).to.be.revertedWith("PB-RBNE-01")
        await expect(f.depositToken(portfolioMain, trader1, alot, alot_token_decimals, ALOT, "5", bridge)).to.be.revertedWith("PB-RBNE-01")

        // bridge-enabled in main but not in sub
        await portfolioMain.enableBridgeProvider(bridge, true)
        await portfolioSub.enableBridgeProvider(bridge, false)
        await expect(f.depositNativeWithContractCall(portfolioMain, trader1, "5", bridge)).to.be.revertedWith("PB-RBNE-02");// Deposit can't go through

        // bridge-not enabled in sub
        await portfolioMain.enableBridgeProvider(bridge, true)
        await portfolioSub.enableBridgeProvider(bridge, false)
        await expect(f.withdrawToken(portfolioSub, trader1, ALOT, alot_token_decimals, "5", bridge)).to.be.revertedWith("PB-RBNE-01")

        // withdraw-enabled in sub but not in main
        await portfolioMain.enableBridgeProvider(bridge, false)
        await portfolioSub.enableBridgeProvider(bridge, true)
        await expect(f.withdrawToken(portfolioSub, trader1, ALOT, alot_token_decimals, "5", bridge)).to.be.revertedWith("PB-RBNE-02"); // Withdraw can't go through
    })

    it("Should pause and unpause Portfolio deposit from the admin account", async function () {
        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5); //gasSwapRatio 0.5

        await usdt.mint(owner.address, Utils.toWei(mint_amount));
        // fail from non admin accounts
        await expect(portfolioMain.connect(trader1).pauseDeposit(true)).to.revertedWith("AccessControl:");
        await expect(portfolioMain.connect(admin).pauseDeposit(true)).to.revertedWith("AccessControl:");
        // succeed from admin accounts
        await portfolioMain.grantRole(await portfolioMain.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolioMain.connect(admin).pauseDeposit(true);
        // fail when paused
        await expect(owner.sendTransaction({to: portfolioMain.address, value: Utils.toWei('1000')})).to.revertedWith("P-NTDP-01");
        // fail depositToken() when paused
        await expect(f.depositToken(portfolioMain, owner, usdt, token_decimals, USDT,  '10')).to.revertedWith("P-NTDP-01");
        // fail depositTokenFromContract() when paused
        await portfolioMain.addTrustedContract(owner.address, "TESTING");
        await expect(portfolioMain.depositTokenFromContract(owner.address, USDT, Utils.toWei('10'))).to.revertedWith("P-NTDP-01");
        // allow deposits
        await portfolioMain.connect(admin).pauseDeposit(false);
        // fail with 0 quantity for depositToken()
        await expect(portfolioMain.depositToken(owner.address, USDT, 0, 0)).to.revertedWith("P-DUTH-01");
        // fail for non-existent token for depositToken()
        await expect(portfolioMain.depositToken(owner.address, Utils.fromUtf8("NONE"), Utils.toWei('100'), 0)).to.revertedWith("P-ETNS-01");
        // fail for quantity more than balance for depositToken()
        await expect(portfolioMain.depositToken(owner.address, USDT, Utils.toWei('1001'), 0)).to.revertedWith("P-NETD-01");
        // fail with 0 quantity for depositTokenFromContract()
        await expect(portfolioMain.depositTokenFromContract(owner.address, USDT, 0)).to.revertedWith("P-DUTH-01");
        // fail for non-existent token for depositTokenFromContract()
        await expect(portfolioMain.depositTokenFromContract(owner.address, Utils.fromUtf8("NONE"), Utils.toWei('100'))).to.revertedWith("P-ETNS-01");
        // fail for quantity more than balance for depositTokenFromContract()
        await expect(portfolioMain.depositTokenFromContract(owner.address, USDT, Utils.toWei('1001'))).to.revertedWith("P-NETD-01");
        // succeed for native
        await owner.sendTransaction({to: portfolioMain.address, value: Utils.toWei('1000')});
        const bal = await portfolioSub.getBalance(owner.address, Utils.fromUtf8("AVAX"));
        expect(bal.total).to.be.equal(Utils.toWei('1000'));
        expect(bal.available).to.be.equal(Utils.toWei('1000'));
    });

    it("Should add a trusted contract to Portfolio from the admin account", async function () {
        const start = await f.latestTime() + 10000;
        const cliff = 20000;
        const duration = 120000;
        const startPortfolioDeposits = start - 10000;
        const revocable = true;
        const percentage = 15;
        const period = 0;

        const factory: TokenVestingCloneFactory = await f.deployTokenVestingCloneFactory();
        await factory.createTokenVesting(trader2.address, start, cliff, duration, startPortfolioDeposits,
            revocable, percentage, period, portfolioMain.address, owner.address);
        const count = await factory.count();
        const tokenVesting: TokenVestingCloneable = TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5); //gasSwapRatio 0.5

        await usdt.mint(owner.address, Utils.toWei('10000'));

        await expect(usdt.transfer(tokenVesting.address, Utils.toWei('1000')))
                .to.emit(usdt, "Transfer")
                .withArgs(owner.address, tokenVesting.address, Utils.toWei('1000'));

        // fail from non admin accounts
        await expect(portfolioMain.connect(trader1).addTrustedContract(tokenVesting.address, "Dexalot")).to.revertedWith("AccessControl:");
        expect(await portfolioMain.isTrustedContract(tokenVesting.address)).to.be.false;
        // succeed from admin accounts
        await portfolioMain.connect(owner).addTrustedContract(tokenVesting.address, "Dexalot");
        expect(await portfolioMain.isTrustedContract(tokenVesting.address)).to.be.true;

        await ethers.provider.send("evm_increaseTime", [5000]);
        await ethers.provider.send("evm_mine", []);

        await usdt.connect(trader2).approve(tokenVesting.address, Utils.toWei('150'));
        await usdt.connect(trader2).approve(portfolioMain.address, Utils.toWei('150'));
        await tokenVesting.connect(trader2).releaseToPortfolio(usdt.address);
        expect((await portfolioSub.getBalance(trader2.address, USDT))[0]).to.equal(Utils.toWei('150'));
        expect(await usdt.balanceOf(trader2.address)).to.equal(0);
    });

    it("Should remove a trusted contract from Portfolio from the admin account", async function () {
        const start = await f.latestTime() + 10000;
        const cliff = 20000;
        const duration = 120000;
        const startPortfolioDeposits = start - 10000;
        const revocable = true;
        const percentage = 15;
        const period = 0;

        const factory = await f.deployTokenVestingCloneFactory();
        await factory.createTokenVesting(trader2.address, start, cliff, duration, startPortfolioDeposits,
            revocable, percentage, period, portfolioMain.address, owner.address);
        const count = await factory.count();
        const tokenVesting: TokenVestingCloneable = TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5); //gasSwapRatio 0.5

        await usdt.mint(owner.address, Utils.toWei('10000'));
        await usdt.transfer(tokenVesting.address, 1000);

        // fail too add from non admin accounts
        await expect(portfolioMain.connect(trader1).addTrustedContract(tokenVesting.address, "Dexalot")).to.revertedWith("AccessControl:");
        // succeed to add from admin accounts
        await portfolioMain.connect(owner).addTrustedContract(tokenVesting.address, "Dexalot");
        expect(await portfolioMain.trustedContracts(tokenVesting.address)).to.be.true;
        // fail to remove from non admin accounts
        await expect(portfolioMain.connect(trader1).removeTrustedContract(tokenVesting.address)).to.revertedWith("AccessControl:");
        // succeed to add from admin accounts
        await portfolioMain.connect(owner).removeTrustedContract(tokenVesting.address);
        expect(await portfolioMain.trustedContracts(tokenVesting.address)).to.be.false;
    });

});
