/**
 * The test runner for Dexalot PortfolioSub contract
 * Please do not test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    GasStation,
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
    let treasurySafe: SignerWithAddress;
    let feeSafe: SignerWithAddress;

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
    let maxFeePerGas: BigNumber;

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");

    const srcChainId: any = 1;
    const tokenDecimals = 18;
    const auctionMode: any = 0;

    before(async function () {
        const { owner: owner1, admin: admin1, auctionAdmin: admin2, trader1: t1, trader2: t2, treasurySafe: ts, feeSafe: fs } = await f.getAccounts();
        owner = owner1;
        admin = admin1;
        auctionAdmin = admin2;
        trader1 = t1;
        trader2 = t2;
        treasurySafe = ts;
        feeSafe= fs;

        console.log("Owner", owner.address);
        console.log("Admin", admin.address );
        console.log("AuctionAdmin", auctionAdmin.address);
        console.log("Trader1", trader1.address);
        console.log("Trader2", trader2.address);
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
        maxFeePerGas = ethers.utils.parseUnits("5", "gwei")
    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolio.initialize(ALOT, srcChainId)).to.be.revertedWith("Initializable: contract is already initialized");
    });

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

        await portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off


        await expect(portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.revertedWith("P-TAEX-01"); //Auction mode off

        // fail from non-privileged account
        // trader1
        await expect(portfolio.connect(trader1).setAuctionMode(USDT, 1)).to.revertedWith("P-OACC-04");
        // auction admin can only change it from ExchangeSub , not from portfolio directly
        await expect(portfolio.connect(auctionAdmin).setAuctionMode(USDT, 1)).to.revertedWith("P-OACC-04");
        // succeed from privileged account
        // auctionAdmin
        await portfolio.connect(owner).setAuctionMode(USDT, 1);
        let tokenDetails = await portfolio.getTokenDetails(USDT);
        expect(tokenDetails.auctionMode).to.be.equal(1);
        // admin
        await portfolio.connect(owner).setAuctionMode(USDT, 0);
        tokenDetails = await portfolio.getTokenDetails(USDT);
        expect(tokenDetails.auctionMode).to.be.equal(0);
        // Test with TradePairs EXECUTOR_ROLE
        await portfolio.grantRole(portfolio.EXECUTOR_ROLE(), trader1.address);
        await portfolio.connect(trader1).setAuctionMode(USDT, 3);
        tokenDetails = await portfolio.getTokenDetails(USDT);
        expect(tokenDetails.auctionMode).to.be.equal(3);
    });


    it("Should set fee address for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setFeeAddress(trader2.address)).to.revertedWith("AccessControl: account");
        await expect(portfolio.connect(admin).setFeeAddress(trader2.address)).to.revertedWith("AccessControl: account");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).setFeeAddress(feeSafe.address);
        expect(await portfolio.feeAddress()).to.be.equal(feeSafe.address);
        // fail for zero address
        await expect(portfolio.connect(admin).setFeeAddress("0x0000000000000000000000000000000000000000")).to.revertedWith("P-OACC-02");
    });

    it("Should set treasury address for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolio.connect(trader1).setTreasury(treasurySafe.address)).to.revertedWith("P-OACC-01");
        await expect(portfolio.connect(admin).setTreasury(treasurySafe.address)).to.revertedWith("P-OACC-01");
        // succeed from admin accounts
        await portfolio.grantRole(portfolio.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolio.connect(admin).setTreasury(treasurySafe.address);
        expect(await portfolio.getTreasury()).to.be.equal(treasurySafe.address);
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
            .to.revertedWith("P-OACC-03");
    });

    it("Should fail adjustAvailable()", async function () {
        await portfolio.addToken(USDT, usdt.address, srcChainId, 6, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off
        // fail if caller is not tradePairs
        await expect(portfolio.adjustAvailable(3, trader1.address, USDT, Utils.toWei('10'))).to.revertedWith("P-OACC-03");

        await portfolio.grantRole(await portfolio.EXECUTOR_ROLE(), owner.address)
        //Send with invalid Tx  Only Tx 3 or 4 allowed
        await expect(portfolio.adjustAvailable(0, owner.address, USDT, Utils.toWei('10'))).to.revertedWith("P-WRTT-02");
    });

    it("Should withdraw native tokens from portfolio to subnet", async () => {
        await f.addToken(portfolioMain, alot, 1); //gasSwapRatio 1
        // alot is already added to subnet during deployment of portfolio

        const initial_amount = await trader1.getBalance();

        let tx = await alot.mint(trader1.address, Utils.toWei(deposit_amount));

        tx = await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT,  deposit_amount);
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
        let receipt:any = await tx.wait();

        let res = await portfolio.getBalance(trader1.address, ALOT);
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

        await portfolio.connect(trader1).withdrawNative(trader1.address, Utils.parseUnits("8", 18))
        // succeed for native using sendTransaction
        const tx2 = await trader1.sendTransaction({to: portfolio.address, value: Utils.parseUnits("4", 18), gasLimit: 300000,
        gasPrice: ethers.utils.parseUnits('50', 'gwei')});
        receipt = await tx2.wait();
        res = await portfolio.getBalance(trader1.address, ALOT);
        Utils.printResults(trader1.address, "after 2nd deposit", res, alot_decimals);
        expect(res.total).to.equal(Utils.toWei("6"));
        expect(res.available).to.equal(Utils.toWei("6"));
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
        const gasThreshold = (await gasStation.gasAmount()).mul(2);
//        console.log (Utils.formatUnits(initial_amount,18), "gasth", Utils.formatUnits(gasThreshold,18))

        // Fail when more than available is being deposited into the portfolio
        // For some reason , revertWith is not matching the error , cd Jan30,23
        // await expect(portfolio.connect(trader1).depositNative(trader1.address, 0, {
        //     value: initial_amount.mul(2),
        //     gasLimit: gas,
        //     gasPrice: gasPrice
        // })).to.be.revertedWith("InvalidInputError: sender doesn't have enough funds to send tx. The max upfront cost is: 2000000000169000320237961 and the sender's account only has: 1000000000000000000000000");

        //Fail when trying to leave almost 0 in the wallet
        await expect(portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: initial_amount.sub(total),
            gasLimit: gas,
            gasPrice: gasPrice
        }))
        .to.be.revertedWith("P-BLTH-01");

        // console.log (Utils.formatUnits(initial_amount.sub(total).sub(gasThreshold),18))

        //Allow if leaving just a bit more than gasThreshold in the wallet.
        await portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: initial_amount.sub(total).sub(gasThreshold.mul(2)),
            gasLimit: gas,
            gasPrice: gasPrice
        });
        const endingBal = Number(await trader1.getBalance())
       // console.log (endingBal, Number(gasThreshold.toString()))

        expect(endingBal).to.be.greaterThan(Number(gasThreshold.toString()))

        //Refill the trader1 balance
        const newBalance = ethers.utils.parseEther('1000000');
        const newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
            trader1.address,
        newBalanceHex, // 1000000 ALOT
        ]);

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

    it("Should get gas Token with autoFill using erc20 (ALOT not available)", async () => {
        const { other2 } = await f.getAccounts();

        //Set GasStation Gas Amount to 0.5 instead of 0.1 ALOT
        await expect(gasStation.setGasAmount(ethers.utils.parseEther("0.5")))
        .to.emit(gasStation, "GasAmountChanged")

        const gasSwapRatioUsdt = 1; //1 usdt per 1 ALOT
        const usdtDepositAmount = Utils.parseUnits(deposit_amount, token_decimals)

        await usdt.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));

        await f.addToken(portfolioMain, usdt, gasSwapRatioUsdt); //gasSwapRatio 1
        await f.addToken(portfolio, usdt, gasSwapRatioUsdt, 0, true); //gasSwapRatio 1

        await portfolioMain.setBridgeParam(USDT, Utils.parseUnits('1', token_decimals), Utils.parseUnits('0.1', token_decimals), true)

        let newBalance = ethers.utils.parseEther('0.25');
        let newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
            trader1.address,
        newBalanceHex, // 0.25 ALOT
        ]);

        let gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        //Deposit tokens for trader1
        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);

        const mainnetBal = (await usdt.balanceOf(portfolioMain.address)).sub(await portfolioMain.bridgeFeeCollected(USDT));

        //console.log((await ethers.provider.getBalance(trader1.address)).toString())

        const usdtTransferAmnt= Utils.parseUnits("10", token_decimals);

        // No change in tokenTotals
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetBal);

        // Transfer USDT to other2 when it has enough gas his wallet
        await portfolio.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);

        // No change in tokenTotals
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetBal);

        const gasDeposited = await gasStation.gasAmount();
        //Check to see it had no impact
        // other2's portfolio usdt balanced should be transferred amount
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt);
        // treasury bal increased by 0.5 ALOT in exchange for 0.5 USDT
        expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(Utils.parseUnits('0.5', token_decimals));
        // Trader1 forced Gas Station balance to change
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)

        newBalance = ethers.utils.parseEther('0.25');
        newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
        other2.address,
        newBalanceHex, // 0.25 ALOT
        ]);

        // fail due to paused portfolio
        await portfolio.pause()
        await expect(portfolio.connect(other2).autoFill(other2.address, USDT, {gasLimit: 200000, maxFeePerGas}))
            .to.revertedWith("Pausable: paused");
        await portfolio.unpause()

        // fail due to missing EXECUTOR_ROLE
        await expect(portfolio.connect(other2).autoFill(other2.address,USDT, {gasLimit: 200000, maxFeePerGas})).to.revertedWith("P-OACC-03");
        await portfolio.grantRole(await portfolio.EXECUTOR_ROLE(), other2.address);
        expect(await portfolio.hasRole(await portfolio.EXECUTOR_ROLE(), other2.address)).to.be.equal(true);


        const usdtSwappedAmnt = (await portfolio.bridgeParams(USDT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))
        const beforeBalance = await other2.getBalance();

        let tx: any = await portfolio.connect(other2).autoFill(other2.address, USDT, {gasLimit: 200000, maxFeePerGas});
        let receipt = await tx.wait();

        let gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

        // No change in tokenTotals
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetBal);

        expect((await ethers.provider.getBalance(other2.address)).sub(beforeBalance.add(gasDeposited))).to.lte(gasUsedInTx);
        // other2's portfolio usdt balanced should be transferred amount - swapped amount  (10 - 0.5)
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.sub(usdtSwappedAmnt));
        // treasury should have an increase of swapped amount  0.5
        expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt.mul(2));
        // gas station  should have a decrease of gasStationGas(default 0.025)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited.mul(2))

        // Set the wallet balance to 1
        newBalance = ethers.utils.parseEther('1');
        newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
        other2.address,
        newBalanceHex, // 1 ALOT
        ]);

        gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        tx = await portfolio.connect(other2).autoFill(other2.address, USDT, {gasLimit: 200000, maxFeePerGas});
        receipt = await tx.wait();

        gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);
        // No change in tokenTotals
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetBal);

        // No Change in the balances except the gas consumption of the tx
        expect((await ethers.provider.getBalance(other2.address)).sub(newBalance)).to.lte(gasUsedInTx);
        // No Change i other2's portfolio usdt balance
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.sub(usdtSwappedAmnt));
        // No Change in treasury balance
        expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt.mul(2));
        // No Change in gas station balance gas station
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);


        // half withdrawn - Sanity Check
        // set the Bridge Fee 1 USDT
        await portfolio.setBridgeParam(USDT, Utils.parseUnits('1', token_decimals), Utils.parseUnits('0.1', token_decimals), true)
        await portfolio.connect(trader1).withdrawToken(trader1.address, USDT, usdtDepositAmount.div(2), 0);
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetBal.sub(await portfolioMain.bridgeFeeCollected(USDT)).div(2).add(Utils.parseUnits('1', token_decimals)));
    })


    it("Should get gas Token with autoFill using Alot ", async () => {
        const { other2 } = await f.getAccounts();

        //Set GasStation Gas Amount to 0.5 instead of 0.1
        await expect(gasStation.setGasAmount(ethers.utils.parseEther("0.5")))
        .to.emit(gasStation, "GasAmountChanged")

        const gasSwapRatioAlot = 1;
        const alotDepositAmount = Utils.parseUnits(deposit_amount, alot_decimals)

        await f.addToken(portfolioMain, alot, gasSwapRatioAlot); //gasSwapRatio 1
        await alot.mint(trader1.address, (BigNumber.from(2)).mul(alotDepositAmount));

        await portfolioMain.setBridgeParam(ALOT, Utils.parseUnits('1', alot_decimals), Utils.parseUnits('1', alot_decimals), true)

        let newBalance = ethers.utils.parseEther('0.25');
        let newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
            trader1.address,
        newBalanceHex, // 0.25 ALOT
        ]);

        let gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount, 0);
        const bridgeFeeCollected= await portfolioMain.bridgeFeeCollected(ALOT)
        const mainnetBal = (await alot.balanceOf(portfolioMain.address)).sub(bridgeFeeCollected);

        const gasDeposited = await gasStation.gasAmount();

        const alotTransferAmnt= Utils.parseUnits("10", alot_decimals);
        // console.log ((await portfolio.tokenTotals(ALOT)).toString())
        // console.log ((await portfolio.getBalance(trader1.address, ALOT)).total.toString())
        // No change in tokenTotals- SanityCheck
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetBal);
        // Trader1 got ALOT deposited to his wallet
        expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(alotDepositAmount.sub(gasDeposited).sub(bridgeFeeCollected));

        // Now transfer Native Token ALOT
        await portfolio.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);
        // No change in tokenTotals- SanityCheck
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetBal);

        //Check to see it had no impact
        // other2's portfolio usdt balanced should be transferred amount
        expect((await portfolio.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt);
        // no change
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
       // gas station  should have a decrease of gasStationGas(default 0.025)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);

        newBalance = ethers.utils.parseEther('0.25');
        newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
        other2.address,
        newBalanceHex, // 0.25 ALOT
        ]);

        const alotSwappedAmnt = (await portfolio.bridgeParams(ALOT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

        await expect(portfolio.connect(other2).autoFill(other2.address, ALOT, {gasLimit: 200000, maxFeePerGas})).to.revertedWith("P-OACC-03");
        await portfolio.grantRole(await portfolio.EXECUTOR_ROLE(), other2.address);
        expect(await portfolio.hasRole(await portfolio.EXECUTOR_ROLE(), other2.address)).to.be.equal(true);

        const beforeBalance = await other2.getBalance();

        let tx: any = await portfolio.connect(other2).autoFill(other2.address, ALOT, {gasLimit: 200000, maxFeePerGas});
        let receipt = await tx.wait();

        let gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

        // No change in tokenTotals- SanityCheck
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetBal);

        expect((await ethers.provider.getBalance(other2.address)).sub(beforeBalance.add(gasDeposited))).to.lte(gasUsedInTx);
        // other2's portfolio ALOT balanced should be transferred amount - swapped amount  (10 - 0.5)
        expect((await portfolio.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.sub(alotSwappedAmnt));
        // treasury should have no change. ALOT directly transferred to wallet
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        // gas station  should have a no change. ALOT directly transferred to wallet
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)

        newBalance = ethers.utils.parseEther('1');
        newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
        other2.address,
        newBalanceHex, // 1 ALOT
        ]);

        gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        tx = await portfolio.connect(other2).autoFill(other2.address, ALOT, {gasLimit: 200000, maxFeePerGas});
        receipt = await tx.wait();

        gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

        // No change in tokenTotals- SanityCheck
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetBal);

        // No Change in the balances except the gas consumption of the tx
        expect((await ethers.provider.getBalance(other2.address)).sub(newBalance)).to.lte(gasUsedInTx);
         // No Change i other2's portfolio usdt balance
        expect((await portfolio.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.sub(alotSwappedAmnt));
         // No Change in treasury balance
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
         // No Change in gas station balance gas station
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)
        // gas station  should have a decrease of gasStationGas(default 0.025)
        //expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)

        //console.log ((await portfolio.getBalance(trader1.address, ALOT)).total.toString())

        newBalance = ethers.utils.parseEther('10');
        newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
            trader1.address,
        newBalanceHex, // 1 ALOT
        ]);

        const addRemGasAmnt= Utils.parseUnits('1', alot_decimals)
        //Add Gas Sanity Check
        await portfolio.connect(trader1).withdrawNative(trader1.address, addRemGasAmnt)
        //No change
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetBal);

        //Remove Gas Sanity Check
        await portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: addRemGasAmnt
        });
        //No change
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetBal);

        // half withdrawn - Sanity Check
        // set the Bridge Fee 1 ALOT
        await portfolio.setBridgeParam(ALOT, Utils.parseUnits('1', alot_decimals), Utils.parseUnits('0.1', alot_decimals), true)
        await portfolio.connect(trader1).withdrawToken(trader1.address, ALOT, alotDepositAmount.div(2), 0);
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetBal.sub(await portfolioMain.bridgeFeeCollected(ALOT)).div(2).add(Utils.parseUnits('1', alot_decimals)));

    })

    it("Should get gas Token ALOT from portfolio when sending erc20 using autoFill if portfolio(ALOT) > gasSwapRatio", async () => {
        const { other2 } = await f.getAccounts();

        //Set GasStation Gas Amount to 0.5 instead of 0.0255
        await expect(gasStation.setGasAmount(ethers.utils.parseEther("0.5")))
        .to.emit(gasStation, "GasAmountChanged")

        const gasSwapRatioAlot = 1;
        const gasSwapRatioUsdt = 0.5;

        const usdtDepositAmount = Utils.parseUnits(deposit_amount, token_decimals)
        const alotDepositAmount = Utils.parseUnits(deposit_amount, alot_decimals)

        await usdt.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));

        await f.addToken(portfolioMain, usdt, gasSwapRatioUsdt); //gasSwapRatio 0.5
        await f.addToken(portfolio, usdt, gasSwapRatioUsdt, 0, true); //gasSwapRatio 0.5


        await f.addToken(portfolioMain, alot, gasSwapRatioAlot); //gasSwapRatio 1
        await alot.mint(trader1.address, (BigNumber.from(2)).mul(alotDepositAmount));

        await portfolioMain.setBridgeParam(USDT, Utils.parseUnits('1', token_decimals), Utils.parseUnits('0.1', token_decimals), true)
        await portfolioMain.setBridgeParam(ALOT, Utils.parseUnits('2', alot_decimals), Utils.parseUnits('0.1', alot_decimals), true)

        let newBalance = ethers.utils.parseEther('0.25');
        let newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
            trader1.address,
        newBalanceHex, // 0.25 ALOT
        ]);
        const gasDeposited = await gasStation.gasAmount();
        const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)

        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount, 0);
        const bridgeFeeCollected= await portfolioMain.bridgeFeeCollected(ALOT)
        // Trader1 got ALOT deposited to his wallet
        expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(alotDepositAmount.sub(gasDeposited).sub(bridgeFeeCollected));
        await ethers.provider.send("hardhat_setBalance", [
            trader1.address,
        newBalanceHex, // 0.25 ALOT
        ]);

        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);
        // Trader1 got ALOT deposited AGAIN to his wallet, not USDT
        expect((await portfolio.getBalance(trader1.address, ALOT)).total).to.equal(alotDepositAmount.sub(gasDeposited.mul(2)).sub(bridgeFeeCollected));

        const mainnetUSDTBal = (await usdt.balanceOf(portfolioMain.address)).sub(await portfolioMain.bridgeFeeCollected(USDT));
        const mainnetALOTBal = (await alot.balanceOf(portfolioMain.address)).sub(await portfolioMain.bridgeFeeCollected(ALOT));

        // No change in tokenTotals
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetUSDTBal);
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetALOTBal);

        const usdtTransferAmnt= Utils.parseUnits("10", token_decimals);
        const alotTransferAmnt= Utils.parseUnits("10", alot_decimals);

        // Transfer USDT to other2 when he has 0 ALOT in his wallet
        await portfolio.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);
        await portfolio.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);

        // No change in tokenTotals
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetUSDTBal);
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetALOTBal);

        //Check to see it had no impact
        // other2's portfolio usdt balanced should be transferred amount
        expect((await portfolio.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt);
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt);
        // treasury should have an increase of swaped amount  0.5
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(0);
        // gas station  should have a decrease of gasStationGas(default 0.025)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);


        newBalance = ethers.utils.parseEther('0.25');
        newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
        other2.address,
        newBalanceHex, // 0.25 ALOT
        ]);


        await expect(portfolio.connect(other2).autoFill(other2.address, USDT, {gasLimit: 200000, maxFeePerGas})).to.revertedWith("P-OACC-03");
        await portfolio.grantRole(await portfolio.EXECUTOR_ROLE(), other2.address);
        expect(await portfolio.hasRole(await portfolio.EXECUTOR_ROLE(), other2.address)).to.be.equal(true);

        const beforeBalance = await other2.getBalance();

        const alotSwappedAmnt = (await portfolio.bridgeParams(ALOT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

        const tx: any = await portfolio.connect(other2).autoFill(other2.address, USDT, {gasLimit: 200000, maxFeePerGas});
        const receipt = await tx.wait();

        const gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

        // No change in tokenTotals
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetUSDTBal);
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetALOTBal);

        expect((await ethers.provider.getBalance(other2.address)).sub(beforeBalance.add(gasDeposited))).to.lte(gasUsedInTx);
        // no change on other2's portfolio usdt balance
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt);
        // treasury should have NO increase
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        // gas station  should have No increase
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)


        // half withdrawn - Sanity Check
        // set the Subnet Bridge Fee 1 USDT & 2 ALOT
        await portfolio.setBridgeParam(USDT, Utils.parseUnits('1', token_decimals), Utils.parseUnits('0.1', token_decimals), true)
        await portfolio.setBridgeParam(ALOT, Utils.parseUnits('2', alot_decimals), Utils.parseUnits('0.1', alot_decimals), true)
        await portfolio.connect(trader1).withdrawToken(trader1.address, USDT, usdtDepositAmount.div(2), 0);
        expect(await portfolio.tokenTotals(USDT)).to.equal(mainnetUSDTBal.sub(await portfolioMain.bridgeFeeCollected(USDT)).div(2).add(Utils.parseUnits('1', token_decimals)));

        await portfolio.connect(trader1).withdrawToken(trader1.address, ALOT, alotDepositAmount.div(2), 0);
        expect(await portfolio.tokenTotals(ALOT)).to.equal(mainnetALOTBal.sub(await portfolioMain.bridgeFeeCollected(ALOT)).div(2).add(Utils.parseUnits('2', alot_decimals)));
        //Give enough gas to trader1 for the remaining tests
        newBalance = ethers.utils.parseEther('1000000');
        newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
        await ethers.provider.send("hardhat_setBalance", [
            trader1.address,
        newBalanceHex, // 1 ALOT
        ]);
    })

    it("Should get gas Token when sending erc20 using transferToken ", async () => {
        const { other2 } = await f.getAccounts();
        await ethers.provider.send("hardhat_setBalance", [
            other2.address,
            "0x0"
          ]);

        const gasSwapRatioUsdt = 5;
        const usdtDepositAmount = Utils.parseUnits(deposit_amount, token_decimals)

        await usdt.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));

        await f.addToken(portfolioMain, usdt, gasSwapRatioUsdt); //gasSwapRatio 5
        await f.addToken(portfolio, usdt, gasSwapRatioUsdt, 0, true); //gasSwapRatio 5

        // Start with 0 wallet balance
        expect((await ethers.provider.getBalance(other2.address))).to.equal(ethers.BigNumber.from(0));

        //Deposit tokens for trader1
        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);

        const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        const usdtTransferAmnt= Utils.parseUnits("10", token_decimals);

        const gasDeposited = await gasStation.gasAmount();
        const usdtSwappedAmnt = (await portfolio.bridgeParams(USDT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

        // Transfer USDT to other2 when he has 0 ALOT in his wallet
        await portfolio.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);


        // other2 should have gasStationGas(default 0.025)  ALOT in his wallet
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        // other2's portfolio usdt balanced should be transferred amount - swaped amount  (10 - 0.5)
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.sub(usdtSwappedAmnt));
        // treasury should have an increase of swaped amount  0.5
        expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt);
        // gas station  should have a decrease of gasStationGas(default 0.025)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)

        // Transfer same amount of USDT again. Other2 already has ALOT in his wallet. Should not deposit ALOT again
        await portfolio.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);

        // No impact on Wallet
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        //Other2's USDT balance is transferamount *2 - swaped amount  (20 - 0.5)
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.mul(2).sub(usdtSwappedAmnt));
        expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt);
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)


        //Set the other2's wallet to half of gasStationGas(default 0.025)
        const WalBaltoReset =gasDeposited.div(2);
        await ethers.provider.send("hardhat_setBalance", [
            other2.address,
            WalBaltoReset.toHexString(),
          ]);

       await portfolio.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);
       // Only 0.025 should be added
       expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited.add(WalBaltoReset));
       //Other2's USDT balance is transferamount *3 - swaped amount  (20 - 0.5- 0.5)
       expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.mul(3).sub(usdtSwappedAmnt.mul(2)));
       // treasury should have an increase of swaped amount  by 0.5 total 1
       expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt.mul(2));
        // gas station  should have a decrease of another 0.025  gasStationGas(default 0.025)
       expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited.mul(2));

    })

    it("Should get gas Token sending ALOT using transferToken", async () => {
        const { other2 } = await f.getAccounts();
        //Reset wallet balance to 0
        await ethers.provider.send("hardhat_setBalance", [
            other2.address,
            "0x0", // 0 ALOT
        ]);
        const gasSwapRatioAlot = 1;
        const alotDepositAmount = Utils.parseUnits(deposit_amount, alot_decimals)

        await f.addToken(portfolioMain, alot, gasSwapRatioAlot); //gasSwapRatio 1
        await alot.mint(trader1.address, (BigNumber.from(2)).mul(alotDepositAmount));

        // Start with 0 wallet balance
        expect((await ethers.provider.getBalance(other2.address))).to.equal(ethers.BigNumber.from(0));

        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount, 0);

        const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)

        const alotTransferAmnt= Utils.parseUnits("10", alot_decimals);
        const gasDeposited = await gasStation.gasAmount();


        // Now transfer Native Token ALOT
        await portfolio.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);
        const alotSwappedAmnt = (await portfolio.bridgeParams(ALOT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18));
        // No Impact on the numbers other than Other2's portfolio ALOT balance
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        expect((await portfolio.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.sub(alotSwappedAmnt));
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)

        // Should not deposit ALOT again
        await portfolio.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);

        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        expect((await portfolio.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.mul(2).sub(alotSwappedAmnt));
        // No impact on treasury nor the GasStation
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)

        const WalBaltoReset = gasDeposited.div(2);
        await ethers.provider.send("hardhat_setBalance", [
            other2.address,
            WalBaltoReset.toHexString(), // 0.05 ALOT
        ]);


        await portfolio.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);
        // gasDeposited fully
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited.add(WalBaltoReset));
        expect((await portfolio.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.mul(3).sub(alotSwappedAmnt.mul(2)));
        // No impact on treasury nor the GasStation
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);


    })

    it("Should get gas Token from portfolio ALOT when sending erc20 using transferToken if portfolio(ALOT) > gasSwapRatio", async () => {
        const { other2 } = await f.getAccounts();
        await ethers.provider.send("hardhat_setBalance", [
            other2.address,
            "0x0",
          ]);

        const gasSwapRatioAlot = 1;
        const gasSwapRatioUsdt = 5;

        const usdtDepositAmount = Utils.parseUnits(deposit_amount, token_decimals)
        const alotDepositAmount = Utils.parseUnits(deposit_amount, alot_decimals)

        await usdt.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));

        await f.addToken(portfolioMain, usdt, gasSwapRatioUsdt); //gasSwapRatio 5
        await f.addToken(portfolio, usdt, gasSwapRatioUsdt, 0, true); //gasSwapRatio 5


        await f.addToken(portfolioMain, alot, gasSwapRatioAlot); //gasSwapRatio 1
        await alot.mint(trader1.address, (BigNumber.from(2)).mul(alotDepositAmount));

        // Start with 0 wallet balance
        expect((await ethers.provider.getBalance(other2.address))).to.equal(ethers.BigNumber.from(0));

        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount, 0);
        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);

        const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)

        const usdtTransferAmnt= Utils.parseUnits("10", token_decimals);
        const alotTransferAmnt= Utils.parseUnits("10", alot_decimals);

        // Transfer USDT to other2 when he has 0 ALOT in his wallet
        await portfolio.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);

        const gasDeposited = await gasStation.gasAmount();

        const usdtSwappedAmnt = (await portfolio.bridgeParams(USDT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

        // other2 should have gasStationGas(default 0.025)  ALOT in his wallet
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        // other2's portfolio usdt balanced should be transferred amount - swaped amount  (10 - 0.5)
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.sub(usdtSwappedAmnt));
        // treasury should have an increase of swaped amount  0.5
        expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt);
        // gas station  should have a decrease of gasStationGas(default 0.1)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)

        const alotSwappedAmnt = (await portfolio.bridgeParams(ALOT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18));

        // Now transfer Native Token ALOT for other2 to have ALOT i his portfolio- No gas swap expected
        await portfolio.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);

        //Reset wallet balance
        await ethers.provider.send("hardhat_setBalance", [
            other2.address,
            "0x0", // 0 ALOT
            ]);

        // Now transferring USDT but other2 already has ALOT in his portfolio. So we only use his ALOT and we don't swap
        await portfolio.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);
        // other2 should have gasStationGas(default 0.025)  ALOT in his wallet
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        // other2's portfolio ALOT balance should be transferred amount - swaped amount  (10 - 0.025)
        expect((await portfolio.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.sub(alotSwappedAmnt));
        // treasury should have an increase of swaped amount  0.025
        expect((await portfolio.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        // gas station  should have a decrease of gasStationGas(default 0.025) * 2
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited);

        // other2's portfolio usdt balanced should be transferred amount *2  - swaped amount  (20 - 0.5) No change from before
        expect((await portfolio.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.mul(2).sub(usdtSwappedAmnt));
        // treasury should have no change on usdt balances
        expect((await portfolio.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt);
    })

    it("Should transfer token from portfolio to portfolio", async () => {

        await alot.mint(trader1.address, (BigNumber.from(2)).mul(Utils.parseUnits(deposit_amount, 18)));
        await portfolioMain.addToken(ALOT, alot.address, srcChainId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals));

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

        await expect(portfolio.connect(trader1).depositNative(trader1.address, 0, {
            value: Utils.toWei("0")
        })).to.be.revertedWith("P-TNEF-01");

        await expect(portfolio.connect(trader1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount).add(1)))
        .to.be.revertedWith("P-AFNE-02");

        await portfolio.setAuctionMode(AVAX, 2);
        await expect(portfolio.connect(trader1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount)))
        .to.be.revertedWith("P-AUCT-01");
        await portfolio.setAuctionMode(AVAX, 0);

        await portfolio.connect(trader1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount));

        expect((await portfolio.getBalance(trader2.address, AVAX)).total).to.equal(Utils.toWei(deposit_amount));


    })

    it("Should add and remove ERC20 token to portfolio sub", async () => {
        // fail for non-admin
        await expect(portfolio.connect(trader1).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        // succeed for admin
        await portfolio.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off
        const tokens = await portfolio.getTokenList();
        expect(tokens[2]).to.equal(USDT);

        await expect(portfolio.removeToken(USDT, srcChainId)).to.be.revertedWith("Pausable: not paused");
        await portfolio.pause();
        await expect(portfolio.connect(trader1).removeToken(USDT, srcChainId)).to.be.revertedWith("AccessControl: account");

        await expect(portfolio.removeToken(USDT, srcChainId))
        .to.emit(portfolio, "ParameterUpdated")
        .withArgs(USDT, "P-REMOVETOKEN", 0, 0);

        // do nothing for non-existent token
        await portfolio.removeToken(Utils.fromUtf8("MOCK"), srcChainId)

        // can't remove ALOT token
        await portfolio.removeToken(Utils.fromUtf8("ALOT"), srcChainId)

    });

    it("Should not remove erc20 if it has deposits", async () => {
        await usdt.mint(trader1.address, ethers.utils.parseEther("100"))

        await f.addToken(portfolioMain, usdt, 0.5);
        await f.addToken(portfolio, usdt, 0.5);

        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, "100")

        expect((await portfolio.getBalance(trader1.address, USDT)).total.toString()).to.equal(Utils.parseUnits("100", token_decimals));
        await portfolio.pause();
        await expect(portfolio.removeToken(USDT, srcChainId)).to.be.revertedWith("P-TTNZ-01");
    });

    it("Should get token details", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await f.addToken(portfolioMain, usdt, 0.5);
        await f.addToken(portfolio, usdt, 0.5);

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

        // fail with 0 quantity
        await expect(portfolio.processXFerPayload(trader2.address, AVAX, 0, Tx)).to.be.revertedWith("P-ZETD-01");
        // fail due to non existent token
        await expect(portfolio.processXFerPayload(trader2.address, Utils.fromUtf8("NOT_EXISTING_TOKEN"), Utils.toWei("0.01"), Tx)).to.be.revertedWith("P-ETNS-01");

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
        await expect(portfolio.removeToken(SYMBOL, srcChainId)).to.be.revertedWith("Pausable: not paused");

        // silent fail if token is not in the token list
        await portfolio.pause();
        await portfolio.removeToken(SYMBOL, srcChainId);
        tokenList = await portfolio.getTokenList();
        expect(tokenList.length).to.be.equal(2);
        // fail adding 0 decimals native
        await expect(portfolio.addToken(Utils.fromUtf8(native), ZERO_ADDRESS, srcChainId, 0, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-CNAT-01");

        // fail with decimals 0 token
        await expect(portfolio.addToken(SYMBOL, t.address, srcChainId, 0, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-CNAT-01");
        // check AVAX
        tokenList = await portfolio.getTokenList();
        expect(tokenList.includes(AVAX)).to.be.true;

        // succeed adding MOCK
        await portfolio.addToken(SYMBOL, t.address, srcChainId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals));
        tokenList = await portfolio.getTokenList();
        expect(tokenList.includes(SYMBOL)).to.be.true;

        // succeed removing AVAX
        await portfolio.removeToken(AVAX, srcChainId);
        tokenList = await portfolio.getTokenList();
        expect(tokenList.includes(AVAX)).to.be.false;

        // succeed removing AVAX
        await portfolio.removeToken(SYMBOL, srcChainId);
        tokenList = await portfolio.getTokenList();
        expect(tokenList.includes(SYMBOL)).to.be.false;
    });


});
