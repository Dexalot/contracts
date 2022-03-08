/**
 * The test runner for Dexalot Portfolio contract
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const Utils = require('./utils.js');

let MockToken;
let Portfolio;
let portfolio
let TokenVesting;
let tokenVesting;
let owner;
let admin;
let auctionAdmin;
let trader1;
let trader2;
let foundationSafe;
let depositFeeRate;

let native = Utils.fromUtf8("AVAX");


describe("Portfolio", () => {

    before(async () => {
        MockToken = await ethers.getContractFactory("MockToken");
        Portfolio = await ethers.getContractFactory("Portfolio");
        TokenVesting = await ethers.getContractFactory("TokenVesting");
    });

    beforeEach(async function () {
        [owner, admin, auctionAdmin, trader1, trader2, foundationSafe] = await ethers.getSigners();
        console.log("Owner:", owner.address);

        portfolio = await upgrades.deployProxy(Portfolio);

        await portfolio.setFeeAddress(foundationSafe.address);
        await portfolio.addAdmin(owner.address);

        depositFeeRate = parseFloat((await portfolio.getDepositFeeRate()).toString())/10000;
    });

    it("Should get owner correctly", async function () {
        expect(await portfolio.owner()).to.be.equal(owner.address);
    });

    it("Should add and remove admin correctly", async function () {
        // fail for non-admin
        await expect(portfolio.connect(trader1).addAdmin(trader1.address)).to.be.revertedWith("P-OACC-01");
        // succeed for admin
        await portfolio.addAdmin(trader1.address)
        expect(await portfolio.isAdmin(trader1.address)).to.be.equal(true);
        // fail for non-admin
        await expect(portfolio.connect(trader2).removeAdmin(trader1.address)).to.be.revertedWith("P-OACC-02");
        // succeed for admin
        await portfolio.removeAdmin(trader1.address)
        expect(await portfolio.isAdmin(trader1.address)).to.be.equal(false);
        // cannot remove the last admin
        await expect(portfolio.removeAdmin(owner.address)).to.be.revertedWith("P-ALOA-01");
    });

    it("Should add and remove auction admin correctly", async function () {
        // fail for non-admin
        await expect(portfolio.connect(trader1).addAuctionAdmin(trader2.address)).to.be.revertedWith("P-OACC-11");
        // succeed for admin
        await portfolio.addAuctionAdmin(trader2.address)
        expect(await portfolio.isAuctionAdmin(trader2.address)).to.be.equal(true);
        // fail for non-admin
        await expect(portfolio.connect(trader1).removeAuctionAdmin(trader2.address)).to.be.revertedWith("P-OACC-12");
        // succeed for admin
        await portfolio.removeAuctionAdmin(trader2.address)
        expect(await portfolio.isAuctionAdmin(trader2.address)).to.be.equal(false);
    });

    it("Should update deposit and withdrawal rates by admin correctly", async function () {
        const dRate = ethers.BigNumber.from(5);
        const wRate = ethers.BigNumber.from(10);
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).updateTransferFeeRate(dRate, 0)).to.revertedWith("P-OACC-07");
        await expect(portfolio.connect(trader2).updateTransferFeeRate(dRate, 1)).to.revertedWith("P-OACC-07");
        // succeed from admin accounts
        await portfolio.updateTransferFeeRate(dRate, 0);
        expect(await portfolio.getDepositFeeRate()).to.be.equal(dRate);
        await portfolio.updateTransferFeeRate(wRate, 1);
        expect(await portfolio.getWithdrawFeeRate()).to.be.equal(wRate);
    });

    it("... should have starting portfolio with zero total and available balances for native token", async () => {
        res = await portfolio.getBalance(owner.address, native);
        Utils.printResults(owner.address, "before deposit", res);
        expect(res.total).to.equal(0);
        expect(res.available).to.equal(0);
    });

    it("... should deposit native tokens to portfolio", async () => {
        deposit_amount = '10';   // ether
        deposit_amount_less_fee = (parseFloat(deposit_amount) * (1 - depositFeeRate)).toString();
        await owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei(deposit_amount)});
        res = await portfolio.getBalance(owner.address, native);
        Utils.printResults(owner.address, "after deposit", res);
        expect(res.total).to.equal(Utils.toWei(deposit_amount_less_fee));
        expect(res.available).to.equal(Utils.toWei(deposit_amount_less_fee));
        // now try with non-zero deposit rate with 50%
        const dRate = ethers.BigNumber.from(5000);
        await portfolio.updateTransferFeeRate(dRate, 0);
        const balBefore = await ethers.provider.getBalance(foundationSafe.address);
        await owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei('2')});
        const balAfter = await ethers.provider.getBalance(foundationSafe.address);
        expect((balAfter.sub(balBefore)).toString()).to.be.equal((Utils.toWei("1")).toString());
    });

    it("... should withdraw native tokens from portfolio", async () => {
        console.log();
        deposit_amount = '10';    // ether
        deposit_amount_less_fee = parseFloat(deposit_amount) * (1 - depositFeeRate);
        withdrawal_amount = '5';  // ether
        remaining_amount = (deposit_amount_less_fee - parseFloat(withdrawal_amount)).toString();
        await owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei(deposit_amount)});
        // fail for account other then msg.sender
        await expect(portfolio.withdrawNative(trader2.address, Utils.toWei("5"))).to.be.revertedWith("P-OOWN-01");
        // succeed for msg.sender
        await portfolio.withdrawNative(owner.address, Utils.toWei("5"));
        res = await portfolio.getBalance(owner.address, native, {from: owner.address});
        Utils.printResults(owner.address, "after withdrawal", res);
        expect(parseFloat(Utils.fromWei(res.total))).to.equal(parseFloat(remaining_amount));
        expect(parseFloat(Utils.fromWei(res.available))).to.equal(parseFloat(remaining_amount));
        // now try with non-zero withdraw rate with 50%
        const wRate = ethers.BigNumber.from(5000);
        await portfolio.updateTransferFeeRate(wRate, 1);
        const balBefore = await ethers.provider.getBalance(foundationSafe.address);
        await portfolio.withdrawNative(owner.address, Utils.toWei("2"));
        const balAfter = await ethers.provider.getBalance(foundationSafe.address);
        expect((balAfter.sub(balBefore)).toString()).to.be.equal((Utils.toWei("1")).toString());
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
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        console.log("Balance of ", owner.address, " before minting any USDT: ", Utils.fromWei(await usdt.balanceOf(owner.address)));
        expect(await usdt.balanceOf(owner.address)).to.equal(0);
    });

    it("... should mint ERC20 token assigning to account", async () => {
        console.log();
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        mint_amount = '1000';
        await usdt.mint(owner.address, Utils.toWei('1000'));
        console.log("Balance of ", owner.address, " after minting 1000 USDT: ", Utils.fromWei(await usdt.balanceOf(owner.address)));
        expect(await usdt.balanceOf(owner.address)).to.equal(Utils.toWei(mint_amount));
    });

    it("... should add ERC20 token to portfolio", async () => {
        console.log();
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        USDT = Utils.fromUtf8(await usdt.symbol());
        // fail for non-admin
        await expect(portfolio.connect(trader1).addToken(USDT, usdt.address, 0)).to.be.revertedWith("P-OACC-08");
        // succeed for admin
        await portfolio.addToken(USDT, usdt.address, 0, {from: owner.address}); //Auction mode off
        console.log("ERC20 token USDT added to portfolio");
        tokens = await portfolio.getTokenList();
        expect(tokens[0]).to.equal(USDT);
    });

    it("... should have starting portfolio with zero total and available balances for ERC20 token", async () => {
        console.log();
        res = await portfolio.getBalance(owner.address, USDT);
        Utils.printResults(owner.address, "before deposit", res);
        expect(res.total).to.equal(0);
        expect(res.available).to.equal(0);
    });

    it("... should deposit ERC20 token to portfolio using depositToken()", async () => {
        console.log();
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, 0); //Auction mode off
        await usdt.mint(owner.address, Utils.toWei('1000'));
        deposit_amount = '200';  // ether
        deposit_amount_less_fee = (parseFloat(deposit_amount) * (1 - depositFeeRate)).toString();
        await usdt.approve(portfolio.address, Utils.toWei(deposit_amount));
        // fail for account other then msg.sender
        await expect(portfolio.depositToken(trader2.address, USDT, Utils.toWei(deposit_amount))).to.be.revertedWith("P-OODT-01");
        // succeed for msg.sender
        await portfolio.depositToken(owner.address, USDT, Utils.toWei(deposit_amount));
        res = await portfolio.getBalance(owner.address, USDT);
        Utils.printResults(owner.address, "after deposit", res);
        expect(res.total).to.equal(Utils.toWei(deposit_amount_less_fee));
        expect(res.available).to.equal(Utils.toWei(deposit_amount_less_fee));
        // now try with non-zero deposit rate with 50%
        const dRate = ethers.BigNumber.from(5000);
        await portfolio.updateTransferFeeRate(dRate, 0);
        const balBefore = await usdt.balanceOf(foundationSafe.address);
        await usdt.approve(portfolio.address, Utils.toWei('2'));
        await portfolio.depositToken(owner.address, USDT, Utils.toWei('2'));
        const balAfter = await usdt.balanceOf(foundationSafe.address);
        expect((balAfter.sub(balBefore)).toString()).to.be.equal((Utils.toWei("1")).toString());
     });

     it("... should deposit ERC20 token to portfolio using depositTokenFromContract()", async () => {
        console.log();
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, 0); //Auction mode off
        await usdt.mint(owner.address, Utils.toWei('1000'));
        deposit_amount = '200';  // ether
        deposit_amount_less_fee = (parseFloat(deposit_amount) * (1 - depositFeeRate)).toString();
        await usdt.approve(portfolio.address, Utils.toWei(deposit_amount));
        // fail if msg.sender is not in trusted contracts
        await expect(portfolio.depositTokenFromContract(trader2.address, USDT, Utils.toWei(deposit_amount))).to.be.revertedWith("P-AOTC-01");
        await portfolio.addAuctionAdmin(owner.address);
        await portfolio.addTrustedContract(owner.address, "TESTING");
        // fail if quantity is 0
        await expect(portfolio.depositTokenFromContract(trader2.address, USDT, 0)).to.be.revertedWith("P-ZETD-02");
        // fail if token is non-existent
        await expect(portfolio.depositTokenFromContract(trader2.address, Utils.fromUtf8("NONE"), Utils.toWei(deposit_amount))).to.be.revertedWith("P-ETNS-02");
        // fail for quantity more than balance
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, Utils.toWei('1001'))).to.revertedWith("P-NETD-02");
     });

    it("... should withdraw ERC20 token from portfolio", async () => {
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, 0); //Auction mode off
        await usdt.mint(owner.address, Utils.toWei('1000'));
        deposit_amount = '200';
        deposit_amount_less_fee = parseFloat(deposit_amount) * (1 - depositFeeRate);
        await usdt.approve(portfolio.address, Utils.toWei(deposit_amount));
        await portfolio.depositToken(owner.address, USDT, Utils.toWei(deposit_amount));
        withdrawal_amount = '100';
        remaining_amount = deposit_amount_less_fee - parseFloat(withdrawal_amount);
        // fail for account other then msg.sender
        await expect(portfolio.withdrawToken(trader2.address, USDT, Utils.toWei(withdrawal_amount))).to.be.revertedWith("P-OOWT-01");
        // fail for 0 quantity
        await expect(portfolio.withdrawToken(owner.address, USDT, 0)).to.be.revertedWith("P-ZTQW-01");
        // fail for non-existent token
        await expect(portfolio.withdrawToken(owner.address, Utils.fromUtf8("NONE"), Utils.toWei(withdrawal_amount))).to.be.revertedWith("P-ETNS-02");
        // succeed for msg.sender
        await portfolio.withdrawToken(owner.address, USDT, Utils.toWei(withdrawal_amount));
        res = await portfolio.getBalance(owner.address, USDT);
        Utils.printResults(owner.address, "after withdrawal", res);
        expect(parseFloat(Utils.fromWei(res.total)).toFixed(12)).to.equal(remaining_amount.toFixed(12));
        expect(parseFloat(Utils.fromWei(res.available)).toFixed(12)).to.equal(remaining_amount.toFixed(12));
        // now try with non-zero withdraw rate with 50%
        const wRate = ethers.BigNumber.from(5000);
        await portfolio.updateTransferFeeRate(wRate, 1);
        const balBefore = await usdt.balanceOf(foundationSafe.address);
        await usdt.approve(portfolio.address, Utils.toWei('2'));
        await portfolio.withdrawToken(owner.address, USDT, Utils.toWei('2'));
        const balAfter = await usdt.balanceOf(foundationSafe.address);
        expect((balAfter.sub(balBefore)).toString()).to.be.equal((Utils.toWei("1")).toString());
    });

    it("Should pause and unpause Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).pause()).to.revertedWith("P-OACC-03");
        await expect(portfolio.connect(admin).pause()).to.revertedWith("P-OACC-03");
        // succeed from admin accounts
        await portfolio.addAdmin(admin.address);
        await portfolio.connect(admin).pause();
        expect(await portfolio.paused()).to.be.equal(true);
        // fail for non-admin
        await expect(portfolio.connect(trader1).unpause()).to.be.revertedWith("P-OACC-04");
        // succeed for admin
        await portfolio.connect(admin).unpause();
        expect(await portfolio.paused()).to.be.equal(false);
    });

    it("Should pause and unpause Portfolio deposit from the admin account", async function () {
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, 0); //Auction mode off
        await usdt.mint(owner.address, Utils.toWei('1000'));
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).pauseDeposit(true)).to.revertedWith("P-OACC-05");
        await expect(portfolio.connect(admin).pauseDeposit(true)).to.revertedWith("P-OACC-05");
        // succeed from admin accounts
        await portfolio.addAdmin(admin.address);
        await portfolio.connect(admin).pauseDeposit(true);
        // fail when paused
        await expect(owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei('1000')})).to.revertedWith("P-NTDP-01");
        // fail depositToken() when paused
        await expect(portfolio.connect(owner).depositToken(owner.address, USDT, Utils.toWei('100'))).to.revertedWith("P-ETDP-01");

        // fail depositTokenFromContract() when paused
        await portfolio.addAuctionAdmin(owner.address);
        await portfolio.addTrustedContract(owner.address, "TESTING");
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, Utils.toWei('100'))).to.revertedWith("P-ETDP-02");
        // allow deposits
        await portfolio.connect(admin).pauseDeposit(false);
        // fail with 0 quantity for depositToken()
        await expect(portfolio.depositToken(owner.address, USDT, 0)).to.revertedWith("P-ZETD-01");
        // fail for non-existent token for depositToken()
        await expect(portfolio.depositToken(owner.address, Utils.fromUtf8("NONE"), Utils.toWei('100'))).to.revertedWith("P-ETNS-01");
        // fail for quantity more than balance for depositToken()
        await expect(portfolio.depositToken(owner.address, USDT, Utils.toWei('1001'))).to.revertedWith("P-NETD-01");
        // fail with 0 quantity for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, 0)).to.revertedWith("P-ZETD-02");
        // fail for non-existent token for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, Utils.fromUtf8("NONE"), Utils.toWei('100'))).to.revertedWith("P-ETNS-02");
        // fail for quantity more than balance for depositTokenFromContract()
        await expect(portfolio.depositTokenFromContract(owner.address, USDT, Utils.toWei('1001'))).to.revertedWith("P-NETD-02");
        // succeed for native
        await owner.sendTransaction({from: owner.address, to: portfolio.address, value: Utils.toWei('1000')});
        let bal = await portfolio.getBalance(owner.address, Utils.fromUtf8("AVAX"));
        expect(bal.total).to.be.equal(Utils.toWei('1000'));
        expect(bal.available).to.be.equal(Utils.toWei('1000'));
    });

    it("Should set auction mode from the admin account", async function () {
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, 0); //Auction mode off
        await usdt.mint(owner.address, Utils.toWei('1000'));
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setAuctionMode(USDT, 4)).to.revertedWith("P-AUCT-01");
        await expect(portfolio.connect(admin).setAuctionMode(USDT, 4)).to.revertedWith("P-AUCT-01");
        // succeed from admin accounts
        await portfolio.addAuctionAdmin(auctionAdmin.address);
        await portfolio.connect(auctionAdmin).setAuctionMode(USDT, 4);
    });

    it("Should set fee adrress for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setFeeAddress(trader2.address)).to.revertedWith("P-OACC-06");
        await expect(portfolio.connect(admin).setFeeAddress(trader2.address)).to.revertedWith("P-OACC-06");
        // succeed from admin accounts
        await portfolio.addAdmin(admin.address);
        await portfolio.connect(admin).setFeeAddress(foundationSafe.address);
        expect(await portfolio.getFeeAddress()).to.be.equal(foundationSafe.address);
    });

    it("Should add a trusted contract to Portfolio from the auction admin account", async function () {
        let start = await latestTime() + 10000;
        let cliff = 20000;
        let duration = 120000;
        let startPortfolioDeposits = start - 10000;
        let revocable = true;
        let percentage = 15;
        const tokenVesting = await TokenVesting.deploy(trader2.address, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
        await tokenVesting.deployed();

        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        await usdt.deployed();
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, 0); //Auction mode off
        await usdt.mint(owner.address, Utils.toWei('10000'));

        await expect(usdt.transfer(tokenVesting.address, 1000))
                .to.emit(usdt, "Transfer")
                .withArgs(owner.address, tokenVesting.address, 1000);

        // fail from non admin accounts
        await expect(portfolio.connect(trader1).addTrustedContract(tokenVesting.address, "Dexalot")).to.revertedWith("P-OACC-13");
        await expect(portfolio.connect(admin).addTrustedContract(tokenVesting.address, "Dexalot")).to.revertedWith("P-OACC-13");
        // succeed from admin accounts
        await portfolio.addAuctionAdmin(auctionAdmin.address);
        await portfolio.connect(auctionAdmin).addTrustedContract(tokenVesting.address, "Dexalot");

        await ethers.provider.send("evm_increaseTime", [5000]);
        await ethers.provider.send("evm_mine");

        await usdt.connect(trader2).approve(tokenVesting.address, '150');
        await usdt.connect(trader2).approve(portfolio.address, '150');
        await tokenVesting.connect(trader2).releaseToPortfolio(usdt.address);
        expect((await portfolio.getBalance(trader2.address, USDT))[0]).to.equal(150);
        expect(await usdt.balanceOf(trader2.address)).to.equal(0);
    });

    it("Should remove a trusted contract from Portfolio from the auction admin account", async function () {
        let start = await latestTime() + 10000;
        let cliff = 20000;
        let duration = 120000;
        let startPortfolioDeposits = start - 10000;
        let revocable = true;
        let percentage = 15;
        const tokenVesting = await TokenVesting.deploy(trader2.address, start, cliff, duration, startPortfolioDeposits, revocable, percentage, portfolio.address);
        await tokenVesting.deployed();

        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        await usdt.deployed();
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, 0); //Auction mode off

        await usdt.mint(owner.address, Utils.toWei('10000'));
        await usdt.transfer(tokenVesting.address, 1000);

        // fail too add from non admin accounts
        await expect(portfolio.connect(trader1).addTrustedContract(tokenVesting.address, "Dexalot")).to.revertedWith("P-OACC-13");
        await expect(portfolio.connect(admin).addTrustedContract(tokenVesting.address, "Dexalot")).to.revertedWith("P-OACC-13");
        // succeed to add from admin accounts
        await portfolio.addAuctionAdmin(auctionAdmin.address);
        await portfolio.connect(auctionAdmin).addTrustedContract(tokenVesting.address, "Dexalot");
        expect(await portfolio.trustedContracts(tokenVesting.address)).to.be.equal(true);
        // fail to remove from non admin accounts
        await expect(portfolio.connect(trader1).removeTrustedContract(tokenVesting.address)).to.revertedWith("P-OACC-12");
        await expect(portfolio.connect(admin).removeTrustedContract(tokenVesting.address)).to.revertedWith("P-OACC-12");
        // succeed to add from admin accounts
        await portfolio.connect(auctionAdmin).removeTrustedContract(tokenVesting.address);
        expect(await portfolio.trustedContracts(tokenVesting.address)).to.be.equal(false);
    });

    it("Should fail adjustAvailable()", async function () {
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 18;
        usdt = await MockToken.deploy(token_name, token_symbol, token_decimals);
        USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolio.addToken(USDT, usdt.address, 0); //Auction mode off
        // fail if ammount is greater than available
        await expect(portfolio.adjustAvailable(4, trader1.address, USDT, Utils.toWei('10'))).to.revertedWith("P-AFNE-01");
    });

    it("Should revert with non-existing function call", async () => {
        // try calling a scam addMyContract via a modified abi call
        let bogusAbi = "[{\"inputs\":[{\"internalType\":\"address\",\"name\":\"_contract\",\"type\":\"address\"}," +
                       "{\"internalType\":\"string\",\"name\":\"_organization\",\"type\":\"string\"}]," +
                       "\"name\":\"addMyContract\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]";
        let contract = new ethers.Contract(portfolio.address, bogusAbi, owner);
        await expect(contract.addMyContract(trader2.address, "SCAMMER")).to.be.revertedWith("");
    });

});

async function latestTime() {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}
