/**
 * The test runner for Dexalot Portfolio contract
 */

// import Chai for its asserting functions
const { expect } = require("chai");

const { ethers, upgrades } = require("hardhat");

const Utils = require('./utils.js');

let MockToken;
let Portfolio;

let wallets;
let wallet;
let account;

let native = Utils.fromUtf8("AVAX");

describe("Portfolio", () => {

    before(async () => {
        wallets = await ethers.getSigners();
        wallet = wallets[0];
        account = wallet.address;
        console.log(account);

        MockToken = await ethers.getContractFactory("MockToken");
        Portfolio = await ethers.getContractFactory("Portfolio");
        Fee = await ethers.getContractFactory("Fee");

        // initialize fee
        fee = await upgrades.deployProxy(Fee);

        // initialize portfolio
        portfolio = await upgrades.deployProxy(Portfolio);

        await portfolio.setFee(fee.address);
        console.log("Called setFee on Portfolio");

        await fee.addAdmin(portfolio.address);
        console.log("portfolio at", portfolio.address, "added as admin to fee");

        depositFeeRate = parseFloat((await portfolio.getDepositFeeRate()).toString())/10000;
    });

    it("... should have starting portfolio with zero total and available balances for native token", async () => {
        console.log();
        res = await portfolio.getBalance(account, native);
        Utils.printResults(account, "before deposit", res);
        expect(res.total).to.equal(0);
        expect(res.available).to.equal(0);
    });

    it("... should deposit native tokens to portfolio", async () => {
        console.log();
        deposit_amount = '10';   // ether
        deposit_amount_less_fee = (parseFloat(deposit_amount) * (1 - depositFeeRate)).toString();
        await wallet.sendTransaction({from: account, to: portfolio.address, value: Utils.toWei(deposit_amount)});
        res = await portfolio.getBalance(account, native);
        Utils.printResults(account, "after deposit", res);
        expect(res.total).to.equal(Utils.toWei(deposit_amount_less_fee));
        expect(res.available).to.equal(Utils.toWei(deposit_amount_less_fee));
    });

    it("... should withdraw native tokens from portfolio", async () => {
        console.log();
        deposit_amount = '10';    // ether
        deposit_amount_less_fee = parseFloat(deposit_amount) * (1 - depositFeeRate);
        withdrawal_amount = '5';  // ether
        remaining_amount = (deposit_amount_less_fee - parseFloat(withdrawal_amount)).toString();
        await portfolio.withdrawNative(account, Utils.toWei("5"));
        res = await portfolio.getBalance(account, native, {from: account});
        Utils.printResults(account, "after withdrawal", res);
        expect(parseFloat(Utils.fromWei(res.total))).to.equal(parseFloat(remaining_amount));
        expect(parseFloat(Utils.fromWei(res.available))).to.equal(parseFloat(remaining_amount));
    });

    it("... should create ERC20 token", async () => {
        console.log();
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        console.log("ERC20 Token = ", await usdt.name(), "(", await usdt.symbol(), ",", await usdt.decimals(), ")");
        expect(await usdt.name()).to.equal(token_name);
        expect(await usdt.symbol()).to.equal(token_symbol);
        expect(await usdt.decimals()).to.equal(token_decimals);
    });

    it("... should have starting ERC20 token balance at zero for account", async () => {
        console.log();
        console.log("Balance of ", account, " before minting any USDT: ", Utils.fromWei(await usdt.balanceOf(account)));
        expect(await usdt.balanceOf(account)).to.equal(0);
    });

    it("... should mint ERC20 token assigning to account", async () => {
        console.log();
        mint_amount = '1000';
        await usdt.mint(account, Utils.toWei('1000'));
        console.log("Balance of ", account, " after minting 1000 USDT: ", Utils.fromWei(await usdt.balanceOf(account)));
        expect(await usdt.balanceOf(account)).to.equal(Utils.toWei(mint_amount));
    });

    it("... should add ERC20 token to portfolio and fee", async () => {
        console.log();
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, {from: account});
        console.log("ERC20 token USDT added to portfolio and fee");
        tokens = await portfolio.getTokenList();
        expect(tokens[0]).to.equal(USDT);
    });

    it("... should have starting portfolio with zero total and available balances for ERC20 token", async () => {
        console.log();
        res = await portfolio.getBalance(account, USDT);
        Utils.printResults(account, "before deposit", res);
        expect(res.total).to.equal(0);
        expect(res.available).to.equal(0);
    });

    it("... should deposit ERC20 token to portfolio", async () => {
        console.log();
        deposit_amount = '200';  // ether
        deposit_amount_less_fee = (parseFloat(deposit_amount) * (1 - depositFeeRate)).toString();
        await usdt.approve(portfolio.address, Utils.toWei(deposit_amount));
        await portfolio.depositToken(account, USDT, Utils.toWei(deposit_amount));
        res = await portfolio.getBalance(account, USDT);
        Utils.printResults(account, "after deposit", res);
        expect(res.total).to.equal(Utils.toWei(deposit_amount_less_fee));
        expect(res.available).to.equal(Utils.toWei(deposit_amount_less_fee));
     });

    it("... should withdraw ERC20 token from portfolio", async () => {
        console.log();
        deposit_amount = '200';
        deposit_amount_less_fee = parseFloat(deposit_amount) * (1 - depositFeeRate);
        withdrawal_amount = '100';
        remaining_amount = deposit_amount_less_fee - parseFloat(withdrawal_amount);
        await portfolio.withdrawToken(account, USDT, Utils.toWei(withdrawal_amount));
        res = await portfolio.getBalance(account, USDT);
        Utils.printResults(account, "after withdrawal", res);
        expect(parseFloat(Utils.fromWei(res.total)).toFixed(12)).to.equal(remaining_amount.toFixed(12));
        expect(parseFloat(Utils.fromWei(res.available)).toFixed(12)).to.equal(remaining_amount.toFixed(12));
    });

});
