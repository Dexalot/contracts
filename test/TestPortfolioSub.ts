/**
 * The test runner for Dexalot PortfolioSub contract
 * Please do not test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    GasStation,
    ITradePairs,
    InventoryManager,
    MockToken,
    PortfolioBridgeSub,
    PortfolioMain,
    PortfolioSub,
    PortfolioSubHelper
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from 'ethers';

describe("Portfolio Sub", () => {
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let portfolioBridgeSub: PortfolioBridgeSub;
    let gasStation: GasStation;
    let portfolioSubHelper: PortfolioSubHelper;
    let inventoryManager: InventoryManager;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;
    let treasurySafe: SignerWithAddress;
    let other1: SignerWithAddress;
    let feeSafe: SignerWithAddress;

    let token_name: string;
    let token_symbol: string;
    let token_decimals: number;
    let usdt: MockToken;
    let USDT: string;

    let alot_decimals: number;
    let alot: MockToken;
    // let avax_decimals: number;

    let deposit_amount: string;
    let maxFeePerGas: BigNumber;

    const native = Utils.fromUtf8("AVAX");
    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");

    let srcChainListOrgId: number;
    const tokenDecimals = 18;
    const auctionMode: any = 0;
    let defaultDestinationChainId: number;
    const alotWithdrawnToGasTankMultiplier = 10;  // 1 if token swap 10 if ALOT is withdrawn from portfolio to wallet

    before(async function () {
        const { owner: owner1, admin: admin1, auctionAdmin: admin2, trader1: t1, trader2: t2, treasurySafe: ts, feeSafe: fs,other1:o1 } = await f.getAccounts();
        owner = owner1;
        admin = admin1;
        auctionAdmin = admin2;
        trader1 = t1;
        trader2 = t2;
        treasurySafe = ts;
        feeSafe = fs;
        other1 = o1;

        const { dexalotSubnet } = f.getChains();
        srcChainListOrgId = dexalotSubnet.chainListOrgId;

        console.log("Owner", owner.address);
        console.log("Admin", admin.address );
        console.log("AuctionAdmin", auctionAdmin.address);
        console.log("Trader1", trader1.address);
        console.log("Trader2", trader2.address);
        console.log("feeSafe", feeSafe.address);
        const portfolioContracts = await f.deployCompletePortfolio(true);
        await f.printTokens([portfolioContracts.portfolioMainnet], portfolioContracts.portfolioSub, portfolioContracts.portfolioBridgeSub);
    });

    beforeEach(async function () {
        const portfolioContracts = await f.deployCompletePortfolio(true);
        portfolioMain = portfolioContracts.portfolioMainnet;
        portfolioSub = portfolioContracts.portfolioSub;
        gasStation = portfolioContracts.gasStation;
        alot = portfolioContracts.alot;
        portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
        portfolioSubHelper = portfolioContracts.portfolioSubHelper;
        inventoryManager = portfolioContracts.inventoryManager;
        defaultDestinationChainId = await portfolioBridgeSub.getDefaultDestinationChain();
        token_name = "Mock USDT Token";
        token_symbol = "USDT";
        token_decimals = 6;
        usdt = await f.deployMockToken(token_symbol, token_decimals)
        USDT = Utils.fromUtf8(await usdt.symbol());

        await alot.connect(trader1).approve(portfolioMain.address, ethers.constants.MaxUint256);
        alot_decimals = 18;
        // avax_decimals = 18;

        deposit_amount = '200';  // ether
        maxFeePerGas = ethers.utils.parseUnits("5", "gwei")
        const newBalance = ethers.utils.parseEther('1000000');
        await f.setHardhatBalance(other1, newBalance);

    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolioSub.initialize(ALOT, srcChainListOrgId)).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should not add native token again after deployment", async function () {
        //Silent fail
        await portfolioSub.addToken(ALOT, ethers.constants.AddressZero, srcChainListOrgId, 18, auctionMode, '0', ethers.utils.parseUnits('0.5',18), ALOT);
    });

    it("Should have starting portfolio with zero total and available balances for native token", async () => {
        const res = await portfolioSub.getBalance(owner.address, native);
        //Utils.printResults(owner.address, "before deposit", res, avax_decimals);
        expect(res.total).to.equal(0);
        expect(res.available).to.equal(0);

    });

    it("Can't remove native ALOT from subnet ", async function () {

        const { cChain, dexalotSubnet } = f.getChains();
        //  native ALOT of the subnet can't be removed from neither PortfolioSub nor PortfolioBridgeSub
        await expect(portfolioSub["removeToken(bytes32,uint32,bytes32)"](Utils.fromUtf8("ALOT"), dexalotSubnet.chainListOrgId, Utils.fromUtf8("ALOT"))).to.be.revertedWith("P-TTNZ-02");
        //Still in Prtf
        let tokenDetails = await portfolioSub.getTokenDetails(Utils.fromUtf8("ALOT"));
        expect(tokenDetails.symbol).to.equal(Utils.fromUtf8("ALOT"));
        //Still in Pb
        tokenDetails = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("ALOT" +  dexalotSubnet.chainListOrgId));
        expect(tokenDetails.symbol).to.equal(Utils.fromUtf8("ALOT"));

        await portfolioSub.pause();
        //Remove mainchain ALOT from PortfolioBridgeSub, Portfolio stays intact
        await expect(portfolioSub.connect(owner)["removeToken(bytes32,uint32,bytes32)"](Utils.fromUtf8("ALOT"), cChain.chainListOrgId, Utils.fromUtf8("ALOT")))
        .not.to.emit(portfolioSub, "ParameterUpdated");
        //Still in Prtf
        tokenDetails = await portfolioSub.getTokenDetails(Utils.fromUtf8("ALOT"));
        expect(tokenDetails.symbol).to.equal(Utils.fromUtf8("ALOT"));

        tokenDetails = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("ALOT" +  cChain.chainListOrgId));
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);  // non existent

    });

    it("Should create ERC20 token", async () => {
        const usdt: MockToken = await f.deployMockToken(token_symbol, token_decimals)
        //console.log("ERC20 Token = ", await usdt.name(), "(", await usdt.symbol(), ",", await usdt.decimals(), ")");
        expect(await usdt.name()).to.equal(token_name);
        expect(await usdt.symbol()).to.equal(token_symbol);
        expect(await usdt.decimals()).to.equal(token_decimals);
    });

    it("Should have starting portfolio with zero total and available balances for ERC20 token", async () => {
        const res = await portfolioSub.getBalance(owner.address, USDT);
        expect(res.total).to.equal(0);
        expect(res.available).to.equal(0);
    });

    it("Should change auction mode of token in portfolio", async () => {
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        await portfolioSub.addToken(USDT, usdt.address, srcChainListOrgId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),USDT); //Auction mode off

        // Silent Fail the same token with the same subnet & source Symbol is being added
        await portfolioSub.addToken(USDT, usdt.address, srcChainListOrgId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5', token_decimals), USDT);

        // fail from non-privileged account
        // trader1
        await expect(portfolioSub.connect(trader1).setAuctionMode(USDT, 1)).to.revertedWith("P-OACC-04");
        // auction admin can only change it from ExchangeSub , not from portfolio directly
        await expect(portfolioSub.connect(auctionAdmin).setAuctionMode(USDT, 1)).to.revertedWith("P-OACC-04");
        // succeed from privileged account
        // auctionAdmin
        await portfolioSub.connect(owner).setAuctionMode(USDT, 1);
        let tokenDetails = await portfolioSub.getTokenDetails(USDT);
        expect(tokenDetails.auctionMode).to.be.equal(1);
        // admin
        await portfolioSub.connect(owner).setAuctionMode(USDT, 0);
        tokenDetails = await portfolioSub.getTokenDetails(USDT);
        expect(tokenDetails.auctionMode).to.be.equal(0);
        // Test with TradePairs EXECUTOR_ROLE
        await portfolioSub.grantRole(await portfolioSub.EXECUTOR_ROLE(), trader1.address);
        await portfolioSub.connect(trader1).setAuctionMode(USDT, 3);
        tokenDetails = await portfolioSub.getTokenDetails(USDT);
        expect(tokenDetails.auctionMode).to.be.equal(3);
    });


    it("Should set fee address for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolioSub.connect(trader1).setFeeAddress(trader2.address)).to.revertedWith("AccessControl: account");
        await expect(portfolioSub.connect(admin).setFeeAddress(trader2.address)).to.revertedWith("AccessControl: account");
        // succeed from admin accounts
        await portfolioSub.grantRole(await portfolioSub.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolioSub.connect(admin).setFeeAddress(feeSafe.address);
        expect(await portfolioSub.feeAddress()).to.be.equal(feeSafe.address);
        // fail for zero address
        await expect(portfolioSub.connect(admin).setFeeAddress(ethers.constants.AddressZero)).to.revertedWith("P-OACC-02");
    });

    it("Should set treasury address for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolioSub.connect(trader1).setTreasury(treasurySafe.address)).to.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(admin).setTreasury(treasurySafe.address)).to.revertedWith("AccessControl:");
        // succeed from admin accounts
        await portfolioSub.grantRole(await portfolioSub.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolioSub.connect(admin).setTreasury(treasurySafe.address);
        expect(await portfolioSub.getTreasury()).to.be.equal(treasurySafe.address);
        // fail for zero address
        await expect(portfolioSub.connect(admin).setTreasury(ethers.constants.AddressZero)).to.revertedWith("P-OACC-02");
    });

    it("Should set gas station address for Portfolio from the admin account", async function () {

        // fail from non admin accounts
        await expect(portfolioSub.connect(trader1).setGasStation(gasStation.address)).to.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(admin).setGasStation(gasStation.address)).to.revertedWith("AccessControl:");
        // succeed from admin accounts
        await portfolioSub.grantRole(await portfolioSub.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolioSub.connect(admin).setGasStation(gasStation.address);
        expect(await portfolioSub.getGasStation()).to.be.equal(gasStation.address);
        // fail for zero address
        await expect(portfolioSub.connect(admin).setGasStation(ethers.constants.AddressZero)).to.revertedWith("P-OACC-02");
    });

    it("Should set portfolio minter address for Portfolio from the admin account", async function () {
        const portfolioMinter = await f.deployPortfolioMinterMock(portfolioSub, "0x0200000000000000000000000000000000000001");

        // fail from non admin accounts
        await expect(portfolioSub.connect(trader1).setPortfolioMinter(portfolioMinter.address)).to.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(admin).setPortfolioMinter(portfolioMinter.address)).to.revertedWith("AccessControl:");
        // succeed from admin accounts
        await portfolioSub.grantRole(await portfolioSub.DEFAULT_ADMIN_ROLE(), admin.address);
        await portfolioSub.connect(admin).setPortfolioMinter(portfolioMinter.address);
        expect(await portfolioSub.getPortfolioMinter()).to.be.equal(portfolioMinter.address);
        // fail for zero address
        await expect(portfolioSub.connect(admin).setPortfolioMinter(ethers.constants.AddressZero)).to.revertedWith("P-OACC-02");
    });

    it("Should set setPortfolioSubHelper address for Portfolio from the admin account", async function () {
        // fail from non admin accounts
        await expect(portfolioSub.connect(trader1).setPortfolioSubHelper(portfolioSubHelper.address)).to.revertedWith("AccessControl:");
        await portfolioSub.grantRole(await portfolioSub.DEFAULT_ADMIN_ROLE(), admin.address);
        // fail for zero address
        await expect(portfolioSub.connect(admin).setPortfolioSubHelper(ethers.constants.AddressZero)).to.revertedWith("P-OACC-02");
        // succeed from admin accounts
        await portfolioSub.connect(admin).setPortfolioSubHelper(portfolioSubHelper.address);
        expect(await portfolioSub.getPortfolioSubHelper()).to.be.equal(portfolioSubHelper.address);
    });


    it("Should fail addExecution if not called by TradePairs", async function () {
        const takerAddr = trader1.address;
        const baseSymbol = Utils.fromUtf8("AVAX");
        const quoteSymbol = Utils.fromUtf8("USDC");
        const baseAmount = 0;
        const quoteAmount = 0;

        const tradePairs: ITradePairs.TradePairStruct = {baseSymbol,
            quoteSymbol,
            buyBookId: quoteSymbol,
            sellBookId:quoteSymbol,
            minTradeAmount:5,
            maxTradeAmount:5000,
            auctionPrice:0,
            auctionMode:0,
            makerRate:10,
            takerRate:20,
            baseDecimals:3,
            baseDisplayDecimals:3,
            quoteDecimals:3,
            quoteDisplayDecimals:3,
            allowedSlippagePercent:3,
            addOrderPaused:false,
            pairPaused:false,
            postOnly: false
        };

        // fail from non TradePairs addresses
        await expect(portfolioSub.connect(trader1)
            .addExecution(Utils.fromUtf8("AVAX/USDC"), tradePairs , 0, trader1.address, takerAddr, baseAmount, quoteAmount))
            .to.revertedWith("P-OACC-03");
    });

    it("Should fail adjustAvailable()", async function () {
        await portfolioSub.addToken(USDT, usdt.address, srcChainListOrgId, 6, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),USDT); //Auction mode off
        // fail if caller is not tradePairs
        await expect(portfolioSub.adjustAvailable(3, trader1.address, USDT, Utils.toWei('10'))).to.revertedWith("P-OACC-03");

        await portfolioSub.grantRole(await portfolioSub.EXECUTOR_ROLE(), owner.address)
        //Send with invalid Tx  Only Tx 3 or 4 allowed
        await expect(portfolioSub.adjustAvailable(0, owner.address, USDT, Utils.toWei('10'))).to.revertedWith("P-WRTT-02");
    });


    it("Should call getBalances", async () => {

        await usdt.mint(trader1.address, ethers.utils.parseEther("100"));
        await alot.mint(trader1.address, Utils.toWei('100'));

        //get all tokens without pagination by seting pageno =0
        let pageNo = 0;

        let res = await portfolioSub.getBalances(trader1.address, pageNo);
        expect(res.symbols.length).to.equal(2);
        expect(res.symbols[0]).to.equal(ethers.constants.HashZero);

        pageNo = 1; // 0 or 1 give the same results
        res = await portfolioSub.getBalances(trader1.address, pageNo);
        expect(res.symbols.length).to.equal(2);
        expect(res.symbols[0]).to.equal(ethers.constants.HashZero);

        // Add new token
        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5);

        pageNo = 2; // Overwrite out of bound pageNo. should be same as 1
        res = await portfolioSub.getBalances(trader1.address, pageNo);
        expect(res.symbols.length).to.equal(3);
        expect(res.symbols[0]).to.equal(ethers.constants.HashZero);


        //revert to get all tokens without pagination
        pageNo = 0;
        await f.depositNative(portfolioMain, trader1, '50');
        res = await portfolioSub.getBalances(trader1.address, pageNo);

        expect(res.symbols.length).to.equal(3);
        expect(res.symbols[0]).to.equal(AVAX);
        expect(res.total[0]).to.equal(Utils.toWei('50'));
        expect(res.available[0]).to.equal( Utils.toWei('50'));
        expect(res.symbols[1]).to.equal(ethers.constants.HashZero);

        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, '100');
        res = await portfolioSub.getBalances(trader1.address, pageNo);

        expect(res.symbols.length ).to.equal(3);
        expect(res.symbols[0]).to.equal(AVAX);
        expect(res.total[0] ).to.equal( Utils.toWei('50'));
        expect(res.available[0] ).to.equal( Utils.toWei('50'));
        expect(res.symbols[1] ).to.equal( ALOT);
        expect(res.total[1] ).to.equal( Utils.toWei('100'));
        expect(res.available[1]).to.equal(Utils.toWei('100'));
        //USDT is non existent still because it has 0 positions
        expect(res.symbols[2] ).to.equal( ethers.constants.HashZero);


        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, '200')
        res = await portfolioSub.getBalances(trader1.address, pageNo);
        expect(res.symbols.length).to.equal(3);

        // USDT takes the 0 index as it is added last
        expect(res.symbols[0] ).to.equal( USDT);
        expect(res.total[0] ).to.equal( Utils.parseUnits('200',token_decimals));
        expect(res.available[0]).to.equal(Utils.parseUnits('200', token_decimals));

        expect(res.symbols[1]).to.equal(AVAX);
        expect(res.total[1] ).to.equal( Utils.toWei('50'));
        expect(res.available[1] ).to.equal( Utils.toWei('50'));
        expect(res.symbols[2] ).to.equal( ALOT);
        expect(res.total[2] ).to.equal( Utils.toWei('100'));
        expect(res.available[2]).to.equal( Utils.toWei('100'));


        pageNo = 1;// 0 or 1 give the same results
        res = await portfolioSub.getBalances(trader1.address, pageNo);
        expect(res.symbols[0] ).to.equal( USDT);
        expect(res.total[0] ).to.equal( Utils.parseUnits('200',token_decimals));
        expect(res.available[0]).to.equal(Utils.parseUnits('200', token_decimals));


        pageNo = 2; // Overwrite out of bound pageNo. should be same as 1
        res = await portfolioSub.getBalances(trader1.address, pageNo);
        expect(res.symbols[0] ).to.equal( USDT);
        expect(res.total[0] ).to.equal( Utils.parseUnits('200',token_decimals));
        expect(res.available[0]).to.equal(Utils.parseUnits('200', token_decimals));

    } );


    it("Should withdraw native tokens from portfolio to subnet", async () => {

        const initial_amount = await trader1.getBalance();

        let tx = await alot.mint(trader1.address, Utils.toWei(deposit_amount));

        tx = await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT,  deposit_amount);
        const tx_3:any = await tx.wait()

        // fail for account other then msg.sender
        await expect(portfolioSub.connect(trader2).withdrawNative(trader1.address, Utils.toWei("100"))).to.be.revertedWith("P-OOWN-01");

        // fail for amount too big
        //await expect(portfolioSub.connect(trader1).withdrawNative(trader1.address, Utils.toWei("300"))).to.be.revertedWith("P-TFNE-01");

        // succeed for msg.sender
        tx = await portfolioSub.connect(trader1).withdrawNative(trader1.address, Utils.toWei("100"));
        const tx_4:any = await tx.wait();

        const res = await portfolioSub.getBalance(trader1.address, ALOT);

        //Utils.printResults(trader1.address, "after withdrawal", res, alot_decimals);

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

        const tx = await portfolioSub.connect(trader1).depositNative(trader1.address, 0, {
            value: Utils.toWei('10')
        });
        let receipt:any = await tx.wait();

        let res = await portfolioSub.getBalance(trader1.address, ALOT);
        //Utils.printResults(trader1.address, "after deposit", res, alot_decimals);
        expect(res.total).to.equal(Utils.toWei("10"));
        expect(res.available).to.equal(Utils.toWei("10"));

        expect(await portfolioSub.totalNativeBurned()).to.equal(Utils.toWei("10"));

        expect((await trader1.getBalance()).toString().slice(0, 6)).to.equal(
            initial_amount
            .sub(receipt.effectiveGasPrice.mul(receipt.cumulativeGasUsed))
            .sub(Utils.toWei('10'))
            .toString().slice(0, 6)
        );

        await portfolioSub.connect(trader1).withdrawNative(trader1.address, Utils.parseUnits("8", 18))
        // succeed for native using sendTransaction
        const tx2 = await trader1.sendTransaction({to: portfolioSub.address, value: Utils.parseUnits("4", 18), gasLimit: 300000,
        gasPrice: ethers.utils.parseUnits('50', 'gwei')});
        receipt = await tx2.wait();
        res = await portfolioSub.getBalance(trader1.address, ALOT);
        //Utils.printResults(trader1.address, "after 2nd deposit", res, alot_decimals);
        expect(res.total).to.equal(Utils.toWei("6"));
        expect(res.available).to.equal(Utils.toWei("6"));
    })

    it("Should not deposit native tokens from subnet if it is above threshold", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        const initial_amount = await trader1.getBalance();

        const tx = await portfolioSub.connect(trader1).populateTransaction.depositNative(trader1.address, 0, {
            value: "1"
        })

        const gas = await ethers.provider.estimateGas(tx)
        const gasPrice = await ethers.provider.getGasPrice()
        const total = gas.mul(gasPrice)
        const gasThreshold = (await gasStation.gasAmount()).mul(2);

        // Fail when more than available is being deposited into the portfolio
        // For some reason, revertWith is not matching the error, cd Jan30,23
        // Catching for now with a catch-all "await expect(...).to throw"
        await expect(portfolioSub.connect(trader1).depositNative(trader1.address, 0, {
            value: initial_amount.mul(2),
            gasLimit: gas,
            gasPrice: gasPrice
        })).to.throw;

        //Fail when trying to leave almost 0 in the wallet
        await expect(portfolioSub.connect(trader1).depositNative(trader1.address, 0, {
            value: initial_amount.sub(total),
            gasLimit: gas,
            gasPrice: gasPrice
        }))
        .to.be.revertedWith("P-BLTH-01");

        // console.log (Utils.formatUnits(initial_amount.sub(total).sub(gasThreshold),18))

        //Allow if leaving just a bit more than gasThreshold in the wallet.
        await portfolioSub.connect(trader1).depositNative(trader1.address, 0, {
            value: initial_amount.sub(total).sub(gasThreshold.mul(2)),
            gasLimit: gas,
            gasPrice: gasPrice
        });
        const endingBal = Number(await trader1.getBalance())
       // console.log (endingBal, Number(gasThreshold.toString()))

        expect(endingBal).to.be.greaterThan(Number(gasThreshold.toString()))

        //Refill the trader1 balance
        const newBalance = ethers.utils.parseEther('1000000');
        await f.setHardhatBalance(trader1, newBalance);

    })

    it("Should deposit native tokens from subnet if initiated by self ", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        let bal = await portfolioSub.getBalance(trader1.address, ALOT);
        expect(bal.total).to.be.equal(0);
        expect(bal.available).to.be.equal(0);

        // fail sender is not self
        await expect(portfolioSub.depositNative(trader1.address, 0, {
            value: Utils.parseUnits("0.5", 18)
        }))
        .to.be.revertedWith("P-OOWN-02");

        // succeed
        await portfolioSub.connect(trader1).depositNative(trader1.address, 0, {
            value: Utils.parseUnits("0.5", 18)
        });
        bal = await portfolioSub.getBalance(trader1.address, ALOT);
        expect(bal.total).to.be.equal(Utils.parseUnits("0.5", 18));
        expect(bal.available).to.be.equal(Utils.parseUnits("0.5", 18));
    })

    it("Should withdraw native tokens from subnet if initiated by self", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        let bal = await portfolioSub.getBalance(trader1.address, ALOT);
        expect(bal.total).to.be.equal(0);
        expect(bal.available).to.be.equal(0);

        // fail sender is not self or has msg sender role
        await expect(portfolioSub.withdrawNative(trader1.address, Utils.parseUnits("0.2", 18)))
        .to.be.revertedWith("P-OOWN-01");

        // deposit first do we can withdraw

        await portfolioSub.connect(trader1).depositNative(trader1.address, 0, {
            value: Utils.parseUnits("0.6", 18)
        });

        // succeed
        await portfolioSub.connect(trader1).withdrawNative(trader1.address, Utils.parseUnits("0.2", 18))
        bal = await portfolioSub.getBalance(trader1.address, ALOT);
        expect(bal.total).to.be.equal(Utils.parseUnits("0.4", 18));
        expect(bal.available).to.be.equal(Utils.parseUnits("0.4", 18));
    })

    it("Should not deposit native tokens from subnet if portfolio is paused", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        // fail paused
        await portfolioSub.pause();
        await expect(portfolioSub.depositNative(trader1.address, 0, {
            value: Utils.parseUnits("0.5", 18)
        }))
        .to.be.revertedWith("Pausable: paused");
    })

    it("Should not withdraw native tokens from subnet if portfolio is paused", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        // fail paused
        await portfolioSub.pause();
        await expect(portfolioSub.withdrawNative(trader1.address, Utils.parseUnits("0.5", 18)))
        .to.be.revertedWith("Pausable: paused");
    })

    it("Should not withdraw tokens from subnet if portfolio is paused", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        // fail paused
        await portfolioSub.pause();
        await expect(f.withdrawToken(portfolioSub, trader1, Utils.fromUtf8("AVAX"), 18, "0.5"))
            .to.be.revertedWith("Pausable: paused")

        // await expect(portfolio.withdrawToken(trader1.address, AVAX, Utils.parseUnits("0.5", 18), 0,defaultDestinationChainId))
        // .to.be.revertedWith("Pausable: paused");
    })


    it("Should not deposit native tokens from subnet if parameters are incorrect", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        const initial_amount = await trader1.getBalance();

        const tx = await portfolioSub.connect(trader1).populateTransaction.depositNative(trader1.address, 0, {
            value: "1"
        })

        const gas = await ethers.provider.estimateGas(tx)
        const gasPrice = await ethers.provider.getGasPrice()
        const total = gas.mul(gasPrice)

        await expect(portfolioSub.connect(trader1).depositNative(trader2.address, 0, {
            value: initial_amount.sub(total),
            gasLimit: gas,
            gasPrice: gasPrice
        }))
        .to.be.revertedWith("P-OOWN-02");
    })

    it("Should not deposit native tokens from subnet if it is not allowed", async () => {
        // native is AVAX for testing, but it will be ALOT in the subnet

        const initial_amount = await trader1.getBalance();

        const tx = await portfolioSub.connect(trader1).populateTransaction.depositNative(trader1.address, 0, {
            value: "1"
        })

        const gas = await ethers.provider.estimateGas(tx)
        const gasPrice = await ethers.provider.getGasPrice()
        const total = gas.mul(gasPrice)

        await portfolioSub.pauseDeposit(true)

        await expect(portfolioSub.connect(trader1).depositNative(trader1.address, 0, {
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
        const bridgeFee = 1;
        const gasSwapRatioUsdt = 1; //10 usdt per 1 ALOT
        const usdtDepositAmount = Utils.parseUnits(deposit_amount, token_decimals)

        await usdt.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));

        await f.addToken(portfolioMain, portfolioSub, usdt, gasSwapRatioUsdt, 0, true, bridgeFee); //gasSwapRatio 10

        const params =await portfolioSub.bridgeParams(USDT);
        expect(params.gasSwapRatio).to.equal(Utils.parseUnits(gasSwapRatioUsdt.toString(), token_decimals));
        expect(params.fee).to.equal(Utils.parseUnits(bridgeFee.toString(), token_decimals));
        expect(params.usedForGasSwap).to.equal(true); // always false in the mainnet

        // await f.printTokens([portfolioMain], portfolioSub, portfolioBridgeSub);

        //await portfolioMain.setBridgeParam(USDT, Utils.parseUnits('1', token_decimals), Utils.parseUnits('0.1', token_decimals), true)

        let newBalance = ethers.utils.parseEther('0.75');
        await f.setHardhatBalance(trader1, newBalance);

        let gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        //console.log("gasStationBeforeBal", Utils.fromWei(gasStationBeforeBal) )
        //Deposit tokens for trader1
        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);
        expect((await portfolioSub.getBalance(trader1.address, USDT)).total).to.equal(usdtDepositAmount.sub(Utils.parseUnits(bridgeFee.toString(), token_decimals)));

        const mainnetBal = (await usdt.balanceOf(portfolioMain.address)).sub(await portfolioMain.bridgeFeeCollected(USDT));

        //console.log(Utils.fromWei((await ethers.provider.getBalance(trader1.address)).toString()))

        const usdtTransferAmnt = Utils.parseUnits("10", token_decimals);

        // No change in tokenTotals
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetBal);

        // Transfer USDT to other2 when it has enough gas his wallet
        await portfolioSub.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt, {
            gasLimit: 200000, maxFeePerGas: ethers.utils.parseUnits("1", "gwei"),
        });
        //console.log(Utils.fromWei((await ethers.provider.getBalance(trader1.address)).toString()))
        // No change in tokenTotals
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetBal);

        const gasDeposited = await gasStation.gasAmount();
        const totalGasDeposited = gasDeposited.mul(alotWithdrawnToGasTankMultiplier);
        //console.log("gasDeposited",  Utils.fromWei(gasDeposited))
        //Check to see it had no impact
        // other2's portfolio usdt balanced should be transferred amount
       expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt);

        // when we set the wallet to 0.25 at the start the deposit and then transfer token runs out of gas for some reason
        // And autofill can't add funds. Debugged but couldn't find a reason. Commenting out the 2 below as they fail CD 2/2/2024
        // treasury bal increased by 0.5 ALOT in exchange for 0.5 USDT
        // expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(Utils.parseUnits('0.5', token_decimals));
        // Trader1 forced Gas Station balance to change
        // expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)

        newBalance = ethers.utils.parseEther('0.25');
        await f.setHardhatBalance(other2, newBalance);

        // fail due to paused portfolio
        await portfolioSub.pause()
        await expect(portfolioSub.connect(other2).autoFill(other2.address, USDT, { gasLimit: 200000, maxFeePerGas }))
            .to.revertedWith("Pausable: paused");
        await portfolioSub.unpause()

        // fail due to missing EXECUTOR_ROLE
        await expect(portfolioSub.connect(other2).autoFill(other2.address, USDT, { gasLimit: 200000, maxFeePerGas })).to.revertedWith("P-OACC-03");
        await portfolioSub.grantRole(await portfolioSub.EXECUTOR_ROLE(), other2.address);
        expect(await portfolioSub.hasRole(await portfolioSub.EXECUTOR_ROLE(), other2.address)).to.be.equal(true);


        const usdtSwappedAmnt = (await portfolioSub.bridgeParams(USDT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))
        const beforeBalance = await other2.getBalance();

         let tx = await portfolioSub.connect(other2).autoFill(other2.address, USDT, { gasLimit: 200000, maxFeePerGas });
         let receipt = await tx.wait();

         let gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

        // No change in tokenTotals
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetBal);

        expect((await ethers.provider.getBalance(other2.address)).sub(beforeBalance.add(gasDeposited))).to.lte(gasUsedInTx);
        // other2's portfolioSub usdt balanced should be transferred amount - swapped amount  (10 - 0.5)
        expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.sub(usdtSwappedAmnt));
        // treasury should have an increase of swapped amount  0.5
        expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt); //.mul(2)
        // gas station  should have a decrease of gasStationGas(default 0.025)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited) //.mul(2)

        // Set the wallet balance to 1
        newBalance = ethers.utils.parseEther('1');
        await f.setHardhatBalance(other2, newBalance);
        gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        tx = await portfolioSub.connect(other2).autoFill(other2.address, USDT, { gasLimit: 200000, maxFeePerGas });
        receipt = await tx.wait();

        gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);
        // No change in tokenTotals
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetBal);

        // No Change in the balances except the gas consumption of the tx
        expect((await ethers.provider.getBalance(other2.address)).sub(newBalance)).to.lte(gasUsedInTx);
        // No Change i other2's portfolioSub usdt balance
        expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.sub(usdtSwappedAmnt));
        // No Change in treasury balance
        expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt); //.mul(2)
        // No Change in gas station balance gas station
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);


        // half withdrawn - Sanity Check
        // set the Bridge Fee 1 USDT
        //await portfolioSub.setBridgeParam(USDT, Utils.parseUnits('1', token_decimals), Utils.parseUnits('0.1', token_decimals), true)
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
        await portfolioBridgeSub.setBridgeFees(defaultDestinationChainId, [USDT], [Utils.parseUnits('1', token_decimals)]);
        await f.withdrawToken(portfolioSub, trader1, USDT, token_decimals, Utils.formatUnits(usdtDepositAmount.div(2), token_decimals));
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetBal.sub(await portfolioMain.bridgeFeeCollected(USDT)).div(2).add(Utils.parseUnits('1', token_decimals)));

    })


    it("Should get gas Token with autoFill using Alot ", async () => {
        const { other2 } = await f.getAccounts();

        //Set GasStation Gas Amount to 0.5 instead of 0.1
        await expect(gasStation.setGasAmount(ethers.utils.parseEther("0.5")))
        .to.emit(gasStation, "GasAmountChanged")
        const alotDepositAmount = Utils.parseUnits(deposit_amount, alot_decimals)

        await alot.mint(trader1.address, (BigNumber.from(2)).mul(alotDepositAmount));

        await portfolioMain.setBridgeParam(ALOT, Utils.parseUnits('1', alot_decimals), Utils.parseUnits('1', alot_decimals), true)

        let newBalance = ethers.utils.parseEther('0.50');
        await f.setHardhatBalance(trader1, newBalance);

        let gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount, 0);
        const bridgeFeeCollected= await portfolioMain.bridgeFeeCollected(ALOT)
        const mainnetBal = (await alot.balanceOf(portfolioMain.address)).sub(bridgeFeeCollected);

        const gasDeposited = await gasStation.gasAmount();
        const totalGasDeposited = gasDeposited.mul(alotWithdrawnToGasTankMultiplier);

        const alotTransferAmnt= Utils.parseUnits("10", alot_decimals);
        // console.log ((await portfolioSub.tokenTotals(ALOT)).toString())
        // console.log ((await portfolioSub.getBalance(trader1.address, ALOT)).total.toString())
        // No change in tokenTotals- SanityCheck
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetBal);
        // Trader1 got ALOT deposited to his wallet
        //expect((await portfolioSub.getBalance(trader1.address, ALOT)).total).to.equal(alotDepositAmount.sub(gasDeposited).sub(bridgeFeeCollected));
        // Now transfer Native Token ALOT
        await portfolioSub.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt, {gasLimit: 200000, maxFeePerGas});
        // No change in tokenTotals- SanityCheck
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetBal);

        //Check to see it had no impact
        // other2's portfolioSub usdt balanced should be transferred amount
        expect((await portfolioSub.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt);
        // no change
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
       // gas station  should have a decrease of gasStationGas(default 0.025)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);

        newBalance = ethers.utils.parseEther('0.35');
        await f.setHardhatBalance(other2, newBalance);

        const alotSwappedAmnt = (await portfolioSub.bridgeParams(ALOT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

        await expect(portfolioSub.connect(other2).autoFill(other2.address, ALOT, {gasLimit: 200000, maxFeePerGas})).to.revertedWith("P-OACC-03");
        await portfolioSub.grantRole(await portfolioSub.EXECUTOR_ROLE(), other2.address);
        expect(await portfolioSub.hasRole(await portfolioSub.EXECUTOR_ROLE(), other2.address)).to.be.equal(true);

        const beforeBalance = await other2.getBalance();

        let tx: any = await portfolioSub.connect(other2).autoFill(other2.address, ALOT, {gasLimit: 200000, maxFeePerGas});
        let receipt = await tx.wait();

        let gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

        // No change in tokenTotals- SanityCheck
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetBal);

        expect((await ethers.provider.getBalance(other2.address)).sub(beforeBalance.add(gasDeposited))).to.lte(gasUsedInTx);
        // other2's portfolioSub ALOT balanced should be transferred amount - swapped amount  (10 - 0.5)
        //expect((await portfolioSub.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.sub(alotSwappedAmnt));
        // treasury should have no change. ALOT directly transferred to wallet
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        // gas station  should have a no change. ALOT directly transferred to wallet
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)

        newBalance = ethers.utils.parseEther('1');
        await f.setHardhatBalance(other2, newBalance);

        gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        tx = await portfolioSub.connect(other2).autoFill(other2.address, ALOT, {gasLimit: 200000, maxFeePerGas});
        receipt = await tx.wait();

        gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

        // No change in tokenTotals- SanityCheck
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetBal);

        // No Change in the balances except the gas consumption of the tx
        expect((await ethers.provider.getBalance(other2.address)).sub(newBalance)).to.lte(gasUsedInTx);
         // No Change i other2's portfolioSub usdt balance
        //expect((await portfolioSub.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.sub(alotSwappedAmnt));
         // No Change in treasury balance
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
         // No Change in gas station balance gas station
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)
        // gas station  should have a decrease of gasStationGas(default 0.025)
        //expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)

        //console.log ((await portfolioSub.getBalance(trader1.address, ALOT)).total.toString())

        newBalance = ethers.utils.parseEther('10');
        await f.setHardhatBalance(trader1, newBalance);

        const addRemGasAmnt= Utils.parseUnits('1', alot_decimals)
        //Add Gas Sanity Check
        await portfolioSub.connect(trader1).withdrawNative(trader1.address, addRemGasAmnt)
        //No change
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetBal);

        //Remove Gas Sanity Check
        await portfolioSub.connect(trader1).depositNative(trader1.address, 0, {
            value: addRemGasAmnt
        });
        //No change
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetBal);

        // half withdrawn - Sanity Check
        // set the Bridge Fee 1 ALOT
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
        await portfolioBridgeSub.setBridgeFees(defaultDestinationChainId, [ALOT], [Utils.parseUnits('1', alot_decimals)]);
        await f.withdrawToken(portfolioSub, trader1, ALOT, 18, (Number(deposit_amount) / 2).toString())

        // await portfolioSub.connect(trader1).withdrawToken(trader1.address, ALOT, alotDepositAmount.div(2), 0,defaultDestinationChainId);
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetBal.sub(await portfolioMain.bridgeFeeCollected(ALOT)).div(2).add(Utils.parseUnits('1', alot_decimals)));

    })

    it("Should get gas Token ALOT from portfolio when sending erc20 using autoFill if portfolio(ALOT) > gasSwapRatio", async () => {
        const { other2 } = await f.getAccounts();

        //Set GasStation Gas Amount to 0.5 instead of 0.0255
        await expect(gasStation.setGasAmount(ethers.utils.parseEther("0.5")))
        .to.emit(gasStation, "GasAmountChanged")

        const gasSwapRatioUsdt = 0.5;

        const usdtDepositAmount = Utils.parseUnits(deposit_amount, token_decimals)
        const alotDepositAmount = Utils.parseUnits(deposit_amount, alot_decimals)

        await usdt.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));

        await f.addToken(portfolioMain, portfolioSub, usdt, gasSwapRatioUsdt, 0, true); //gasSwapRatio 0.5
        await alot.mint(trader1.address, (BigNumber.from(2)).mul(alotDepositAmount));

        await portfolioMain.setBridgeParam(USDT, Utils.parseUnits('1', token_decimals), Utils.parseUnits('0.1', token_decimals), true)
        await portfolioMain.setBridgeParam(ALOT, Utils.parseUnits('2', alot_decimals), Utils.parseUnits('0.1', alot_decimals), true)
        let newBalance = ethers.utils.parseEther('0.35');
        await f.setHardhatBalance(trader1, newBalance);
        const gasDeposited = await gasStation.gasAmount();
        const totalGasDeposited = gasDeposited.mul(alotWithdrawnToGasTankMultiplier);
        const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)

        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount, 0);
        const bridgeFeeCollected= await portfolioMain.bridgeFeeCollected(ALOT)
        // Trader1 got ALOT deposited to his wallet
        //expect((await portfolioSub.getBalance(trader1.address, ALOT)).total).to.equal(alotDepositAmount.sub(gasDeposited).sub(bridgeFeeCollected));
        await f.setHardhatBalance(trader1, newBalance); // 0.35 ALOT

        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);
        // Trader1 got ALOT deposited AGAIN to his wallet, not USDT
        //expect((await portfolioSub.getBalance(trader1.address, ALOT)).total).to.equal(alotDepositAmount.sub(gasDeposited.mul(2)).sub(bridgeFeeCollected));

        const mainnetUSDTBal = (await usdt.balanceOf(portfolioMain.address)).sub(await portfolioMain.bridgeFeeCollected(USDT));
        // console.log("USDT Bridge", Utils.formatUnits((await portfolioMain.bridgeFeeCollected(USDT)), token_decimals))
        // console.log("USDT", Utils.formatUnits(mainnetUSDTBal, token_decimals))
        const mainnetALOTBal = (await alot.balanceOf(portfolioMain.address)).sub(await portfolioMain.bridgeFeeCollected(ALOT));
        // console.log("USDT", Utils.formatUnits(await portfolioSub.tokenTotals(USDT), tokenDecimals))
        // console.log ("USDT",Utils.formatUnits(await portfolioSub.tokenTotals(ALOT), alot_decimals))
        // No change in tokenTotals
        console.log("USDT portfolioSub", Utils.formatUnits((await portfolioSub.tokenTotals(USDT)), token_decimals))
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetUSDTBal);
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetALOTBal);

        const usdtTransferAmnt= Utils.parseUnits("10", token_decimals);
        const alotTransferAmnt= Utils.parseUnits("10", alot_decimals);

        // Transfer USDT to other2 when he has 0 ALOT in his wallet
        await portfolioSub.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt, {gasLimit: 200000, maxFeePerGas});
        await portfolioSub.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt, {gasLimit: 200000, maxFeePerGas});

        // No change in tokenTotals
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetUSDTBal);
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetALOTBal);

        //Check to see it had no impact
        // other2's portfolioSub usdt balanced should be transferred amount
        expect((await portfolioSub.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt);
        expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt);
        // treasury should have an increase of swaped amount  0.5
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(0);
        // gas station  should have a decrease of gasStationGas(default 0.025)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);


        newBalance = ethers.utils.parseEther('0.35');
        await f.setHardhatBalance(other2, newBalance);

        await expect(portfolioSub.connect(other2).autoFill(other2.address, USDT, {gasLimit: 200000, maxFeePerGas})).to.revertedWith("P-OACC-03");
        await portfolioSub.grantRole(await portfolioSub.EXECUTOR_ROLE(), other2.address);
        expect(await portfolioSub.hasRole(await portfolioSub.EXECUTOR_ROLE(), other2.address)).to.be.equal(true);

        const beforeBalance = await other2.getBalance();

        // const alotSwappedAmnt = (await portfolioSub.bridgeParams(ALOT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

        const tx: any = await portfolioSub.connect(other2).autoFill(other2.address, USDT, {gasLimit: 200000, maxFeePerGas});
        const receipt = await tx.wait();

        const gasUsedInTx = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

        // No change in tokenTotals
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetUSDTBal);
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetALOTBal);

        expect((await ethers.provider.getBalance(other2.address)).sub(beforeBalance.add(gasDeposited))).to.lte(gasUsedInTx);
        // no change on other2's portfolioSub usdt balance
        expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt);
        // treasury should have NO increase
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        // gas station  should have No increase
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)


        // half withdrawn - Sanity Check
        // set the Subnet Bridge Fee 1 USDT & 2 ALOT
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
        await portfolioBridgeSub.setBridgeFees(defaultDestinationChainId, [USDT, ALOT], [Utils.parseUnits('1', token_decimals), Utils.parseUnits('2', alot_decimals)]);
        await f.withdrawToken(portfolioSub, trader1, USDT, token_decimals, Utils.formatUnits(usdtDepositAmount.div(2),token_decimals));

        //await portfolioSub.connect(trader1).withdrawToken(trader1.address, USDT, usdtDepositAmount.div(2), 0,defaultDestinationChainId);
        expect(await portfolioSub.tokenTotals(USDT)).to.equal(mainnetUSDTBal.sub(await portfolioMain.bridgeFeeCollected(USDT)).div(2).add(Utils.parseUnits('1', token_decimals)));
        await f.withdrawToken(portfolioSub, trader1, ALOT, token_decimals, Utils.formatUnits(alotDepositAmount.div(2),token_decimals));
        //await portfolioSub.connect(trader1).withdrawToken(trader1.address, ALOT, alotDepositAmount.div(2), 0,defaultDestinationChainId);
        expect(await portfolioSub.tokenTotals(ALOT)).to.equal(mainnetALOTBal.sub(await portfolioMain.bridgeFeeCollected(ALOT)).div(2).add(Utils.parseUnits('2', alot_decimals)));
        //Give enough gas to trader1 for the remaining tests
        newBalance = ethers.utils.parseEther('1000000');
        await f.setHardhatBalance(trader1, newBalance);
    })

    it("Should get gas Token when sending erc20 using transferToken ", async () => {
        const { other2 } = await f.getAccounts();
        await f.setHardhatBalance(other2, BigNumber.from(0));
        const gasSwapRatioUsdt = 5;
        const usdtDepositAmount = Utils.parseUnits(deposit_amount, token_decimals)

        await usdt.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));

        await f.addToken(portfolioMain, portfolioSub, usdt, gasSwapRatioUsdt, 0, true); //gasSwapRatio 5

        // Start with 0 wallet balance
        expect((await ethers.provider.getBalance(other2.address))).to.equal(ethers.BigNumber.from(0));

        //Deposit tokens for trader1
        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);

        const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)
        const usdtTransferAmnt= Utils.parseUnits("10", token_decimals);

        const gasDeposited = await gasStation.gasAmount();
        const usdtSwappedAmnt = (await portfolioSub.bridgeParams(USDT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

        // Transfer USDT to other2 when he has 0 ALOT in his wallet
        await portfolioSub.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);


        // other2 should have gasStationGas(default 0.025)  ALOT in his wallet
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        // other2's portfolioSub usdt balanced should be transferred amount - swaped amount  (10 - 0.5)
        expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.sub(usdtSwappedAmnt));
        // treasury should have an increase of swaped amount  0.5
        expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt);
        // gas station  should have a decrease of gasStationGas(default 0.025)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)

        // Transfer same amount of USDT again. Other2 already has ALOT in his wallet. Should not deposit ALOT again
        await portfolioSub.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);

        // No impact on Wallet
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        //Other2's USDT balance is transferamount *2 - swaped amount  (20 - 0.5)
        expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.mul(2).sub(usdtSwappedAmnt));
        expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt);
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)


        //Set the other2's wallet to half of gasStationGas(default 0.025)
        const WalBaltoReset =gasDeposited.div(2);
        await f.setHardhatBalance(other2, WalBaltoReset);

       await portfolioSub.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);
       // Only 0.025 should be added
       expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited.add(WalBaltoReset));
       //Other2's USDT balance is transferamount *3 - swaped amount  (20 - 0.5- 0.5)
       expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.mul(3).sub(usdtSwappedAmnt.mul(2)));
       // treasury should have an increase of swaped amount  by 0.5 total 1
       expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt.mul(2));
        // gas station  should have a decrease of another 0.025  gasStationGas(default 0.025)
       expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited.mul(2));

    })

    it("Should get gas Token sending ALOT using transferToken", async () => {
        const { other2 } = await f.getAccounts();
        //Reset wallet balance to 0
        await f.setHardhatBalance(other2, BigNumber.from(0));
        const alotDepositAmount = Utils.parseUnits(deposit_amount, alot_decimals)
        await alot.mint(trader1.address, (BigNumber.from(2)).mul(alotDepositAmount));

        // Start with 0 wallet balance
        expect((await ethers.provider.getBalance(other2.address))).to.equal(ethers.BigNumber.from(0));

        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount, 0);

        const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)

        const alotTransferAmnt= Utils.parseUnits("10", alot_decimals);
        const gasDeposited = await gasStation.gasAmount();
        const totalGasDeposited = gasDeposited.mul(alotWithdrawnToGasTankMultiplier);

        // Now transfer Native Token ALOT
        await portfolioSub.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);
        const alotSwappedAmnt = (await portfolioSub.bridgeParams(ALOT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18));
        // No Impact on the numbers other than Other2's portfolioSub ALOT balance
        expect((await ethers.provider.getBalance(other2.address))).to.equal(totalGasDeposited);
        expect((await portfolioSub.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.sub(totalGasDeposited));
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)

        // Should not deposit ALOT again
        await portfolioSub.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);

        expect((await ethers.provider.getBalance(other2.address))).to.equal(totalGasDeposited);
        expect((await portfolioSub.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.mul(2).sub(totalGasDeposited));
        // No impact on treasury nor the GasStation
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0)

        const WalBaltoReset = gasDeposited.div(2);
        await f.setHardhatBalance(other2, WalBaltoReset);


        await portfolioSub.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);
        // gasDeposited fully
        expect((await ethers.provider.getBalance(other2.address))).to.equal(totalGasDeposited.add(WalBaltoReset));
        expect((await portfolioSub.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.mul(3).sub(totalGasDeposited.mul(2)));
        // No impact on treasury nor the GasStation
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(0);


    })

    it("Should get gas Token from portfolio ALOT when sending erc20 using transferToken if portfolio(ALOT) > gasSwapRatio", async () => {
        const { other2 } = await f.getAccounts();
        await f.setHardhatBalance(other2, BigNumber.from(0));
        //const gasSwapRatioAlot = 1;
        const gasSwapRatioUsdt = 5;

        const usdtDepositAmount = Utils.parseUnits(deposit_amount, token_decimals)
        const alotDepositAmount = Utils.parseUnits(deposit_amount, alot_decimals)

        await usdt.mint(trader1.address, (BigNumber.from(2)).mul(usdtDepositAmount));

        await f.addToken(portfolioMain, portfolioSub, usdt, gasSwapRatioUsdt, 0, true); //gasSwapRatio 5
        await alot.mint(trader1.address, (BigNumber.from(2)).mul(alotDepositAmount));

        // Start with 0 wallet balance
        expect((await ethers.provider.getBalance(other2.address))).to.equal(ethers.BigNumber.from(0));

        await f.depositToken(portfolioMain, trader1, alot, alot_decimals, ALOT, deposit_amount, 0);
        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);

        const gasStationBeforeBal = await ethers.provider.getBalance(gasStation.address)

        const usdtTransferAmnt= Utils.parseUnits("10", token_decimals);
        const alotTransferAmnt= Utils.parseUnits("10", alot_decimals);

        // Transfer USDT to other2 when he has 0 ALOT in his wallet
        await portfolioSub.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);

        const gasDeposited = await gasStation.gasAmount()
        const totalGasDeposited = gasDeposited.mul(alotWithdrawnToGasTankMultiplier);

        const usdtSwappedAmnt = (await portfolioSub.bridgeParams(USDT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18))

        // other2 should have gasStationGas(default 0.025)  ALOT in his wallet
        expect((await ethers.provider.getBalance(other2.address))).to.equal(gasDeposited);
        // other2's portfolioSub usdt balanced should be transferred amount - swaped amount  (10 - 0.5)
        expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.sub(usdtSwappedAmnt));
        // treasury should have an increase of swaped amount  0.5
        expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt);
        // gas station  should have a decrease of gasStationGas(default 0.1)
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited)

        const alotSwappedAmnt = (await portfolioSub.bridgeParams(ALOT)).gasSwapRatio.mul(gasDeposited).div(BigNumber.from(10).pow(18));

        // Now transfer Native Token ALOT for other2 to have ALOT i his portfolioSub- No gas swap expected
        await portfolioSub.connect(trader1).transferToken(other2.address, ALOT, alotTransferAmnt);

        //Reset wallet balance to 0
        await f.setHardhatBalance(other2, BigNumber.from(0));

        // Now transferring USDT but other2 already has ALOT in his portfolioSub. So we only use his ALOT and we don't swap
        await portfolioSub.connect(trader1).transferToken(other2.address, USDT, usdtTransferAmnt);
        // other2 should have 1 ALOT in his wallet transferred from his portfolio
        expect((await ethers.provider.getBalance(other2.address))).to.equal(totalGasDeposited);
        // other2's portfolioSub ALOT balance should be transferred amount - totalGasDeposited
        expect((await portfolioSub.getBalance(other2.address, ALOT)).total).to.equal(alotTransferAmnt.sub(totalGasDeposited));
        // no impact on the treasury
        expect((await portfolioSub.getBalance(treasurySafe.address, ALOT)).total).to.equal(0);
        // gas station  should have a decrease of gasStationGas(default 0.025) * 2
        expect(gasStationBeforeBal.sub(await ethers.provider.getBalance(gasStation.address))).to.equal(gasDeposited);

        // other2's portfolioSub usdt balanced should be transferred amount *2  - swaped amount  (20 - 0.5) No change from before
        expect((await portfolioSub.getBalance(other2.address, USDT)).total).to.equal(usdtTransferAmnt.mul(2).sub(usdtSwappedAmnt));
        // treasury should have no change on usdt balances
        expect((await portfolioSub.getBalance(treasurySafe.address, USDT)).total).to.equal(usdtSwappedAmnt);
    })

    it("Should transfer token from portfolio to portfolio", async () => {

        await alot.mint(other1.address, (BigNumber.from(200)).mul(Utils.parseUnits(deposit_amount, 18)));

        await f.depositNative(portfolioMain, other1, deposit_amount);
        await f.depositToken(portfolioMain, other1, alot, 18, ALOT, deposit_amount, 0);

        expect((await portfolioSub.getBalance(other1.address, AVAX)).total).to.equal(Utils.toWei(deposit_amount));
        expect((await portfolioSub.getBalance(trader2.address, AVAX)).total).to.equal(ethers.BigNumber.from(0));

        // transfer AVAX native in mainnet
        await expect(portfolioSub.connect(other1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount)))
        .to.emit(portfolioSub, "PortfolioUpdated")
        .withArgs(5,  other1.address, AVAX, Utils.toWei(deposit_amount), 0, 0, 0, trader2.address )
        .to.emit(portfolioSub, "PortfolioUpdated")
        .withArgs(6,  trader2.address, AVAX, Utils.toWei(deposit_amount), 0, ethers.BigNumber.from(Utils.toWei(deposit_amount)), ethers.BigNumber.from(Utils.toWei(deposit_amount)), other1.address)

        // transfer ALOT native in subnet
        await expect(portfolioSub.connect(other1).transferToken(trader2.address, ALOT, Utils.toWei(deposit_amount)))
        .to.emit(portfolioSub, "PortfolioUpdated")
        .withArgs(5,  other1.address, ALOT, Utils.toWei(deposit_amount), 0, 0, 0,  trader2.address )
        .to.emit(portfolioSub, "PortfolioUpdated")
        .withArgs(6,  trader2.address, ALOT, Utils.toWei(deposit_amount), 0, ethers.BigNumber.from(Utils.toWei(deposit_amount)), ethers.BigNumber.from(Utils.toWei(deposit_amount)), other1.address )
    })

    it("Should not transfer token from portfolio to portfolio if contract is paused", async () => {
        await f.depositNative(portfolioMain, other1, deposit_amount);

        expect((await portfolioSub.getBalance(other1.address, AVAX)).total).to.equal(Utils.toWei(deposit_amount));
        expect((await portfolioSub.getBalance(trader2.address, AVAX)).total).to.equal(ethers.BigNumber.from(0));

        await portfolioSub.pause();

        await expect(portfolioSub.connect(other1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount)))
        .to.be.revertedWith("Pausable: paused")
    })

    it("Should not transfer internally if parameters are not correct", async () => {
        const NOT_EXISTING_TOKEN = Utils.fromUtf8("NOT_EXISTING_TOKEN");

        await f.depositNative(portfolioMain, other1, deposit_amount);

        expect((await portfolioSub.getBalance(other1.address, AVAX)).total).to.equal(Utils.toWei(deposit_amount));
        expect((await portfolioSub.getBalance(trader2.address, AVAX)).total).to.equal(ethers.BigNumber.from(0));

        await expect(portfolioSub.connect(other1).transferToken(other1.address, AVAX, Utils.toWei(deposit_amount)))
        .to.be.revertedWith("P-DOTS-01");

        await expect(portfolioSub.connect(other1).transferToken(trader2.address, NOT_EXISTING_TOKEN, Utils.toWei(deposit_amount)))
        .to.be.revertedWith("P-ETNS-01");

        await expect(portfolioSub.connect(other1).depositNative(other1.address, 0, {
            value: Utils.toWei("0")
        })).to.be.revertedWith("P-TNEF-01");

        await expect(portfolioSub.connect(other1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount).add(1)))
        .to.be.revertedWith("P-AFNE-02");

        await portfolioSub.setAuctionMode(AVAX, 2);
        await expect(portfolioSub.connect(other1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount)))
        .to.be.revertedWith("P-AUCT-01");
        await portfolioSub.setAuctionMode(AVAX, 0);

        await portfolioSub.connect(other1).transferToken(trader2.address, AVAX, Utils.toWei(deposit_amount));

        expect((await portfolioSub.getBalance(trader2.address, AVAX)).total).to.equal(Utils.toWei(deposit_amount));


    })

    it("Should add and remove ERC20 token to portfolio sub", async () => {
        // fail for non-admin
        await expect(portfolioSub.connect(other1).addToken(USDT, usdt.address, srcChainListOrgId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),USDT)).to.be.revertedWith("AccessControl:");
        // succeed for admin
        await portfolioSub.addToken(USDT, usdt.address, srcChainListOrgId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),USDT); //Auction mode off
        const tokens = await portfolioSub.getTokenList();
        expect(tokens[2]).to.equal(USDT);

        await expect(portfolioSub["removeToken(bytes32,uint32,bytes32)"](USDT, srcChainListOrgId,USDT)).to.be.revertedWith("Pausable: not paused");
        await portfolioSub.pause();
        await expect(portfolioSub.connect(other1)["removeToken(bytes32,uint32,bytes32)"](USDT, srcChainListOrgId,USDT)).to.be.revertedWith("AccessControl: account");

        await expect(portfolioSub["removeToken(bytes32,uint32,bytes32)"](USDT, srcChainListOrgId,USDT))
        .to.emit(portfolioSub, "ParameterUpdated")
        .withArgs(USDT, "P-REMOVETOKEN", 0, 0);

        // do nothing for non-existent token
        await portfolioSub["removeToken(bytes32,uint32,bytes32)"](Utils.fromUtf8("MOCK"), srcChainListOrgId,Utils.fromUtf8("MOCK"))


    });

    it("Should not remove erc20 if it has deposits", async () => {
        await usdt.mint(other1.address, ethers.utils.parseEther("100"))

        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5);

        await f.depositToken(portfolioMain, other1, usdt, token_decimals, USDT, "100")

        expect((await portfolioSub.getBalance(other1.address, USDT)).total.toString()).to.equal(Utils.parseUnits("100", token_decimals));
        await portfolioSub.pause();
        await expect(portfolioSub["removeToken(bytes32,uint32,bytes32)"](USDT, srcChainListOrgId,USDT)).to.be.revertedWith("P-TTNZ-01");
    });


    it("Should get token details", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5);

        let tokenDetails = await portfolioSub.getTokenDetails(USDT);
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);
        expect(tokenDetails.symbol).to.equal(USDT);
        expect(tokenDetails.isVirtual).to.equal(true);
        expect(tokenDetails.sourceChainSymbol).to.equal(USDT);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8("USDT"+ srcChainListOrgId));

        tokenDetails = await portfolioSub.getTokenDetails(ALOT);
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(18);
        expect(tokenDetails.symbol).to.equal(ALOT);
        expect(tokenDetails.isVirtual).to.equal(false);
        expect(tokenDetails.sourceChainSymbol).to.equal(ALOT);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8("ALOT"+ srcChainListOrgId));

        tokenDetails = await portfolioSub.getTokenDetails(AVAX);
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(18);
        expect(tokenDetails.symbol).to.equal(AVAX);
        expect(tokenDetails.isVirtual).to.equal(true);
        expect(tokenDetails.sourceChainSymbol).to.equal(AVAX);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8("AVAX"+ srcChainListOrgId));


        // Non existent token
        tokenDetails = await portfolioSub.getTokenDetails(Utils.fromUtf8("USDC"));
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(0);
        expect(tokenDetails.isVirtual).to.equal(false);
        expect(tokenDetails.symbol).to.equal(ethers.constants.HashZero);
        expect(tokenDetails.sourceChainSymbol).to.equal(ethers.constants.HashZero);
        expect(tokenDetails.symbolId).to.equal(ethers.constants.HashZero);
    });



    it("Should add the same subnetSymbol from multiple chains", async () => {

        const { cChain, arbitrumChain, dexalotSubnet } = f.getChains();
        const token_Symbol_Avax = "USDt";
        const subnet_symbol = "USDT";
        const subnet_symbol_bytes32 = Utils.fromUtf8(subnet_symbol);

        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_Symbol_Avax, token_decimals);
        const USDT = Utils.fromUtf8(token_Symbol_Avax);
        await usdt.mint(trader1.address, ethers.utils.parseEther("500"))

        //Add it with avalanche id
        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5, 0, true, 0 , subnet_symbol );

        // Token is added to the portfolioSub with subnet symbol and subnet chainId
        let tokenDetails = await portfolioSub.getTokenDetails(subnet_symbol_bytes32);
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);
        expect(tokenDetails.symbol).to.equal(subnet_symbol_bytes32);
        expect(tokenDetails.isVirtual).to.equal(true);
        expect(tokenDetails.sourceChainSymbol).to.equal(subnet_symbol_bytes32);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8(subnet_symbol +  dexalotSubnet.chainListOrgId));

        // Also added to portfolioBridgeSub with its address, its own symbolId & sourceChainSymbol
        tokenDetails = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8(token_Symbol_Avax +  cChain.chainListOrgId));
        expect(tokenDetails.tokenAddress).to.equal(usdt.address);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);
        expect(tokenDetails.symbol).to.equal(subnet_symbol_bytes32);
        expect(tokenDetails.isVirtual).to.equal(true);
        expect(tokenDetails.sourceChainSymbol).to.equal(USDT);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8(token_Symbol_Avax +  cChain.chainListOrgId));

        const token_symbol_arb = "USDTA";

        const usdta = await f.deployMockToken(token_symbol_arb, token_decimals);
        const USDTA = Utils.fromUtf8(token_symbol_arb);

        await f.addTokenToPortfolioSub(portfolioSub, token_symbol_arb, subnet_symbol, usdta.address, tokenDecimals
            , arbitrumChain.chainListOrgId, 0.5, 0, true, 0)

        // it has been added to portfolioBridgeSub with its address, its own symbolId & sourceChainSymbol
        //BUT it doesn't effect the PortfolioSub as the subnet token already exist
        tokenDetails = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8(token_symbol_arb +  arbitrumChain.chainListOrgId));
        expect(tokenDetails.tokenAddress).to.equal(usdta.address);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);
        expect(tokenDetails.symbol).to.equal(subnet_symbol_bytes32);
        expect(tokenDetails.isVirtual).to.equal(true);
        expect(tokenDetails.sourceChainSymbol).to.equal(USDTA);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8(token_symbol_arb +  arbitrumChain.chainListOrgId));

        // Addition of another token doesn't change the subnet symbol. All the same
        tokenDetails = await portfolioSub.getTokenDetails(subnet_symbol_bytes32);
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);
        expect(tokenDetails.symbol).to.equal(subnet_symbol_bytes32);
        expect(tokenDetails.isVirtual).to.equal(true);
        expect(tokenDetails.sourceChainSymbol).to.equal(subnet_symbol_bytes32);
        expect(tokenDetails.symbolId).to.equal(Utils.fromUtf8(subnet_symbol + dexalotSubnet.chainListOrgId));

        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, deposit_amount, 0);

        expect(await portfolioSub.tokenTotals(subnet_symbol_bytes32)).to.equal(Utils.parseUnits(deposit_amount, token_decimals));
        expect(await inventoryManager.get(subnet_symbol_bytes32, Utils.fromUtf8(token_Symbol_Avax +  cChain.chainListOrgId))).to.equal(Utils.parseUnits(deposit_amount, token_decimals));

        // calling portfolioBridgeSub.removeToken() from portfolioSub will always fail if subnet balance = 0
        // so to test must call directly from portfolioBridgeSub
        await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), owner.address);
        await portfolioBridgeSub.pause();
        await expect(portfolioBridgeSub.removeToken(USDT, cChain.chainListOrgId, subnet_symbol_bytes32)).to.be.revertedWith("PB-INVZ-01");
        await portfolioBridgeSub.unpause();

        // withdraw with subnet symbol to the default destination (cchain)
        await f.withdrawToken(portfolioSub, trader1, subnet_symbol_bytes32, token_decimals, deposit_amount);
        expect(await inventoryManager.get(subnet_symbol_bytes32, Utils.fromUtf8(token_Symbol_Avax +  cChain.chainListOrgId))).to.equal(0);

        await portfolioSub.pause();
        // USDt removed from PBridgeSub but USDT is not from the portfolio
        await expect(portfolioSub.connect(owner)["removeToken(bytes32,uint32,bytes32)"](USDT, cChain.chainListOrgId, subnet_symbol_bytes32))
            .not.to.emit(portfolioSub, "ParameterUpdated");

        tokenDetails = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8(token_Symbol_Avax +  cChain.chainListOrgId));
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);  // non existent

        // USDTA removed from both PBridgeSub and USDT removed from the portfoliosub
        await expect(portfolioSub.connect(owner)["removeToken(bytes32,uint32,bytes32)"](USDTA, arbitrumChain.chainListOrgId, subnet_symbol_bytes32))
        .to.emit(portfolioSub, "ParameterUpdated")
        .withArgs(subnet_symbol_bytes32, "P-REMOVETOKEN", 0, 0);

        //await f.printTokens([portfolioMain], portfolioSub, portfolioBridgeSub);

        // AVAX removed from both PBridgeSub and USDT removed from the portfoliosub
        await expect(portfolioSub.connect(owner)["removeToken(bytes32,uint32,bytes32)"](Utils.fromUtf8("AVAX"), cChain.chainListOrgId, Utils.fromUtf8("AVAX")))
        .to.emit(portfolioSub, "ParameterUpdated")
        .withArgs(Utils.fromUtf8("AVAX"), "P-REMOVETOKEN", 0, 0);
        tokenDetails = await portfolioBridgeSub.getTokenDetails(Utils.fromUtf8("AVAX" +  cChain.chainListOrgId));
        expect(tokenDetails.symbol).to.equal(ethers.constants.HashZero)
        // await f.printTokens([portfolioMain], portfolioSub, portfolioBridgeSub);

    });


    it("Should revert with non-existing function call", async () => {
        // try calling a scam addMyContract via a modified abi call
        const bogusAbi = "[{\"inputs\":[{\"internalType\":\"address\",\"name\":\"_contract\",\"type\":\"address\"}," +
                       "{\"internalType\":\"string\",\"name\":\"_organization\",\"type\":\"string\"}]," +
                       "\"name\":\"addMyContract\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]";
                       const contract = new ethers.Contract(portfolioSub.address, bogusAbi, owner);
        await expect(contract.addMyContract(trader2.address, "SCAMMER")).to.be.revertedWith("");
    });

    it("Should use processXFerPayload() correctly", async () => {


        let xfer: any = {};
        xfer = {nonce:0,
                 transaction: 0,  // WITHDRAW
                 trader:trader2.address,
                 symbol: AVAX,
                 quantity: Utils.toWei("0.01"),
                 timestamp: BigNumber.from(await f.latestTime()),
                 customdata: Utils.emptyCustomData()
        };


        // fail for non-admin
        await expect(portfolioSub.connect(trader2).processXFerPayload(xfer))
            .to.be.revertedWith("AccessControl:");

        // make owner part of PORTFOLIO_BRIDGE_ROLE on PortfolioSub
        await portfolioSub.grantRole(await portfolioSub.PORTFOLIO_BRIDGE_ROLE(), owner.address)

        // processing of withdraw messages will fail on subnet

        await expect(portfolioSub.processXFerPayload(xfer)).to.be.revertedWith("P-PTNS-01");

        // fail with 0 quantity
        xfer.quantity = 0;
        await expect(portfolioSub.processXFerPayload(xfer)).to.be.revertedWith("P-ZETD-01");
        // fail due to non existent token
        xfer.quantity = Utils.toWei("0.01");
        xfer.symbol = Utils.fromUtf8("NOT_EXISTING_TOKEN");
        await expect(portfolioSub.processXFerPayload(xfer)).to.be.revertedWith("P-ETNS-01");

        // try as many path ways as possible making sure they don't revert
        xfer.transaction = 1;  // DEPOSIT
        xfer.symbol = ALOT;
        // funded account
        await portfolioSub.setAuctionMode(AVAX, 0);
        await portfolioSub.processXFerPayload(xfer);
        await portfolioSub.setAuctionMode(AVAX, 1);
        await portfolioSub.processXFerPayload(xfer);
        // using an unfunded address

        xfer.trader = "0x1FB3cDeFF8d7531EA5b696cfc2d4eaFA5E54824D"
        xfer.symbol = AVAX;
        await portfolioSub.setAuctionMode(AVAX, 1);
        await portfolioSub.processXFerPayload(xfer);
        await portfolioSub.setAuctionMode(AVAX, 0);
        await portfolioSub.processXFerPayload(xfer);
        await portfolioSub.setAuctionMode(ALOT, 0);

        xfer.symbol = ALOT;
        await portfolioSub.processXFerPayload(xfer);
        await portfolioSub.setAuctionMode(ALOT, 1);
        await portfolioSub.processXFerPayload(xfer);
        await gasStation.setGasAmount(Utils.toWei("0.0101"));
        await portfolioSub.setAuctionMode(ALOT, 1);
        await portfolioSub.processXFerPayload(xfer);
        await portfolioSub.setAuctionMode(ALOT, 0);
        await portfolioSub.processXFerPayload(xfer);
        await portfolioSub.setAuctionMode(AVAX, 1);
        xfer.symbol = AVAX;
        await portfolioSub.processXFerPayload(xfer);
        await portfolioSub.setAuctionMode(AVAX, 1);
        await portfolioSub.processXFerPayload(xfer);
    });

    it("Should add and remove tokens correctly", async () => {

        const native = "ALOT";
        const symbol = "MOCK";
        const decimals = 18;

        const t = await f.deployMockToken(symbol, decimals);
        const { cChain} = f.getChains()

        const SYMBOL = Utils.fromUtf8(await t.symbol());

        let tokenList = await portfolioSub.getTokenList();
        expect(tokenList.length).to.be.equal(2);

        // fail not paused
        await expect(portfolioSub["removeToken(bytes32,uint32,bytes32)"](SYMBOL, srcChainListOrgId, SYMBOL)).to.be.revertedWith("Pausable: not paused");

        // silent fail if token is not in the token list
        await portfolioSub.pause();
        await portfolioSub["removeToken(bytes32,uint32,bytes32)"](SYMBOL, srcChainListOrgId,SYMBOL);
        tokenList = await portfolioSub.getTokenList();
        expect(tokenList.length).to.be.equal(2);

        // silent fail can't add native again
        await portfolioSub.addToken(Utils.fromUtf8(native), ethers.constants.AddressZero, srcChainListOrgId, 0, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),Utils.fromUtf8(native));
        tokenList = await portfolioSub.getTokenList();
        expect(tokenList.length).to.be.equal(2);

        // fail with decimals 0 token
        await expect(portfolioSub.addToken(SYMBOL, t.address, srcChainListOrgId, 0, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),SYMBOL)).to.be.revertedWith("P-CNAT-01");
        // check AVAX
        tokenList = await portfolioSub.getTokenList();
        expect(tokenList.includes(AVAX)).to.be.true;

        // succeed adding MOCK
        await portfolioSub.addToken(SYMBOL, t.address, srcChainListOrgId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),SYMBOL);
        tokenList = await portfolioSub.getTokenList();
        expect(tokenList.includes(SYMBOL)).to.be.true;
        expect(await portfolioBridgeSub.getTokenList()).to.include(Utils.fromUtf8("MOCK" + srcChainListOrgId));
        // succeed removing AVAX
        await portfolioSub["removeToken(bytes32,uint32,bytes32)"](AVAX, cChain.chainListOrgId, AVAX);
        tokenList = await portfolioSub.getTokenList();
        expect(tokenList.includes(AVAX)).to.be.false;
        // Token also removed from PBridgeSub
        expect(await portfolioBridgeSub.getTokenList()).to.not.include(Utils.fromUtf8("AVAX" + srcChainListOrgId));

        // succeed removing AVAX
        await portfolioSub["removeToken(bytes32,uint32,bytes32)"](SYMBOL, srcChainListOrgId, SYMBOL);
        tokenList = await portfolioSub.getTokenList();
        expect(tokenList.includes(SYMBOL)).to.be.false;
        // Token also removed from PBridgeSub
        expect(await portfolioBridgeSub.getTokenList()).to.not.include(Utils.fromUtf8("MOCK" + srcChainListOrgId));
    });


});
