/**
 * The test runner for Dexalot Portfolio Extensions.
 * Tests added logic of gas airdrop, wrapping/unwrapping of tokens and differing decimals.
 */

import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MainnetRFQ, MockToken, MockWrappedToken, PortfolioBridgeMain, PortfolioBridgeSub, PortfolioMain, PortfolioSub } from "../typechain-types";
import * as f from "./MakeTestSuite";
import { expect } from "chai";

enum Options {
  GASAIRDROP,
  UNWRAP
}

describe("Portfolio Gas Airdrop", () => {
  let portfolioBridgeMain: PortfolioBridgeMain;
  let portfolioBridgeSub: PortfolioBridgeSub;
  let portfolioMain: PortfolioMain;
  let portfolioSub: PortfolioSub;
  let contractNoNative: MainnetRFQ;
  let owner: SignerWithAddress;
  const mainnetChainId = f.getChains().cChain.chainListOrgId;
  const tokenSymbol = Utils.fromUtf8("USDC");

  let usdc: MockToken;
  let trader1: SignerWithAddress;
  const dummyGasAirdrop = Utils.parseUnits("0.1", 18);
  const dummyQty = Utils.parseUnits("100", 6);
  const airdropOptions = "0x01"
  const dummyOptionGasCost = 5000; // 50% of bridge fee

  before(async () => {
    const acct = await f.getAccounts();
    owner = acct.owner;
    trader1 = acct.trader1;
  });

  beforeEach(async () => {
    const portfolioContracts = await f.deployCompletePortfolio(true);
    portfolioBridgeMain = portfolioContracts.portfolioBridgeMainnet;
    portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
    portfolioMain = portfolioContracts.portfolioMainnet;
    portfolioSub = portfolioContracts.portfolioSub;
    contractNoNative = portfolioContracts.mainnetRFQ;

    usdc = await f.deployMockToken("USDC", 6);
    await f.addToken(portfolioMain, portfolioSub, usdc, 0.5); //gasSwapRatio 0.5

    await usdc.mint(trader1.address, Utils.parseUnits("1000", 6));

    await f.depositToken(portfolioMain, trader1, usdc, 6, tokenSymbol, "100");
    await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
    await portfolioBridgeSub.setBridgeFees(mainnetChainId, [tokenSymbol], [Utils.parseUnits("1", 6)])
  });

  const setGasAirdrop = async () => {
    await expect(portfolioBridgeMain.setGasAirdrop(dummyGasAirdrop)).to.not.be.reverted;

    expect(await portfolioBridgeMain.gasAirdrop()).to.equal(dummyGasAirdrop);
  }

  const setOptionGasCost = async (option: Options) => {
    await expect(portfolioBridgeSub.setOptionGasCost(option, dummyOptionGasCost)).to.not.be.reverted;

    expect(await portfolioBridgeSub.optionsGasCost(option)).to.equal(dummyOptionGasCost);
  }

  it("should fail to set gas airdrop if not owner", async () => {
    await expect(portfolioBridgeMain.connect(trader1).setGasAirdrop(dummyGasAirdrop)).to.be.revertedWith("AccessControl: account");
  });

  it("should fail to set optionsGasCost if not owner", async () => {
    await expect(portfolioBridgeSub.connect(trader1).setOptionGasCost(Options.GASAIRDROP, dummyOptionGasCost)).to.be.revertedWith("AccessControl: account");
  });

  it("should successfully set gas airdrop if owner", async () => {
    await setGasAirdrop();
  });

  it("should not add to bridge fee if optionsGasCost not set", async () => {
    const bFee = await portfolioSub.getBridgeFee(0, mainnetChainId, tokenSymbol, dummyQty, airdropOptions);

    await setGasAirdrop();

    expect(await portfolioSub.getBridgeFee(0, mainnetChainId, tokenSymbol, dummyQty, airdropOptions)).to.equal(bFee);
  });

  it("should add to bridge fee if optionsGasCost set", async () => {
    const bFee = await portfolioSub.getBridgeFee(0, mainnetChainId, tokenSymbol, dummyQty, airdropOptions);

    await setGasAirdrop();
    await setOptionGasCost(Options.GASAIRDROP);

    expect(await portfolioSub.getBridgeFee(0, mainnetChainId, tokenSymbol, dummyQty, airdropOptions)).to.equal(bFee.mul(150).div(100));
  });

  it("should not airdrop if gas airdrop not set", async () => {
    const balBefore = await trader1.getBalance();
    const tx = await portfolioSub.connect(trader1)['withdrawToken(address,bytes32,bytes32,uint256,uint8,uint32,bytes1)'](
      trader1.address, Utils.addressToBytes32(trader1.address), tokenSymbol, dummyQty, 0, mainnetChainId, airdropOptions
    );

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

    expect(await trader1.getBalance()).to.equal(balBefore.sub(gasSpent));
  });

  it("should successfully airdrop if gas airdrop", async () => {
    await setGasAirdrop();
    await setOptionGasCost(Options.GASAIRDROP);

    const balBefore = await trader1.getBalance();
    const tx = await portfolioSub.connect(trader1)['withdrawToken(address,bytes32,bytes32,uint256,uint8,uint32,bytes1)'](
      trader1.address, Utils.addressToBytes32(trader1.address), tokenSymbol, dummyQty, 0, mainnetChainId, airdropOptions
    );

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

    expect(await trader1.getBalance()).to.equal(balBefore.add(dummyGasAirdrop).sub(gasSpent));
  });

  it("should fail to airdrop if address cannot receive tokens", async () => {
    await setGasAirdrop();
    await setOptionGasCost(Options.GASAIRDROP);

    const balBefore = await usdc.balanceOf(trader1.address);

    // silent fails when trying gas airdrop to contract
    await portfolioSub.connect(trader1)['withdrawToken(address,bytes32,bytes32,uint256,uint8,uint32,bytes1)'](
      trader1.address, Utils.addressToBytes32(contractNoNative.address), tokenSymbol, dummyQty, 0, mainnetChainId, airdropOptions
    );

    expect(await usdc.balanceOf(trader1.address)).to.equal(balBefore);
  });
});

