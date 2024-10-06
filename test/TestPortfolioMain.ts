/**
 * The test runner for Dexalot PortfolioMain contract
 * Please do not test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import {
    PortfolioBridgeMain,
    PortfolioMain,
    PortfolioSub,
    TokenVestingCloneFactory,
    TokenVestingCloneable,
    TokenVestingCloneable__factory,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from "ethers";

describe("Portfolio Main", () => {
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let portfolioBridgeMain: PortfolioBridgeMain;
    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let factory: TokenVestingCloneFactory;
    let TokenVestingCloneable: TokenVestingCloneable__factory;
    let tokenVesting: TokenVestingCloneable;

    const AVAX: string = Utils.fromUtf8("AVAX");
    // const ALOT: string = Utils.fromUtf8("ALOT");

    let srcChainListOrgId: number;

    const tokenDecimals = 18;
    const auctionMode: any = 0;

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
        const portfolioContracts = await f.deployCompletePortfolio();
        await f.printTokens([portfolioContracts.portfolioMainnet], portfolioContracts.portfolioSub, portfolioContracts.portfolioBridgeSub);
        TokenVestingCloneable = await ethers.getContractFactory("TokenVestingCloneable") as TokenVestingCloneable__factory;
    })

    beforeEach(async function () {

        const portfolioContracts = await f.deployCompletePortfolio(true);
        portfolioMain = portfolioContracts.portfolioMainnet;
        portfolioSub = portfolioContracts.portfolioSub;
        portfolioBridgeMain = portfolioContracts.portfolioBridgeMainnet;

        const { cChain } = f.getChains();
        srcChainListOrgId = cChain.chainListOrgId;

    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolioMain.initialize(AVAX, srcChainListOrgId)).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should not add native token again after deployment", async function () {
        await expect(portfolioMain.addToken(AVAX, ethers.constants.AddressZero,  18, '0', ethers.utils.parseUnits('0.5',18))).to.be.revertedWith("P-TAEX-01");
    });

    it("Can only remove mainnet native token if no balances", async function () {
        await f.depositNative(portfolioMain, trader1, '50');
        await portfolioMain.pause();
        // fail when there is a balance
        await expect(portfolioMain.removeToken(AVAX, srcChainListOrgId)).to.be.revertedWith("P-NZBL-01");
        expect(await portfolioMain.nativeDepositsRestricted()).to.be.false;
        await portfolioMain.unpause()
        f.withdrawToken(portfolioSub, trader1, AVAX, 18, "50");
        // succeed if 0 balance
        await portfolioMain.pause()
        await expect(portfolioMain.removeToken(AVAX, srcChainListOrgId)).to.emit(portfolioMain, "ParameterUpdated")
            .withArgs(AVAX, "P-REMOVETOKEN", 0, 0);
        expect(await portfolioMain.nativeDepositsRestricted()).to.be.true;
    });


    it("Should not allow native deposits if restricted", async function () {
        await portfolioMain.pause();
        // fail when there is a balance
        await expect(portfolioMain.removeToken(AVAX, srcChainListOrgId)).to.emit(portfolioMain, "ParameterUpdated")
            .withArgs(AVAX, "P-REMOVETOKEN", 0, 0);
        expect(await portfolioMain.nativeDepositsRestricted()).to.be.true;
        await portfolioMain.unpause();
        await expect( f.depositNative(portfolioMain, trader1, '50')).to.be.revertedWith("P-NDNS-01");
    });

    it("Should be able to add native token again if native is removed", async function () {
        await portfolioMain.pause();
        // fail when there is a balance
        await expect(portfolioMain.removeToken(AVAX, srcChainListOrgId)).to.emit(portfolioMain, "ParameterUpdated")
            .withArgs(AVAX, "P-REMOVETOKEN", 0, 0);
        expect(await portfolioMain.nativeDepositsRestricted()).to.be.true;
        await portfolioMain.unpause();
        await portfolioMain.addToken(AVAX, ethers.constants.AddressZero, 18, '0', ethers.utils.parseUnits('0.5', 18));

        expect(await portfolioMain.nativeDepositsRestricted()).to.be.false;
        await f.depositNative(portfolioMain, trader1, '50');
        const res = await portfolioSub.getBalance(trader1.address, AVAX);
        expect(res.total).to.equal( ethers.utils.parseUnits('50', 18));
    });

    // it("Should update token references if ERC20 symbol has been renamed", async function () {

    //     const {trader1} = await f.getAccounts();
    //     const token_symbol = "EUROC";
    //     const token_decimals = 6;
    //     const euro_coin = await f.deployMockToken(token_symbol, token_decimals);
    //     const EUROC = Utils.fromUtf8(await euro_coin.symbol());
    //     const EURC = Utils.fromUtf8("EURC");
    //     await euro_coin.mint(trader1.address, ethers.utils.parseEther("100"));
    //     // succeed for admin
    //     await f.addToken(portfolioMain, portfolioSub, euro_coin, 1);
    //     let tokens = await portfolioMain.getTokenList();
    //     expect(tokens.find((token: string) => token === EUROC)).to.equal(EUROC);
    //     await f.depositToken(portfolioMain, trader1, euro_coin, token_decimals, EUROC, "100")
    //     expect((await portfolioSub.getBalance(trader1.address, EUROC)).total.toString()).to.equal(Utils.parseUnits("100", token_decimals));
    //     expect(await euro_coin.balanceOf(portfolioMain.address)).to.equal(Utils.parseUnits("100", token_decimals));
    //     // await f.printTokens([portfolioMain], portfolioSub, portfolioBridgeSub);

    //     await expect(portfolioMain.renameToken(EUROC, EURC)).to.be.revertedWith("Pausable: not paused");
    //     await portfolioMain.pause();
    //     await expect(portfolioMain.connect(trader1).renameToken(EUROC, EURC)).to.be.revertedWith("AccessControl: account");

    //     await expect(portfolioMain.renameToken(EUROC, EUROC)).to.be.revertedWith("P-LENM-01");
    //     await expect(portfolioMain.renameToken(EUROC, EURC)).to.be.revertedWith("P-TSDM-01");


    //     await euro_coin.renameSymbol("EURC");
    //     expect(await euro_coin.symbol()).to.be.equal("EURC");
    //     // rename works
    //     await expect(portfolioMain.renameToken(EUROC, EURC)).to.emit(portfolioMain, "ParameterUpdated")
    //         .withArgs(EUROC, "P-REMOVETOKEN", 0, 0);
    //     tokens = await portfolioMain.getTokenList();
    //     expect(tokens.find((token: string) => token === EURC)).to.equal(EURC);
    //     expect(tokens.find((token: string) => token === EUROC)).to.equal(undefined);
    //     // await f.printTokens([portfolioMain], portfolioSub, portfolioBridgeSub);
    //     // no change in eurocoin balances
    //     expect(await euro_coin.balanceOf(portfolioMain.address)).to.equal(Utils.parseUnits("100", token_decimals));
    //     await portfolioMain.unpause();
    //     const {dexalotSubnet } = f.getChains();

    //     // The below mocks messages to test PB-ETNS-02 on PortfolioBridgeMain ()
    //     const nonce = 0;
    //     const transaction = 0;   //  transaction:   0 = WITHDRAW,  1 = DEPOSIT [main --> sub]

    //     await portfolioBridgeMain.setLzEndPoint(owner.address);
    //     const trustedRemote = await portfolioBridgeMain.lzTrustedRemoteLookup(dexalotSubnet.lzChainId);
    //     // Try withdrawing EUROC - fails
    //     let withDrawEURCPayload = Utils.generatePayload(0, nonce, transaction, trader1.address, EUROC, Utils.parseUnits("100", token_decimals), await f.latestTime(), Utils.emptyCustomData());
    //     await expect(portfolioBridgeMain.lzReceive(dexalotSubnet.lzChainId, trustedRemote, 1, withDrawEURCPayload)).to.be.revertedWith("PB-ETNS-02");

    //     //Succeed with EURC. This assumes that subnet symbols don't change, it has already been converted as a part of March upgrade.
    //     withDrawEURCPayload = Utils.generatePayload(0, nonce, transaction, trader1.address, EURC, Utils.parseUnits("100", token_decimals), await f.latestTime(), Utils.emptyCustomData());
    //     await portfolioBridgeMain.lzReceive(dexalotSubnet.lzChainId, trustedRemote, 1, withDrawEURCPayload)
    //     expect(await euro_coin.balanceOf(portfolioMain.address)).to.equal(0);

    // });


    it("Should add and remove ERC20 token to portfolio main", async () => {
        const {trader1} = await f.getAccounts();
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        // fail for non-admin
        await expect(portfolioMain.connect(trader1).addToken(USDT, usdt.address,  await usdt.decimals(), '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        // succeed for admin
        await portfolioMain.addToken(USDT, usdt.address,  await usdt.decimals(), '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off
        const tokens = await portfolioMain.getTokenList();
        expect(tokens.find((token: string)=> token === USDT)).to.equal(USDT);

        await expect(portfolioMain.removeToken(USDT, srcChainListOrgId)).to.be.revertedWith("Pausable: not paused");
        await portfolioMain.pause();
        await expect(portfolioMain.connect(trader1).removeToken(USDT, srcChainListOrgId)).to.be.revertedWith("AccessControl: account");

        await expect(portfolioMain.removeToken(USDT, srcChainListOrgId))
        .to.emit(portfolioMain, "ParameterUpdated")
        .withArgs(USDT, "P-REMOVETOKEN", 0, 0);

        // do nothing for non-existent token
        await portfolioMain.removeToken(Utils.fromUtf8("MOCK"), srcChainListOrgId)
    });

    it("Should not add ERC20 token to portfolio main if parameters are incorrect", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());


        await expect(portfolioMain.addToken(USDT, usdt.address,  0,  '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-CNAT-01");
        await expect(portfolioMain.addToken(USDT, ethers.constants.AddressZero,   tokenDecimals, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-ZADDR-01");
        await expect(portfolioMain.addToken(Utils.fromUtf8("MOCK"), usdt.address,   tokenDecimals,  '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-TSDM-01");
        await expect(portfolioMain.addToken(USDT, usdt.address, 2,  '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-TDDM-01");
    });

    it("Should not remove erc20 if it has deposits", async () => {
        const {trader1} = await f.getAccounts();
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        await usdt.mint(trader1.address, ethers.utils.parseEther("100"))

        await f.addToken(portfolioMain, portfolioSub, usdt, 1);


        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, "100")

        expect((await portfolioSub.getBalance(trader1.address, USDT)).total.toString()).to.equal(Utils.parseUnits("100", token_decimals));
        await portfolioMain.pause();
        await expect(portfolioMain.removeToken(USDT, srcChainListOrgId))
        .to.be.revertedWith("P-NZBL-01");
    });

    it("Should pause and unpause Portfolio & PBridge when out of synch", async function () {
        await expect(portfolioBridgeMain.pause()).to.be.revertedWith("AccessControl: account");

        await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
        await portfolioBridgeMain.connect(owner).pause();
        expect(await portfolioBridgeMain.paused()).to.be.true;

        await portfolioMain.pause();
        expect(await portfolioMain.paused()).to.be.true;
        expect(await portfolioBridgeMain.paused()).to.be.true;

        await portfolioBridgeMain.connect(owner).unpause();
        expect(await portfolioBridgeMain.paused()).to.be.false;
        // succeed for admin
        await portfolioMain.unpause();
        expect(await portfolioMain.paused()).to.be.false;
        expect(await portfolioBridgeMain.paused()).to.be.false;

        // they are in synch
        await portfolioMain.pause();
        expect(await portfolioMain.paused()).to.be.true;
        expect(await portfolioBridgeMain.paused()).to.be.true;

        await portfolioMain.unpause();
        expect(await portfolioMain.paused()).to.be.false;
        expect(await portfolioBridgeMain.paused()).to.be.false;
    });


    // it("Should add/remove virtual tokens properly- Should be deprecated", async () => {
    //     // Virtual tokens are not used, use xChainAllowedDestinations
    //     const { trader1 } = await f.getAccounts();
    //     const token_symbol = "USDT";
    //     const token_decimals = 18;
    //     const erc20_token_decimals = 6;
    //     const usdt = await f.deployMockToken(token_symbol, erc20_token_decimals);
    //     const USDT = Utils.fromUtf8(token_symbol);
    //     await usdt.mint(trader1.address, ethers.utils.parseEther("100"))


    //     const remoteChainIdofToken = 99;
    //     await f.addVirtualToken(portfolioMain, token_symbol, token_decimals, remoteChainIdofToken);
    //     let tokenDetails = await portfolioMain.getTokenDetails(USDT);
    //     expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
    //     expect(tokenDetails.auctionMode).to.equal(0);
    //     expect(tokenDetails.decimals).to.equal(token_decimals);
    //     expect(tokenDetails.srcChainId).to.equal(remoteChainIdofToken);
    //     expect(tokenDetails.isVirtual).to.equal(true);

    //     await expect(portfolioMain.connect(trader1).depositToken(trader1.address, USDT, Utils.parseUnits('1', tokenDecimals), 0)).to.be.revertedWith("P-VTNS-01");

    //     // Cannot add an ERC20 with the same symbol as the virtual..
    //     await expect(f.addToken(portfolioMain, portfolioSub, usdt, 1)).to.be.revertedWith("P-TAEX-01");

    //     await portfolioMain.pause();
    //     await expect(portfolioMain.removeToken(USDT, remoteChainIdofToken)).to.emit(portfolioMain, "ParameterUpdated")
    //     .withArgs(USDT, "P-REMOVETOKEN", 0, 0);

    //     // Now we can add the ERC20
    //     await f.addTokenToPortfolioMain(portfolioMain, usdt, 1);
    //     tokenDetails = await portfolioMain.getTokenDetails(USDT);
    //     expect(tokenDetails.tokenAddress).to.equal(usdt.address);
    //     expect(tokenDetails.auctionMode).to.equal(0);
    //     expect(tokenDetails.decimals).to.equal(erc20_token_decimals);
    //     expect(tokenDetails.srcChainId).to.equal(srcChainListOrgId);
    //     expect(tokenDetails.isVirtual).to.equal(false);
    // });


    it("Should set Minimum Deposit Multiplier", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        const gasSwapRatio= 0.5
        await f.addToken(portfolioMain, portfolioSub, usdt, gasSwapRatio);

        const currMultp = 19 // always divided by 10 (making it 1.9)
        expect(await portfolioMain.minDepositMultiplier()).to.equal(currMultp);
        const minDepAmount =  Utils.parseUnits(gasSwapRatio.toString(),tokenDecimals).mul(currMultp).div(10);

        expect(await portfolioMain.getMinDepositAmount(USDT)).to.equal(minDepAmount);

        await expect(portfolioMain.connect(trader1).setMinDepositMultiplier(15)).to.be.revertedWith("AccessControl");
        await expect(portfolioMain.setMinDepositMultiplier(9)).to.be.revertedWith("P-MDML-01");
        await expect(portfolioMain.setMinDepositMultiplier(10))
        .to.emit(portfolioMain, "ParameterUpdated")
        .withArgs(Utils.fromUtf8("PortfolioMain"), "P-MINDEP-MULT", currMultp, 10);

    });

    it("Should get token details", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await f.addToken(portfolioMain, portfolioSub, usdt, 0.5);

        let tokenDetails = await portfolioMain.getTokenDetails(USDT);
        expect(tokenDetails.tokenAddress).to.equal(usdt.address);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);
        expect(tokenDetails.srcChainId).to.equal(srcChainListOrgId);
        expect(tokenDetails.isVirtual).to.equal(false);

        tokenDetails = await portfolioMain.getTokenDetails(AVAX);
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(18);
        expect(tokenDetails.srcChainId).to.equal(srcChainListOrgId);
        expect(tokenDetails.isVirtual).to.equal(false);

        tokenDetails = await portfolioMain.getTokenDetails(Utils.fromUtf8("USDC"));
        expect(tokenDetails.tokenAddress).to.equal(ethers.constants.AddressZero);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(0);
        expect(tokenDetails.srcChainId).to.equal(0);
        expect(tokenDetails.isVirtual).to.equal(false);


    });



    it("Should use processXFerPayload() correctly", async () => {
        const { owner, trader2 } = await f.getAccounts();

        // make owner part of PORTFOLIO_BRIDGE_ROLE on PortfolioMain
        await portfolioMain.grantRole(await portfolioMain.PORTFOLIO_BRIDGE_ROLE(), owner.address)

        // processing of deposit messages will fail on mainnet
        let xfer: any = {};
        xfer = {nonce:0,
                 transaction: 1, // DEPOSIT
                 trader:trader2.address,
                 symbol: AVAX,
                 quantity: Utils.toWei("0.01"),
                 timestamp: BigNumber.from(await f.latestTime()),
                 customdata: Utils.emptyCustomData()
        };


        // fail for non-admin
        await expect(portfolioMain.connect(trader1).processXFerPayload(xfer))
            .to.be.revertedWith("AccessControl");
        // succeed for admin
        xfer.trader = trader2.address;
        await expect(portfolioMain.processXFerPayload(xfer))
            .to.be.revertedWith("P-PTNS-02");

        xfer.trader = owner.address;
        xfer.transaction = 0; // WITHDRAW
        xfer.quantity = 0;
        // fail with 0 quantity
        await expect(portfolioMain.processXFerPayload(xfer)).to.be.revertedWith("P-ZETD-01");

        // fail for trader witrh zero address(0)
        xfer.trader = ethers.constants.AddressZero;
        xfer.quantity = Utils.toWei("0.01");
        await expect(portfolioMain.processXFerPayload(xfer)).to.be.revertedWith("P-ZADDR-02");

        // fail due to failed send
        xfer.trader = owner.address;
        await expect(portfolioMain.processXFerPayload(xfer)).to.be.revertedWith("P-WNFA-01");


    });

    it("Should set and get the banned accounts address correctly", async () => {
        const bannedAccounts = await portfolioMain.getBannedAccounts();
        // fail for unpriviliged accounts
        await expect(portfolioMain.connect(trader1).setBannedAccounts(portfolioBridgeMain.address)).to.be.revertedWith("AccessControl:");
        // succeed for admin account
        await portfolioMain.setBannedAccounts(portfolioBridgeMain.address);
        expect(await portfolioMain.getBannedAccounts()).to.equal(portfolioBridgeMain.address);
        await portfolioMain.setBannedAccounts(bannedAccounts);
        expect(await portfolioMain.getBannedAccounts()).to.equal(bannedAccounts);
    });

    it("Should add a trusted contract to Portfolio from the admin account", async function () {
        const start = await f.latestTime() + 10000;
        const cliff = 20000;
        const duration = 120000;
        const startPortfolioDeposits = start - 10000;
        const revocable = true;
        const percentage = 15;
        const period = 0;

        factory = await f.deployTokenVestingCloneFactory();
        await factory.createTokenVesting(trader2.address, start, cliff, duration, startPortfolioDeposits,
            revocable, percentage, period, portfolioMain.address, owner.address);
        const count = await factory.count();
        tokenVesting = TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        await usdt.deployed();
        const USDT = Utils.fromUtf8(await usdt.symbol());

        // fail from non-privileged account
        // trader1
        await expect(portfolioMain.connect(trader1).addToken(USDT, usdt.address,  await usdt.decimals(), '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(trader1).addToken(USDT, usdt.address, srcChainListOrgId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),USDT)).to.be.revertedWith("AccessControl:");
        // auctionAdmin when removed
        await portfolioMain.grantRole(await portfolioMain.DEFAULT_ADMIN_ROLE(), trader2.address);        // adding trader2 so I can remove auctionAdmin
        await portfolioSub.grantRole(await portfolioSub.DEFAULT_ADMIN_ROLE(), trader2.address);  // adding trader2 so I can remove auctionAdmin
        await portfolioMain.revokeRole(await portfolioMain.DEFAULT_ADMIN_ROLE(), auctionAdmin.address);
        await portfolioSub.revokeRole(await portfolioSub.DEFAULT_ADMIN_ROLE(), auctionAdmin.address);
        await expect(portfolioMain.connect(auctionAdmin).addToken(USDT, usdt.address, await usdt.decimals(), '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(auctionAdmin).addToken(USDT, usdt.address, auctionMode, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),USDT)).to.be.revertedWith("AccessControl:");
        // wrong srcChainId
        // const wrongSrcChainId = 8;
        // await expect(portfolioMain.addToken(USDT, usdt.address, wrongSrcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),false))
        //     .to.be.revertedWith("P-SCEM-01"); //Auction mode off
        // succeed from privileged account
        // auctionAdmin when added
        // await portfolioMain.grantRole(portfolioMain.AUCTION_ADMIN_ROLE(), auctionAdmin.address);
        // await portfolioSub.grantRole(portfolioSub.AUCTION_ADMIN_ROLE(), auctionAdmin.address);
        await portfolioMain.addToken(USDT, usdt.address, await usdt.decimals(), '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off
        await portfolioSub.addToken(USDT, usdt.address, srcChainListOrgId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),USDT); //Auction mode off

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

        await usdt.connect(trader2).approve(tokenVesting.address,  Utils.toWei('150'));
        await usdt.connect(trader2).approve(portfolioMain.address,  Utils.toWei('150'));
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

        factory = await f.deployTokenVestingCloneFactory();
        await factory.createTokenVesting(trader2.address, start, cliff, duration, startPortfolioDeposits,
            revocable, percentage, period, portfolioMain.address, owner.address);
        const count = await factory.count();
        tokenVesting = TokenVestingCloneable.attach(await factory.getClone(count.sub(1)))

        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        await usdt.deployed();
        const USDT = Utils.fromUtf8(await usdt.symbol());
        await portfolioMain.addToken(USDT, usdt.address, await usdt.decimals(), '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off
        await portfolioSub.addToken(USDT, usdt.address, srcChainListOrgId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals),USDT); //Auction mode off

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
