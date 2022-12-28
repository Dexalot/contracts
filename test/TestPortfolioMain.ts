/**
 * The test runner for Dexalot PortfolioMain contract
 * Please do not test deposit/withdraw functions inside this test suite.
 */

import Utils from './utils';

import {
    LZEndpointMock,
    PortfolioBridge,
    PortfolioBridgeSub,
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

describe("Portfolio Main", () => {
    let portfolioSub: PortfolioSub;
    let portfolioMain: PortfolioMain;
    let portfolioBridgeMain: PortfolioBridge;

    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let auctionAdmin: SignerWithAddress;
    let trader1: SignerWithAddress;
    let trader2: SignerWithAddress;

    let factory: TokenVestingCloneFactory;
    let TokenVestingCloneable: TokenVestingCloneable__factory;
    let tokenVesting: TokenVestingCloneable;

    const AVAX: string = Utils.fromUtf8("AVAX");
    const ALOT: string = Utils.fromUtf8("ALOT");

    const srcChainId: any = 1;

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

        TokenVestingCloneable = await ethers.getContractFactory("TokenVestingCloneable") as TokenVestingCloneable__factory;
    })

    beforeEach(async function () {

        const {portfolioMain: portfolioM, portfolioSub: portfolioS, lzEndpointMain, portfolioBridgeMain: pbrigeMain, portfolioBridgeSub: pbrigeSub, gasStation: gStation} = await f.deployCompletePortfolio();
        portfolioMain = portfolioM;
        portfolioSub = portfolioS;
        portfolioBridgeMain =pbrigeMain;


    });

    it("Should not initialize again after deployment", async function () {
        await expect(portfolioMain.initialize(AVAX, srcChainId)).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should add and remove ERC20 token to portfolio main", async () => {
        const {trader1} = await f.getAccounts();
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        // fail for non-admin
        await expect(portfolioMain.connect(trader1).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        // succeed for admin
        await portfolioMain.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off
        const tokens = await portfolioMain.getTokenList();
        expect(tokens[1]).to.equal(USDT);

        await expect(portfolioMain.removeToken(USDT, srcChainId)).to.be.revertedWith("Pausable: not paused");
        await portfolioMain.pause();
        await expect(portfolioMain.connect(trader1).removeToken(USDT, srcChainId)).to.be.revertedWith("AccessControl: account");

        await expect(portfolioMain.removeToken(USDT, srcChainId))
        .to.emit(portfolioMain, "ParameterUpdated")
        .withArgs(USDT, "P-REMOVETOKEN", 0, 0);

        // do nothing for non-existent token
        await portfolioMain.removeToken(Utils.fromUtf8("MOCK"), srcChainId)

        // can't remove AVAX token
        await portfolioMain.removeToken(Utils.fromUtf8("AVAX"), srcChainId)
    });

    it("Should not add ERC20 token to portfolio main if parameters are incorrect", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        portfolioMain.removeToken(AVAX, srcChainId); // silent fail



        await expect(portfolioMain.addToken(USDT, usdt.address, srcChainId, 0, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-CNAT-01");
        await expect(portfolioMain.addToken(USDT, "0x0000000000000000000000000000000000000000", srcChainId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-ZADDR-01");
        await expect(portfolioMain.addToken(Utils.fromUtf8("MOCK"), usdt.address, srcChainId, tokenDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-TSDM-01");
        await expect(portfolioMain.addToken(USDT, usdt.address, srcChainId, 2, auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("P-TDDM-01");
    });

    it("Should not remove erc20 if it has deposits", async () => {
        const {trader1} = await f.getAccounts();
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());

        await usdt.mint(trader1.address, ethers.utils.parseEther("100"))

        await f.addToken(portfolioMain, usdt, 1);
        await f.addToken(portfolioSub, usdt, 1);

        await f.depositToken(portfolioMain, trader1, usdt, token_decimals, USDT, "100")

        expect((await portfolioSub.getBalance(trader1.address, USDT)).total.toString()).to.equal(Utils.parseUnits("100", token_decimals));
        await portfolioMain.pause();
        await expect(portfolioMain.removeToken(USDT, srcChainId))
        .to.be.revertedWith("P-NZBL-01");
    });

    it("Should set Minimum Deposit Multipler", async () => {
        const token_symbol = "USDT";
        const token_decimals = 18;
        const usdt = await f.deployMockToken(token_symbol, token_decimals);
        const USDT = Utils.fromUtf8(await usdt.symbol());
        const gasSwapRatio= 0.5
        await f.addToken(portfolioMain, usdt, gasSwapRatio);
        await f.addToken(portfolioSub, usdt, gasSwapRatio);

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
        await f.addToken(portfolioMain, usdt, 0.5);
        await f.addToken(portfolioSub, usdt, 0.5);

        let tokenDetails = await portfolioMain.getTokenDetails(USDT);
        expect(tokenDetails.tokenAddress).to.equal(usdt.address);
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(token_decimals);

        tokenDetails = await portfolioMain.getTokenDetails(AVAX);
        expect(tokenDetails.tokenAddress).to.equal("0x0000000000000000000000000000000000000000");
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(18);

        tokenDetails = await portfolioMain.getTokenDetails(Utils.fromUtf8("USDC"));
        expect(tokenDetails.tokenAddress).to.equal("0x0000000000000000000000000000000000000000");
        expect(tokenDetails.auctionMode).to.equal(0);
        expect(tokenDetails.decimals).to.equal(0);


    });



    it("Should use processXFerPayload() correctly", async () => {
        const { owner, trader2 } = await f.getAccounts();
        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

        // make owner part of PORTFOLIO_BRIDGE_ROLE on PortfolioMain
        await portfolioMain.grantRole(await portfolioMain.PORTFOLIO_BRIDGE_ROLE(), owner.address)

        // processing of deposit messages will fail on mainnet
        let Tx = 1;  // DEPOSIT
        // fail for non-admin
        await expect(portfolioMain.connect(trader1).processXFerPayload(trader2.address, AVAX, Utils.toWei("0.01"), Tx))
            .to.be.revertedWith("AccessControl");
        // succeed for admin
        await expect(portfolioMain.processXFerPayload(trader2.address, AVAX, Utils.toWei("0.01"), Tx))
            .to.be.revertedWith("P-PTNS-01");

        Tx = 0;  // WITHDRAW
        // fail with 0 quantity
        await expect(portfolioMain.processXFerPayload(owner.address, AVAX, 0, Tx)).to.be.revertedWith("P-ZETD-01");

        // fail for trader witrh zero address(0)
        await expect(portfolioMain.processXFerPayload(ZERO_ADDRESS, AVAX, Utils.toWei("0.01"), Tx)).to.be.revertedWith("P-ZADDR-02");

        // fail due to failed send
        await expect(portfolioMain.processXFerPayload(owner.address, AVAX, Utils.toWei("0.01"), Tx)).to.be.revertedWith("P-WNFA-01");

        // fail due to token not in portfolioMain
        await expect(portfolioMain.processXFerPayload(owner.address, ALOT, Utils.toWei("0.01"), Tx)).to.be.revertedWith("P-ETNS-02");
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
        await expect(portfolioMain.connect(trader1).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(trader1).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        // auctionAdmin when removed
        await portfolioMain.grantRole(portfolioMain.DEFAULT_ADMIN_ROLE(), trader2.address);        // adding trader2 so I can remove auctionAdmin
        await portfolioSub.grantRole(portfolioSub.DEFAULT_ADMIN_ROLE(), trader2.address);  // adding trader2 so I can remove auctionAdmin
        await portfolioMain.revokeRole(portfolioMain.DEFAULT_ADMIN_ROLE(), auctionAdmin.address);
        await portfolioSub.revokeRole(portfolioSub.DEFAULT_ADMIN_ROLE(), auctionAdmin.address);
        await expect(portfolioMain.connect(auctionAdmin).addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        await expect(portfolioSub.connect(auctionAdmin).addToken(USDT, usdt.address, auctionMode, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals))).to.be.revertedWith("AccessControl:");
        // wrong srcChainId
        const wrongSrcChainId = 8;
        await expect(portfolioMain.addToken(USDT, usdt.address, wrongSrcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)))
            .to.be.revertedWith("P-SCEM-01"); //Auction mode off
        // succeed from privileged account
        // auctionAdmin when added
        // await portfolioMain.grantRole(portfolioMain.AUCTION_ADMIN_ROLE(), auctionAdmin.address);
        // await portfolioSub.grantRole(portfolioSub.AUCTION_ADMIN_ROLE(), auctionAdmin.address);
        await portfolioMain.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off
        await portfolioSub.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off

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
        await portfolioMain.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off
        await portfolioSub.addToken(USDT, usdt.address, srcChainId, await usdt.decimals(), auctionMode, '0', ethers.utils.parseUnits('0.5',token_decimals)); //Auction mode off

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