describe("Portfolio Unwrap/Wrap", () => {
  let portfolioBridgeSub: PortfolioBridgeSub;
  let portfolioAvax: PortfolioMain;
  let portfolioArb: PortfolioMain;
  let portfolioSub: PortfolioSub;
  let owner: SignerWithAddress;
  const avaxChainId = f.getChains().cChain.chainListOrgId;
  const arbChainId = f.getChains().arbitrumChain.chainListOrgId;

  let wavax: MockWrappedToken;
  const wavaxUtf = Utils.fromUtf8("WAVAX");
  let weth: MockWrappedToken;
  const wethUtf = Utils.fromUtf8("WETH");
  const ethUtf = Utils.fromUtf8("ETH");
  let trader1: SignerWithAddress;
  const initialBalance = Utils.parseUnits("100", 18);
  const dummyQty = Utils.parseUnits("10", 18);
  const unwrapOptions = "0x02"
  const dummyOptionGasCost = 5000; // 50% of bridge fee

  const setOptionGasCost = async (option: Options) => {
    await expect(portfolioBridgeSub.setOptionGasCost(option, dummyOptionGasCost)).to.not.be.reverted;

    expect(await portfolioBridgeSub.optionsGasCost(option)).to.equal(dummyOptionGasCost);
  }

  before(async () => {
    const acct = await f.getAccounts();
    owner = acct.owner;
    trader1 = acct.trader1;
  });

  beforeEach(async () => {
    const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);
    portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
    portfolioAvax = portfolioContracts.portfolioAvax;
    portfolioArb = portfolioContracts.portfolioArb;
    portfolioSub = portfolioContracts.portfolioSub;

    await portfolioArb.pause();
    await portfolioArb.removeToken(ethUtf, arbChainId);
    await portfolioArb.unpause();

    weth = await f.deployMockWrappedToken("WETH", 18);
    wavax = await f.deployMockWrappedToken("WAVAX", 18);
    await f.addToken(portfolioArb, portfolioSub, weth, 0.5, undefined, undefined, undefined, "ETH"); //gasSwapRatio 0.5

    await weth.connect(trader1).deposit({ value: initialBalance });
    await wavax.connect(trader1).deposit({ value: initialBalance });

    await f.depositToken(portfolioArb, trader1, weth, 18, wethUtf, "100");
    await f.depositNative(portfolioAvax, trader1, "100");
    await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_ADMIN_ROLE(), owner.address);
    await portfolioBridgeSub.setBridgeFees(arbChainId, [ethUtf], [Utils.parseUnits("1", 6)])
  });

  const setWrappedNativeAvax = async () => {
    await expect(portfolioAvax.setWrappedNative(wavaxUtf)).to.not.be.reverted;

    expect(await portfolioAvax.wrappedNative()).to.equal(wavaxUtf);
  }

  const setWrappedNativeArb = async () => {
    await expect(portfolioArb.setWrappedNative(wethUtf)).to.not.be.reverted;

    expect(await portfolioArb.wrappedNative()).to.equal(wethUtf);
  }

  it("should fail to set wrapped native if not owner", async () => {
    await expect(portfolioAvax.connect(trader1).setWrappedNative(wavaxUtf)).to.be.revertedWith("AccessControl: account");
  });

  it("should successfully set wrapped native if owner", async () => {
    await setWrappedNativeAvax();
    await setWrappedNativeArb();
  });

  it("should not add to bridge fee if optionsGasCost not set", async () => {
    const bFee = await portfolioSub.getBridgeFee(0, arbChainId, ethUtf, dummyQty, unwrapOptions);

    expect(await portfolioSub.getBridgeFee(0, arbChainId, ethUtf, dummyQty, unwrapOptions)).to.equal(bFee);
  });

  it("should add to bridge fee if optionsGasCost set", async () => {
    const bFee = await portfolioSub.getBridgeFee(0, arbChainId, ethUtf, dummyQty, unwrapOptions);

    await setOptionGasCost(Options.UNWRAP);

    expect(await portfolioSub.getBridgeFee(0, arbChainId, ethUtf, dummyQty, unwrapOptions)).to.equal(bFee.mul(150).div(100));
  });

  it("should successfully unwrap if unwrap option set", async () => {
    await setOptionGasCost(Options.UNWRAP);
    await setWrappedNativeArb();

    const balBefore = await trader1.getBalance();
    const wethBalBefore = await weth.balanceOf(trader1.address);
    await portfolioSub.connect(trader1)['withdrawToken(address,bytes32,bytes32,uint256,uint8,uint32,bytes1)'](
      trader1.address, Utils.addressToBytes32(trader1.address), ethUtf, dummyQty, 0, arbChainId, unwrapOptions
    );

    const balanceAfter = await trader1.getBalance();

    expect(balanceAfter.sub(dummyQty).lte(balBefore));
    expect(await weth.balanceOf(trader1.address)).to.equal(wethBalBefore);
  });

  it("should ignore unwrap if unwrap option set but not on portfolio main", async () => {
    await setOptionGasCost(Options.UNWRAP);

    const balBefore = await trader1.getBalance();
    const wavaxBalBefore = await wavax.balanceOf(trader1.address);
    await portfolioSub.connect(trader1)['withdrawToken(address,bytes32,bytes32,uint256,uint8,uint32,bytes1)'](
      trader1.address, Utils.addressToBytes32(trader1.address), Utils.fromUtf8("AVAX"), dummyQty, 0, avaxChainId, unwrapOptions
    );

    const balanceAfter = await trader1.getBalance();

    expect(balanceAfter.sub(dummyQty).lte(balBefore));
    expect(await wavax.balanceOf(trader1.address)).to.equal(wavaxBalBefore);
  });

  it("should ignore unwrap if unwrap option set but native provided", async () => {
    await setOptionGasCost(Options.UNWRAP);
    await setWrappedNativeAvax();

    const balBefore = await trader1.getBalance();
    const wavaxBalBefore = await wavax.balanceOf(trader1.address);
    await portfolioSub.connect(trader1)['withdrawToken(address,bytes32,bytes32,uint256,uint8,uint32,bytes1)'](
      trader1.address, Utils.addressToBytes32(trader1.address), Utils.fromUtf8("AVAX"), dummyQty, 0, avaxChainId, unwrapOptions
    );

    const balanceAfter = await trader1.getBalance();

    expect(balanceAfter.sub(dummyQty).lte(balBefore));
    expect(await wavax.balanceOf(trader1.address)).to.equal(wavaxBalBefore);
  });

  it("should wrap token if native provided for arb", async () => {
    await setWrappedNativeArb();

    const balBefore = await trader1.getBalance();
    const wethBalBefore = await weth.balanceOf(portfolioArb.address);

    await portfolioArb.connect(trader1).depositNative(trader1.address, 0, {value: dummyQty});

    const balanceAfter = await trader1.getBalance();

    expect(balanceAfter.sub(dummyQty).lte(balBefore));
    expect(await weth.balanceOf(portfolioArb.address)).to.equal(wethBalBefore.add(dummyQty));
  });
});

