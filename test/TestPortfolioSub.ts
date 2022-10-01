// FIXME INCOMPLETE !!!
/**
 * The test runner for Dexalot PortfolioSub contract
 * Please do not test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    GasStation,
    LZEndpointMock,
    MockToken,
    PortfolioMain,
    PortfolioSub
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from 'ethers';

describe("Portfolio Sub", () => {
    const native = Utils.fromUtf8("AVAX");
    const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    let portfolio: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let gasStation: GasStation;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;
    let foundationSafe: SignerWithAddress;

    let token_name: string;
    let token_symbol: string;
    let token_decimals: number;
    let usdt: MockToken;
    let USDT: string;

    let alot_symbol: string;
    let alot_decimals: number;
    let alot: MockToken;

    let avax_decimals: number;

    let deposit_amount: string;

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");

    const srcChainId: any = 1;
    const tokenDecimals = 18;
    const auctionMode: any = 0;

    before(async function () {
        const { owner: owner1, admin: admin1, auctionAdmin: admin2, trader1: t1, trader2: t2, foundationSafe: fs } = await f.getAccounts();
        owner = owner1;
        admin = admin1;
        auctionAdmin = admin2;
        trader1 = t1;
        trader2 = t2;
        foundationSafe = fs;

        console.log("Owner", owner.address);
        console.log("Admin", admin.address );
        console.log("AuctionAdmin", auctionAdmin.address);
        console.log("Trader1", trader1.address);
        console.log("Trader1", trader2.address);
    });

    beforeEach(async function () {
        const {portfolioMain: portfolioM, portfolioSub: portfolioS, lzEndpointMain, portfolioBridgeMain: pbrigeMain, portfolioBridgeSub: pbrigeSub, gasStation: gStation} = await f.deployCompletePortfolio();
        portfolioMain = portfolioM;
        portfolio = portfolioS;
        gasStation =gStation;

        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 6;
        usdt = await f.deployMockToken(token_symbol, token_decimals)
        USDT = Utils.fromUtf8(await usdt.symbol());

        alot_symbol = "ALOT";
        alot_decimals = 18;
        alot = await f.deployMockToken(alot_symbol, alot_decimals)

        avax_decimals = 18;

        deposit_amount = '200';  // ether
    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolio.initialize(ALOT, srcChainId)).to.be.revertedWith("Initializable: contract is already initialized");
    });

    // it("TradePairs Should have EXECUTOR_ROLE on portfolio", async function () {
    //     expect(await portfolio.hasRole(await portfolio.EXECUTOR_ROLE(), tradePairs.address)).to.be.equal(true);
    // });

    it("Should have starting portfolio with zero total and available balances for native token", async () => {
        const res = await portfolio.getBalance(owner.address, native);
        Utils.printResults(owner.address, "before deposit", res, avax_decimals);
        expect(res.total).to.equal(0);
        expect(res.available).to.equal(0);
    });

    it("Should create ERC20 token", async () => {
        const usdt: MockToken = await f.deployMockToken(token_symbol, token_decimals)
        console.log("ERC20 Token = ", await usdt.name(), "(", await usdt.symbol(), ",", await usdt.decimals(), ")");
        expect(await usdt.name()).to.equal(token_name);
        expect(await usdt.symbol()).to.equal(token_symbol);
        expect(await usdt.decimals()).to.equal(token_decimals);
    });

    it("Should have starting portfolio with zero total and available balances for ERC20 token", async () => {
        const res = await portfolio.getBalance(owner.address, USDT);
        Utils.printResults(owner.address, "before deposit", res, token_decimals);
        expect(res.total).to.equal(0);
        expect(res.available).to.equal(0);
    });

    it("Should change auction mode of token in portfolio", async () => {
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        await portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off

        await expect(portfolio.connect(trader1).setAuctionMode(USDT, 1)).to.revertedWith("AccessControl:");
        await expect(portfolio.connect(auctionAdmin).setAuctionMode(USDT, 1)).to.revertedWith("AccessControl:");

        await expect(portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode)).to.revertedWith("P-TAEX-01"); //Auction mode off

        // fail from non-privileged account
        // trader1
        await expect(portfolio.connect(trader1).setAuctionMode(USDT, 1)).to.revertedWith("AccessControl:");
        // succeed from privileged account
        // auctionAdmin
        await portfolio.connect(owner).setAuctionMode(USDT, 1);
        let tokenDetails = await portfolio.getTokenDetails(USDT);
        expect(tokenDetails.auctionMode).to.be.equal(1);
        // admin
        await portfolio.connect(owner).setAuctionMode(USDT, 0);
        tokenDetails = await portfolio.getTokenDetails(USDT);
        expect(tokenDetails.auctionMode).to.be.equal(0);
    });

    it("Should update deposit and withdrawal rates by admin correctly", async function () {
        const dRate = ethers.BigNumber.from(5);
        const wRate = ethers.BigNumber.from(10);
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).updateTransferFeeRate(dRate, 0)).to.revertedWith("AccessControl: account");
        await expect(portfolio.connect(trader2).updateTransferFeeRate(dRate, 1)).to.revertedWith("AccessControl: account");
        // succeed from admin accounts
        await portfolio.updateTransferFeeRate(dRate, 0);
        expect(await portfolio.depositFeeRate()).to.be.equal(dRate);
        await portfolio.updateTransferFeeRate(wRate, 1);
        expect(await portfolio.withdrawFeeRate()).to.be.equal(wRate);
        // fail for wrong rate type
        await expect(portfolio.updateTransferFeeRate(dRate, 2)).to.revertedWith("P-WRTT-01");
    });
    // TODO: test transferFee functions

    it("Should set fee address for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setFeeAddress(trader2.address)).to.revertedWith("AccessControl: account");
        await expect(portfolio.connect(admin).setFeeAddress(trader2.address)).to.revertedWith("AccessControl: account");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).setFeeAddress(foundationSafe.address);
        expect(await portfolio.feeAddress()).to.be.equal(foundationSafe.address);
        // fail for zero address
        await expect(portfolio.connect(admin).setFeeAddress("0x0000000000000000000000000000000000000000")).to.revertedWith("P-OACC-02");
    });

    it("Should set treasury address for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setTreasury(foundationSafe.address)).to.revertedWith("P-OACC-01");
        await expect(portfolio.connect(admin).setTreasury(foundationSafe.address)).to.revertedWith("P-OACC-01");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).setTreasury(foundationSafe.address);
        expect(await portfolio.getTreasury()).to.be.equal(foundationSafe.address);
        // fail for zero address
        await expect(portfolio.connect(admin).setTreasury("0x0000000000000000000000000000000000000000")).to.revertedWith("P-OACC-02");
    });

    it("Should set gas station address for Portfolio from the admin account", async function () {

        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setGasStation(gasStation.address)).to.revertedWith("P-OACC-01");
        await expect(portfolio.connect(admin).setGasStation(gasStation.address)).to.revertedWith("P-OACC-01");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).setGasStation(gasStation.address);
        expect(await portfolio.getGasStation()).to.be.equal(gasStation.address);
        // fail for zero address
        await expect(portfolio.connect(admin).setGasStation("0x0000000000000000000000000000000000000000")).to.revertedWith("P-OACC-02");
    });

    it("Should set portfolio minter address for Portfolio from the admin account", async function () {
        const portfolioMinter = await f.deployPortfolioMinterMock(portfolio, "0x0200000000000000000000000000000000000001");

        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setPortfolioMinter(portfolioMinter.address)).to.revertedWith("P-OACC-01");
        await expect(portfolio.connect(admin).setPortfolioMinter(portfolioMinter.address)).to.revertedWith("P-OACC-01");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).setPortfolioMinter(portfolioMinter.address);
        expect(await portfolio.getPortfolioMinter()).to.be.equal(portfolioMinter.address);
        // fail for zero address
        await expect(portfolio.connect(admin).setPortfolioMinter("0x0000000000000000000000000000000000000000")).to.revertedWith("P-OACC-02");
    });

    it("Should set deposit threshold for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setWalletBalanceDepositThreshold(Utils.toWei("0.1"))).to.revertedWith("P-OACC-01");
        await expect(portfolio.connect(admin).setWalletBalanceDepositThreshold(Utils.toWei("0.1"))).to.revertedWith("P-OACC-01");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).setWalletBalanceDepositThreshold(Utils.toWei("0.1"));
        expect(await portfolio.walletBalanceDepositThreshold()).to.be.equal(Utils.toWei("0.1"));
    });

    it("Should fail addExecution if not called by TradePairs", async function () {
        const takerAddr = trader1.address;
        const baseSymbol = Utils.fromUtf8("AVAX");
        const quoteSymbol = Utils.fromUtf8("USDC");
        const baseAmount = 0;
        const quoteAmount = 0;
        const makerfeeCharged = 0;
        const takerfeeCharged = 0;
        // fail from non TradePairs addresses
        await expect(portfolio.connect(trader1)
            .addExecution(0, trader1.address, takerAddr, baseSymbol, quoteSymbol, baseAmount, quoteAmount, makerfeeCharged, takerfeeCharged))
            .to.revertedWith("P-OACC-04");
    });

    it("Should fail adjustAvailable()", async function () {
        await portfolio.addToken(USDT, usdt.address, srcChainId, 6, auctionMode); //Auction mode off
        // fail if caller is not tradePairs
        await expect(portfolio.adjustAvailable(0, trader1.address, USDT, Utils.toWei('10'))).to.revertedWith("P-OACC-03");
    });

    it("Should withdraw native tokens from portfolio to subnet", async () => {
        await f.addToken(portfolioMain, alot, 0); //Auction mode off
        // alot is already added to subnet during deployment of portfolio

        const initial_amount = await trader1.getBalance();

        let tx = await alot.mint(trader1.address, Utils.toWei("1000"));

        tx = await alot.connect(trader1).approve(portfolioMain.address, Utils.toWei(deposit_amount));
        const tx_2:any = await tx.wait();

        tx = await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount);
        const tx_3:any = await tx.wait()

        // fail for account other then msg.sender
        await expect(portfolio.connect(trader2).withdrawNative(trader1.address, Utils.toWei("100"))).to.be.revertedWith("P-OOWN-01");

        // succeed for msg.sender
        tx = await portfolio.connect(trader1).withdrawNative(trader1.address, Utils.toWei("100"));
        const tx_4:any = await tx.wait();

        const res = await portfolio.getBalance(trader1.address, ALOT);

        Utils.printResults(trader1.address, "after withdrawal", res, alot_decimals);

        expect(res.total).to.equal(
            Utils.toWei(deposit_amount)
            .sub(Utils.toWei("100"))
        );

        expect(res.available).to.equal(
            Utils.toWei(deposit_amount)
            .sub(Utils.toWei("100"))
        );

        expect((await trader1.getBalance()).toString().slice(0, 6)).to.equal(
            initial_amount
            .add(Utils.toWei('100'))
            .sub(tx_2.effectiveGasPrice.mul(tx_2.gasUsed))
            .sub(tx_3.effectiveGasPrice.mul(tx_3.gasUsed))
            .sub(tx_4.effectiveGasPrice.mul(tx_4.gasUsed))
            .toString().slice(0, 6)
        );
    });

    it("Should deposit native tokens from subnet", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        const initial_amount = await trader1.getBalance();

        const tx = await portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: Utils.toWei('10')
        });
        const receipt:any = await tx.wait();

        const res = await portfolio.getBalance(trader1.address, ALOT);
        Utils.printResults(trader1.address, "after deposit", res, alot_decimals);
        expect(res.total).to.equal(Utils.toWei("10"));
        expect(res.available).to.equal(Utils.toWei("10"));

        expect(await portfolio.totalNativeBurned()).to.equal(Utils.toWei("10"));

        expect((await trader1.getBalance()).toString().slice(0, 6)).to.equal(
            initial_amount
            .sub(receipt.effectiveGasPrice.mul(receipt.cumulativeGasUsed))
            .sub(Utils.toWei('10'))
            .toString().slice(0, 6)
        );
    })

    it("Should not deposit native tokens from subnet if it is above threshold", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        const initial_amount = await trader1.getBalance();

        const tx = await portfolio.connect(trader1).populateTransaction.depositNative(trader1.address, 0, {
            value: "1"
        })

        const gas = await ethers.provider.estimateGas(tx)
        const gasPrice = await ethers.provider.getGasPrice()
        const total = gas.mul(gasPrice)

        await expect(portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: initial_amount.sub(total),
            gasLimit: gas,
            gasPrice: gasPrice
        }))
        .to.be.revertedWith("P-BLTH-01");
    })

    it("Should deposit native tokens from subnet if initiated by self ", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        let bal = await portfolio.getBalance(trader1.address, ALOT);
        expect(bal.total).to.be.equal(0);
        expect(bal.available).to.be.equal(0);

        // fail sender is not self
        await expect(portfolio.depositNative(trader1.address, 0, {
            value: Utils.parseUnits("0.5", 18)
        }))
        .to.be.revertedWith("P-OOWN-02");

        // succeed
        await portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: Utils.parseUnits("0.5", 18)
        });
        bal = await portfolio.getBalance(trader1.address, ALOT);
        expect(bal.total).to.be.equal(Utils.parseUnits("0.5", 18));
        expect(bal.available).to.be.equal(Utils.parseUnits("0.5", 18));
    })

    it("Should withdraw native tokens from subnet if initiated by self", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        let bal = await portfolio.getBalance(trader1.address, ALOT);
        expect(bal.total).to.be.equal(0);
        expect(bal.available).to.be.equal(0);

        // fail sender is not self or has msg sender role
        await expect(portfolio.withdrawNative(trader1.address, Utils.parseUnits("0.2", 18)))
        .to.be.revertedWith("P-OOWN-01");

        // deposit first do we can withdraw

        await portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: Utils.parseUnits("0.6", 18)
        });

        // succeed
        await portfolio.connect(trader1).withdrawNative(trader1.address, Utils.parseUnits("0.2", 18))
        bal = await portfolio.getBalance(trader1.address, ALOT);
        expect(bal.total).to.be.equal(Utils.parseUnits("0.4", 18));
        expect(bal.available).to.be.equal(Utils.parseUnits("0.4", 18));
    })

    it("Should not deposit native tokens from subnet if portfolio is paused", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        // fail paused
        await portfolio.pause();
        await expect(portfolio.depositNative(trader1.address, 0, {
            value: Utils.parseUnits("0.5", 18)
        }))
        .to.be.revertedWith("Pausable: paused");
    })

    it("Should not withdraw native tokens from subnet if portfolio is paused", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        // fail paused
        await portfolio.pause();
        await expect(portfolio.withdrawNative(trader1.address, Utils.parseUnits("0.5", 18)))
        .to.be.revertedWith("Pausable: paused");
    })

    it("Should not withdraw tokens from subnet if portfolio is paused", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        // fail paused
        await portfolio.pause();
        await expect(portfolio.withdrawToken(trader1.address, AVAX, Utils.parseUnits("0.5", 18), 0))
        .to.be.revertedWith("Pausable: paused");
    })

    it("Should not deposit native tokens from subnet if parameters are incorrect", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        const initial_amount = await trader1.getBalance();

        const tx = await portfolio.connect(trader1).populateTransaction.depositNative(trader1.address, 0, {
            value: "1"
        })

        const gas = await ethers.provider.estimateGas(tx)
        const gasPrice = await ethers.provider.getGasPrice()
        const total = gas.mul(gasPrice)

        await expect(portfolio.connect(trader1).depositNative(trader2.address, 0, {
            value: initial_amount.sub(total),
            gasLimit: gas,
            gasPrice: gasPrice
        }))
        .to.be.revertedWith("P-OOWN-02");
    })

    it("Should not deposit native tokens from subnet if it is not allowed", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        const initial_amount = await trader1.getBalance();

        const tx = await portfolio.connect(trader1).populateTransaction.depositNative(trader1.address, 0, {
            value: "1"
        })

        const gas = await ethers.provider.estimateGas(tx)
        const gasPrice = await ethers.provider.getGasPrice()
        const total = gas.mul(gasPrice)

        await portfolio.pauseDeposit(true)

        await expect(portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: initial_amount.sub(total),
            gasLimit: gas,
            gasPrice: gasPrice
        }))
        .to.be.revertedWith("P-NTDP-01");
    })

    it("Should transfer token from portfolio to portfolio", async () => {
        alot = await f.deployMockToken("ALOT", 18)
        await alot.mint(trader1.address, (BigNumber.from(2)).mul(Utils.parseUnits(deposit_amount, 18)));
        await portfolioMain.addToken(ALOT, alot.address, srcChainId, tokenDecimals, auctionMode);

        await f.depositNative(portfolioMain, trader1, deposit_amount);
        await f.depositToken(portfolioMain, trader1, alot, 18, ALOT, deposit_amount, 0);

        expect((await portfolio.getBalance(trader1.address, AVAX)).total).to.equal(Utils.toWei(deposit_amount));
        expect((await portfolio.getBalance(trader2.address, AVAX)).total).to.equal(ethers.BigNumber.from(0));

        // transfer AVAX native in mainnet
        await expect(portfolio.connect(trader1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount)))
        .to.emit(portfolio, "PortfolioUpdated")
        .withArgs(5,  trader1.address, AVAX, Utils.toWei(deposit_amount), 0, 0, 0)
        .to.emit(portfolio, "PortfolioUpdated")
        .withArgs(6,  trader2.address, AVAX, Utils.toWei(deposit_amount), 0, ethers.BigNumber.from(Utils.toWei(deposit_amount)), ethers.BigNumber.from(Utils.toWei(deposit_amount)))

        // transfer ALOT native in subnet
        await expect(portfolio.connect(trader1).transferToken(trader2.address, ALOT, Utils.toWei(deposit_amount)))
        .to.emit(portfolio, "PortfolioUpdated")
        .withArgs(5,  trader1.address, ALOT, Utils.toWei(deposit_amount), 0, 0, 0)
        .to.emit(portfolio, "PortfolioUpdated")
        .withArgs(6,  trader2.address, ALOT, Utils.toWei(deposit_amount), 0, ethers.BigNumber.from(Utils.toWei(deposit_amount)), ethers.BigNumber.from(Utils.toWei(deposit_amount)))
    })

    it("Should not transfer token from portfolio to portfolio if contract is paused", async () => {
        await f.depositNative(portfolioMain, trader1, deposit_amount);

        expect((await portfolio.getBalance(trader1.address, AVAX)).total).to.equal(Utils.toWei(deposit_amount));
        expect((await portfolio.getBalance(trader2.address, AVAX)).total).to.equal(ethers.BigNumber.from(0));

        await portfolio.pause();

        await expect(portfolio.connect(trader1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount)))
        .to.be.revertedWith("Pausable: paused")
    })

    it("Should not transfer internally if parameters are not correct", async () => {
        const NOT_EXISTING_TOKEN = Utils.fromUtf8("NOT_EXISTING_TOKEN");

        await f.depositNative(portfolioMain, trader1, deposit_amount);

        expect((await portfolio.getBalance(trader1.address, AVAX)).total).to.equal(Utils.toWei(deposit_amount));
        expect((await portfolio.getBalance(trader2.address, AVAX)).total).to.equal(ethers.BigNumber.from(0));

        await expect(portfolio.connect(trader1).transferToken(trader1.address, AVAX, Utils.toWei(deposit_amount)))
        .to.be.revertedWith("P-DOTS-01");

        await expect(portfolio.connect(trader1).transferToken(trader2.address, NOT_EXISTING_TOKEN, Utils.toWei(deposit_amount)))
        .to.be.revertedWith("P-ETNS-01");

        await expect(portfolio.connect(trader1).transferToken(trader2.address, AVAX, Utils.toWei("0")))
        .to.be.revertedWith("P-TNEF-01");

        await expect(portfolio.connect(trader1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount).add(1)))
        .to.be.revertedWith("P-AFNE-02");
    })

    it("Should add and remove ERC20 token to portfolio sub", async () => {
        // fail for non-admin
        await expect(portfolio.connect(trader1).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode)).to.be.revertedWith("AccessControl:");
        // succeed for admin
        await portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode); //Auction mode off
        const tokens = await portfolio.getTokenList();
        expect(tokens[2]).to.equal(USDT);

        await expect(portfolio.removeToken(USDT)).to.be.revertedWith("Pausable: not paused");
        await portfolio.pause();
        await expect(portfolio.connect(trader1).removeToken(USDT)).to.be.revertedWith("AccessControl: account");

        await expect(portfolio.removeToken(USDT))
        .to.emit(portfolio, "ParameterUpdated")
        .withArgs(USDT, "P-REMOVETOKEN", 0, 0);

        // do nothing for non-existent token
        await portfolio.removeToken(Utils.fromUtf8("MOCK"))
    });

    it("Should not remove erc20 if it has deposits", async () => {
        await usdt.mint(trader1.address, ethers.utils.parseEther("100"))

        await f.addToken(portfolioMain, usdt, 0);
        await f.addToken(portfolio, usdt, 0);

        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, "100")

        expect((await portfolio.getBalance(trader1.address, USDT)).total.toString()).to.equal(Utils.parseUnits("100", token_decimals));
        await portfolio.pause();
        await expect(portfolio.removeToken(USDT)).to.be.revertedWith("P-TTNZ-01");
    });

    it("Should get token details", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await f.addToken(portfolioMain, usdt, 0);
        await f.addToken(portfolio, usdt, 0);

        let tokenDetails = await portfolio.getTokenDetails(USDT);
        expect(tokenDetails.tokenAddress).to.equal(ZERO_ADDRESS);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);
        expect(tokenDetails.symbol).to.equal(USDT);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8("USDT"+srcChainId));

        tokenDetails = await portfolio.getTokenDetails(ALOT);
        expect(tokenDetails.tokenAddress).to.equal(ZERO_ADDRESS);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(18);
        expect(tokenDetails.symbol).to.equal(ALOT);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8("ALOT"+srcChainId));

        tokenDetails = await portfolio.getTokenDetails(AVAX);
        expect(tokenDetails.tokenAddress).to.equal(ZERO_ADDRESS);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(18);
        expect(tokenDetails.symbol).to.equal(AVAX);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8("AVAX"+srcChainId));



        // Non existent token
        tokenDetails = await portfolio.getTokenDetails(Utils.fromUtf8("USDC"));
        expect(tokenDetails.tokenAddress).to.equal(ZERO_ADDRESS);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(0);
        expect(tokenDetails.symbol).to.equal(ZERO_BYTES32);
        expect(tokenDetails.symbolId).to.equal(ZERO_BYTES32);
    });

    it("Should revert with non-existing function call", async () => {
        // try calling a scam addMyContract via a modified abi call
        const bogusAbi = "[{\"inputs\":[{\"internalType\":\"address\",\"name\":\"_contract\",\"type\":\"address\"}," +
                       "{\"internalType\":\"string\",\"name\":\"_organization\",\"type\":\"string\"}]," +
                       "\"name\":\"addMyContract\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]";
                       const contract = new ethers.Contract(portfolio.address, bogusAbi, owner);
        await expect(contract.addMyContract(trader2.address, "SCAMMER")).to.be.revertedWith("");
    });

    it("Should use processXFerPayload() correctly", async () => {
        let Tx = 0;  // WITHDRAW

        // fail for unpriviliged account
        await expect(portfolio.connect(trader2).processXFerPayload(trader2.address, AVAX, Utils.toWei("0.01"), Tx))
            .to.be.revertedWith("AccessControl:");

        // make owner part of PORTFOLIO_BRIDGE_ROLE on PortfolioSub
        await portfolio.grantRole(await portfolio.PORTFOLIO_BRIDGE_ROLE(), owner.address)

        // processing of withdraw messages will fail on subnet
        Tx = 0;  // WITHDRAW
        await expect(portfolio.processXFerPayload(trader2.address, AVAX, Utils.toWei("0.01"), Tx)).to.be.revertedWith("P-PTNS-02");

        // try as many path ways as possible making sure they don't revert
        Tx = 1;  // DEPOSIT
        // funded account
        await portfolio.setAuctionMode(AVAX, 0);
        await portfolio.processXFerPayload(trader2.address, ALOT, Utils.toWei("0.01"), Tx);
        await portfolio.setAuctionMode(AVAX, 1);
        await portfolio.processXFerPayload(trader2.address, ALOT, Utils.toWei("0.01"), Tx);
        // using an unfunded address
        await portfolio.setAuctionMode(AVAX, 1);
        await portfolio.processXFerPayload("0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D", AVAX, Utils.toWei("0.01"), Tx);
        await portfolio.setAuctionMode(AVAX, 0);
        await portfolio.processXFerPayload("0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D", AVAX, Utils.toWei("0.01"), Tx);
        await portfolio.setAuctionMode(ALOT, 0);
        await portfolio.processXFerPayload("0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D", ALOT, Utils.toWei("0.01"), Tx);
        await portfolio.setAuctionMode(ALOT, 1);
        await portfolio.processXFerPayload("0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D", ALOT, Utils.toWei("0.01"), Tx);
        await gasStation.setGasAmount(Utils.toWei("0.0101"));
        await portfolio.setAuctionMode(ALOT, 1);
        await portfolio.processXFerPayload("0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D", ALOT, Utils.toWei("0.01"), Tx);
        await portfolio.setAuctionMode(ALOT, 0);
        await portfolio.processXFerPayload("0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D", ALOT, Utils.toWei("0.01"), Tx);
        await portfolio.setAuctionMode(AVAX, 1);
        await portfolio.processXFerPayload("0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D", AVAX, Utils.toWei("0.01"), Tx);
        await portfolio.setAuctionMode(AVAX, 1);
        await portfolio.processXFerPayload("0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D", AVAX, Utils.toWei("0.01"), Tx);
    });

    it("Should add and remove tokens correctly", async () => {

        const native = "ALOT;"
        const symbol = "MOCK";
        const decimals = 18;

        const t = await f.deployMockToken(symbol, decimals);

        const SYMBOL = Utils.fromUtf8(await t.symbol());

        let tokenList = await portfolio.getTokenList();
        expect(tokenList.length).to.be.equal(2);

        // fail not paused
        await expect(portfolio.removeToken(SYMBOL)).to.be.revertedWith("Pausable: not paused");

        // silent fail if token is not in the token list
        await portfolio.pause();
        await portfolio.removeToken(SYMBOL);
        tokenList = await portfolio.getTokenList();
        expect(tokenList.length).to.be.equal(2);
        // fail adding 0 decimals native
        await expect(portfolio.addToken(Utils.fromUtf8(native), ZERO_ADDRESS, srcChainId, 0, auctionMode)).to.be.revertedWith("P-CNAT-01");

        // fail with decimals 0 token
        await expect(portfolio.addToken(SYMBOL, t.address, srcChainId, 0, auctionMode)).to.be.revertedWith("P-CNAT-01");

        // check AVAX
        tokenList = await portfolio.getTokenList();
        expect(tokenList.includes(AVAX)).to.be.true;

        // succeed adding MOCK
        await portfolio.addToken(SYMBOL, t.address, srcChainId, tokenDecimals, auctionMode);
        tokenList = await portfolio.getTokenList();
        expect(tokenList.includes(SYMBOL)).to.be.true;

        // succeed removing AVAX
        await portfolio.removeToken(AVAX);
        tokenList = await portfolio.getTokenList();
        expect(tokenList.includes(AVAX)).to.be.false;

        // succeed removing AVAX
        await portfolio.removeToken(SYMBOL);
        tokenList = await portfolio.getTokenList();
        expect(tokenList.includes(SYMBOL)).to.be.false;
    });

    it("Should return zero address on subnet by running getToken()", async () => {

        const token = await portfolio.getToken(AVAX);
        expect(token).to.be.equal(ZERO_ADDRESS);
    });

    it("Should have no effect on subnet by running depositToken()", async () => {
        const tx = await portfolio.depositToken(owner.address, AVAX, Utils.toWei("0.01"), 0);
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });

    it("Should have no effect on subnet by running depositTokenFromContract()", async () => {
        const tx = await portfolio.depositTokenFromContract(owner.address, AVAX, Utils.toWei("0.01"));
        const receipt = await tx.wait()
        expect(receipt.logs.length).to.be.equal(0);
        expect(receipt.events?.length).to.be.equal(0);
    });
});