describe("Portfolio Decimals", () => {
  let portfolioMain: PortfolioMain;
  let portfolioArb: PortfolioMain;
  let portfolioSub: PortfolioSub;
  let portfolioBridgeSub: PortfolioBridgeSub;
  let usdcBnb: MockToken;
  let usdcArb: MockToken;

  let trader: SignerWithAddress;
  const avaxChainId = f.getChains().cChain.chainListOrgId;
  const arbChainId = f.getChains().arbitrumChain.chainListOrgId;
  const tokenSymbol = Utils.fromUtf8("USDC");
  const subnetDecimals = 6;
  const mainnetDecimals = 18;
  const arbDecimals = 5;
  const depositAmt = "100";

  before(async () => {
    const acct = await f.getAccounts();
    trader = acct.trader1;
  });

  beforeEach(async () => {
    const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);
    portfolioMain = portfolioContracts.portfolioAvax;
    portfolioArb = portfolioContracts.portfolioArb;
    portfolioSub = portfolioContracts.portfolioSub;
    portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;

    usdcBnb = await f.deployMockToken("USDC", mainnetDecimals);
    usdcArb = await f.deployMockToken("USDC", arbDecimals);


    await portfolioMain.addToken(tokenSymbol, usdcBnb.address,  mainnetDecimals, subnetDecimals, 0, Utils.parseUnits("0.5", mainnetDecimals));
    await portfolioMain.setBridgeParam(tokenSymbol, 0, Utils.parseUnits("0.5", mainnetDecimals), false);
    await portfolioSub.addToken(tokenSymbol, usdcBnb.address, avaxChainId, mainnetDecimals, subnetDecimals, 0, Utils.parseUnits("0.5", subnetDecimals), 0, tokenSymbol);
    await usdcBnb.mint(trader.address, Utils.parseUnits("1000", mainnetDecimals));

    await portfolioArb.addToken(tokenSymbol, usdcArb.address,  arbDecimals, subnetDecimals, 0, Utils.parseUnits("0.5", arbDecimals));
    await portfolioArb.setBridgeParam(tokenSymbol, 0, Utils.parseUnits("0.5", arbDecimals), false);
    await portfolioSub.addToken(tokenSymbol, usdcArb.address, arbChainId, arbDecimals, subnetDecimals, 0, Utils.parseUnits("0.5", subnetDecimals), 0, tokenSymbol);
    await usdcArb.mint(trader.address, Utils.parseUnits("1000", arbDecimals));
  });

  it("should fail to set l1 decimals if not owner", async () => {
    await expect(portfolioMain.connect(trader).setL1Decimals(tokenSymbol, subnetDecimals)).to.be.revertedWith("AccessControl: account");
    await expect(portfolioSub.connect(trader).setL1Decimals(tokenSymbol, subnetDecimals)).to.be.revertedWith("AccessControl: account");
    const symbolId = Utils.fromUtf8("USDC" + avaxChainId.toString());
    await expect(portfolioBridgeSub.connect(trader).setL1Decimals(symbolId, subnetDecimals)).to.be.revertedWith("AccessControl: account");
  });

  it("should succeed to set l1 decimals if owner", async () => {
    await expect(portfolioMain.setL1Decimals(tokenSymbol, subnetDecimals)).to.not.be.reverted;
    await expect(portfolioSub.setL1Decimals(tokenSymbol, subnetDecimals)).to.not.be.reverted;
    const symbolId = Utils.fromUtf8("USDC" + avaxChainId.toString());
    await expect(portfolioBridgeSub.setL1Decimals(symbolId, subnetDecimals)).to.not.be.reverted;
  });

  it("should successfully deposit token with smaller subnet decimals", async () => {
    const balBefore = await usdcBnb.balanceOf(trader.address);
    await f.depositToken(portfolioMain, trader, usdcBnb, mainnetDecimals, tokenSymbol, depositAmt);

    expect(await usdcBnb.balanceOf(trader.address)).to.equal(balBefore.sub(Utils.parseUnits(depositAmt, mainnetDecimals)));
    const prtfBalance = await portfolioSub.getBalance(trader.address, tokenSymbol);
    expect(prtfBalance.available).to.equal(Utils.parseUnits(depositAmt, subnetDecimals));
  });

  it("should successfully withdraw token with smaller subnet decimals", async () => {
    const balBefore = await usdcBnb.balanceOf(trader.address);
    await f.depositToken(portfolioMain, trader, usdcBnb, mainnetDecimals, tokenSymbol, depositAmt);

    expect(await usdcBnb.balanceOf(trader.address)).to.equal(balBefore.sub(Utils.parseUnits(depositAmt, mainnetDecimals)));
    let prtfBalance = await portfolioSub.getBalance(trader.address, tokenSymbol);
    expect(prtfBalance.available).to.equal(Utils.parseUnits(depositAmt, subnetDecimals));

    await f.withdrawToken(portfolioSub, trader, tokenSymbol, subnetDecimals, depositAmt);

    prtfBalance = await portfolioSub.getBalance(trader.address, tokenSymbol);
    expect(prtfBalance.available.eq(0));
    expect(await usdcBnb.balanceOf(trader.address)).to.equal(balBefore.sub(Utils.parseUnits("0.5", mainnetDecimals)));
  });

  it("should successfully deposit token with larger subnet decimals", async () => {
    const balBefore = await usdcArb.balanceOf(trader.address);
    await f.depositToken(portfolioArb, trader, usdcArb, arbDecimals, tokenSymbol, depositAmt);

    expect(await usdcArb.balanceOf(trader.address)).to.equal(balBefore.sub(Utils.parseUnits(depositAmt, arbDecimals)));
    const prtfBalance = await portfolioSub.getBalance(trader.address, tokenSymbol);
    expect(prtfBalance.available).to.equal(Utils.parseUnits(depositAmt, subnetDecimals));
  });

  it("should successfully withdraw token with larger subnet decimals", async () => {
    const balBefore = await usdcArb.balanceOf(trader.address);
    await f.depositToken(portfolioArb, trader, usdcArb, arbDecimals, tokenSymbol, depositAmt);

    expect(await usdcArb.balanceOf(trader.address)).to.equal(balBefore.sub(Utils.parseUnits(depositAmt, arbDecimals)));
    let prtfBalance = await portfolioSub.getBalance(trader.address, tokenSymbol);
    expect(prtfBalance.available).to.equal(Utils.parseUnits(depositAmt, subnetDecimals));

    await portfolioSub.connect(trader)['withdrawToken(address,bytes32,uint256,uint8,uint32)'](trader.address, tokenSymbol, Utils.parseUnits(depositAmt, subnetDecimals), 0, arbChainId);

    prtfBalance = await portfolioSub.getBalance(trader.address, tokenSymbol);
    expect(prtfBalance.available.eq(0));
    expect(await usdcArb.balanceOf(trader.address)).to.equal(balBefore.sub(Utils.parseUnits("0.5", arbDecimals)));
  });

});
