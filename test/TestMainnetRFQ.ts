/**
 * The test runner for Dexalot Mainnet RFQ
 */

import Utils from './utils';


import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DexalotRouter, MainnetRFQ, MockToken, MockWrappedToken, PortfolioBridgeMain } from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, constants } from 'ethers';

interface Order {
  nonceAndMeta: string,
  expiry: number,
  makerAsset: string,
  takerAsset: string,
  maker: string,
  taker: string,
  makerAmount: string,
  takerAmount: string,
}

interface XChainSwap {
  from: string,
  to: string,
  makerSymbol: string,
  makerAsset: string,
  takerAsset: string,
  makerAmount: string,
  takerAmount: string,
  nonce: string,
  expiry: number,
  destChainId: number,
  bridgeProvider: number
}


describe("Mainnet RFQ Multichain", () => {
  let mainnetRFQAvax: MainnetRFQ;
  let mainnetRFQGun: MainnetRFQ;
  let mainnetRFQArb: MainnetRFQ;
  let mockUSDC: MockToken;
  let mockUSDT: MockToken;
  let portfolioBridgeAvax: PortfolioBridgeMain;
  let portfolioBridgeGun: PortfolioBridgeMain;
  let portfolioBridgeArb: PortfolioBridgeMain;

  const initialUSDCBalance: string = Utils.parseUnits("10000", 6).toString();
  const initialUSDTBalance: string = Utils.parseUnits("10000", 6).toString();
  const initialRFQGunNativeBalance: string = Utils.parseUnits("100", 18).toString();
  const swapAmountUSDC: string = Utils.parseUnits("100", 6).toString();
  const swapAmountUSDT: string = Utils.parseUnits("101", 6).toString();
  const nativeSwapAmount: string = Utils.parseUnits("10", 18).toString();

  const tokenDetails: {[key: string]: {symbol: string, symbolbytes32: string, amount: string, address: string, chainid: number, srcMainnetRfq: MainnetRFQ}} = {}

  let owner: SignerWithAddress;
  let rebalancer: SignerWithAddress;
  let signer: SignerWithAddress;
  let trader1: SignerWithAddress;
  let trader2: SignerWithAddress;

  let chainId: number;
  const gunDetails = { symbol: "GUN", symbolbytes32: Utils.fromUtf8("GUN"), decimals: 18 };
  const usdtDetails = { symbol: "USDT", symbolbytes32: Utils.fromUtf8("USDT"), decimals: 6 };
  const usdcDetails = { symbol: "USDC", symbolbytes32: Utils.fromUtf8("USDC"), decimals: 6 };
  let portfolioContracts: any

  const generateXChainOrder = async (srcSymbol: string, destSymbol: string, isTransfer?: boolean) => {
    const srcInfo = tokenDetails[srcSymbol];
    const destInfo = tokenDetails[destSymbol];
    const time = await f.getLatestBlockTimestamp();

    const taker = trader1.address;
    const num  = 100
    const destTrader = isTransfer ? trader2.address : trader1.address;
    const nonce = `0x${num.toString(16).padStart(24, '0')}`;
    const nonceAndMeta = `${taker}${nonce.slice(2)}`;

    const xChainSwap: XChainSwap = {
      from: Utils.addressToBytes32(taker),
      to: Utils.addressToBytes32(destTrader),
      makerSymbol: destInfo.symbolbytes32,
      makerAsset: Utils.addressToBytes32(destInfo.address),
      takerAsset: Utils.addressToBytes32(srcInfo.address),
      makerAmount: destInfo.amount,
      takerAmount: srcInfo.amount,
      nonce: nonce,
      expiry: time + 120,
      destChainId: destInfo.chainid,
      bridgeProvider: 0
    };

    const domain = {
      name: "Dexalot",
      version: "1",
      chainId: chainId,
      verifyingContract: srcInfo.srcMainnetRfq.address,
    };

    const types = {
      XChainSwap: [
        { name: "from", type: "bytes32", },
        { name: "to", type: "bytes32", },
        { name: "makerSymbol", type: "bytes32", },
        { name: "makerAsset", type: "bytes32", },
        { name: "takerAsset", type: "bytes32", },
        { name: "makerAmount", type: "uint256", },
        { name: "takerAmount", type: "uint256", },
        { name: "nonce", type: "uint96", },
        { name: "expiry", type: "uint32", },
        { name: "destChainId", type: "uint32", },
        { name: "bridgeProvider", type: "uint8", },
      ],
    };

    const signature = await signer._signTypedData(domain, types, xChainSwap);
    return {xChainSwap, signature, nonceAndMeta};
  }

  beforeEach(async function () {
    const accounts = await f.getAccounts();

    owner = accounts.owner;
    signer = accounts.other1;
    rebalancer = signer;
    trader1 = accounts.trader1;
    trader2 = accounts.trader2;

    const network = await ethers.provider.getNetwork()
    chainId = network.chainId;

    portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);

    // deploy upgradeable contract
    mainnetRFQAvax = portfolioContracts.mainnetRFQAvax;
    mainnetRFQGun = portfolioContracts.mainnetRFQGun;
    mainnetRFQArb = portfolioContracts.mainnetRFQArb;
    portfolioBridgeAvax = portfolioContracts.portfolioBridgeAvax;
    portfolioBridgeGun = portfolioContracts.portfolioBridgeGun;
    portfolioBridgeArb = portfolioContracts.portfolioBridgeArb;

    const { cChain, gunzillaSubnet, arbitrumChain } = f.getChains();

    // deploy mock tokens
    mockUSDC = await f.deployMockToken("USDC", 6);
    mockUSDT = await f.deployMockToken("USDT", 6);

    //Enable GUN for CCTRADE at Cchain for destination gun
    await portfolioBridgeAvax.enableXChainSwapDestination(gunDetails.symbolbytes32, gunzillaSubnet.chainListOrgId, constants.HashZero);
    await portfolioBridgeAvax.enableSupportedNative(gunzillaSubnet.chainListOrgId, gunDetails.symbolbytes32);
    //Enable USDC for CCTRADE at gunzilla for destination avax
    await portfolioBridgeGun.enableXChainSwapDestination(usdcDetails.symbolbytes32, cChain.chainListOrgId, Utils.addressToBytes32(mockUSDC.address));
    //Enable AVAX for CCTRADE at Gunzilla for destination avax
    await portfolioBridgeGun.enableXChainSwapDestination(Utils.fromUtf8("AVAX"), cChain.chainListOrgId, constants.HashZero);
    await portfolioBridgeGun.enableSupportedNative(cChain.chainListOrgId, Utils.fromUtf8("AVAX"));

    await f.addToken(portfolioContracts.portfolioAvax, portfolioContracts.portfolioSub, mockUSDC, 0.5, 0, true, 0); //gasSwapRatio 10

    // mint tokens
    await mockUSDC.mint(mainnetRFQAvax.address, initialUSDCBalance);
    await mockUSDC.mint(mainnetRFQArb.address, initialUSDCBalance);
    await rebalancer.sendTransaction({
      to: mainnetRFQGun.address,
      value: ethers.utils.parseEther("100.0"),
    });


    // mint to trader
    await mockUSDC.mint(trader1.address, initialUSDCBalance);

    // approve tokens
    await mockUSDC.connect(trader1).approve(mainnetRFQAvax.address, ethers.constants.MaxUint256);
    await mockUSDC.connect(trader1).approve(mainnetRFQArb.address, ethers.constants.MaxUint256);

    // swapAmounts[mockUSDC.address] = swapAmountUSDC;

    // USDT is the target in Arb for USDC traded from Avax
    tokenDetails["USDT"] = {symbol: "USDT", symbolbytes32: Utils.fromUtf8("USDT"), amount: swapAmountUSDT,  address: mockUSDT.address, srcMainnetRfq: mainnetRFQArb, chainid: arbitrumChain.chainListOrgId};
    //USDC is the origin for GUN in gunzilla or USDT in arb
    tokenDetails["USDC"] = {symbol: "USDC", symbolbytes32: Utils.fromUtf8("USDC"), amount: swapAmountUSDC,  address: mockUSDC.address, srcMainnetRfq: mainnetRFQAvax, chainid: cChain.chainListOrgId};
    tokenDetails["GUN"] = {symbol: "GUN", symbolbytes32: Utils.fromUtf8("GUN"), amount: nativeSwapAmount,  address: ethers.constants.AddressZero, srcMainnetRfq: mainnetRFQGun, chainid: gunzillaSubnet.chainListOrgId};
    tokenDetails["AVAX"] = {symbol: "AVAX", symbolbytes32: Utils.fromUtf8("AVAX"), amount: nativeSwapAmount, address: ethers.constants.AddressZero, srcMainnetRfq: mainnetRFQAvax, chainid: cChain.chainListOrgId};
    //swapDetails["ETH"] = {symbol: "ETH", symbolbytes32: Utils.fromUtf8("ETH"), decimals: 18};
  });

  it("Should set portfolio bridge address correctly", async () => {
    await expect(mainnetRFQAvax.connect(trader1).setPortfolioBridge(portfolioBridgeAvax.address)).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);

    await expect(mainnetRFQAvax.connect(owner).setPortfolioBridge(portfolioBridgeAvax.address)).to.emit(mainnetRFQAvax, "AddressSet").withArgs("MAINNETRFQ", "SET-PORTFOLIOBRIDGE", portfolioBridgeAvax.address);

    await expect(mainnetRFQAvax.connect(owner).setPortfolioBridge(portfolioBridgeAvax.address)).to.emit(mainnetRFQAvax, "AddressSet").withArgs("MAINNETRFQ", "SET-PORTFOLIOBRIDGE", portfolioBridgeAvax.address);
  })

  it("Should set portfolio main address correctly", async () => {
    await expect(mainnetRFQAvax.connect(trader1).setPortfolioMain()).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    const portfolioBridgeMain = await portfolioBridgeAvax.getPortfolio();
    await expect(mainnetRFQAvax.connect(owner).setPortfolioMain()).to.emit(mainnetRFQAvax, "AddressSet").withArgs("MAINNETRFQ", "SET-PORTFOLIOMAIN", portfolioBridgeMain);
  })

  it("Should not accept via fallback()", async function () {
      const ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
      const iface = new ethers.utils.Interface(ABI)
      const calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader2.address, Utils.toWei('100')])
      await expect(owner.sendTransaction({to: mainnetRFQAvax.address, data: calldata}))
          .to.be.revertedWith("RF-NFUN-01")
  })

  it("Should be able to pause/unpause", async () => {
    expect(await mainnetRFQAvax.paused()).to.equal(false);

    // fail for non-owner
    await expect(mainnetRFQAvax.connect(trader1).pause()).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);

    await mainnetRFQAvax.connect(owner).pause();

    expect(await mainnetRFQAvax.paused()).to.equal(true);

    await expect(mainnetRFQAvax.connect(owner).pause()).to.be.revertedWith("Pausable: paused");

    // fail for non-owner
    await expect(mainnetRFQAvax.connect(trader1).unpause()).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);


    const {xChainSwap, signature} = await generateXChainOrder("USDC", "GUN");

    await expect(
      mainnetRFQAvax.connect(trader1).xChainSwap(xChainSwap, signature)
    ).to.be.revertedWith("Pausable: paused");

    await mainnetRFQAvax.connect(owner).unpause();

    await expect(mainnetRFQAvax.connect(owner).unpause()).to.be.revertedWith("Pausable: not paused");

    expect(await mainnetRFQAvax.paused()).to.equal(false);
  });

  it("Should XChain trade two tokens ERC20 -> ERC20 no user gas fee (sell USDC in avax and buy USDT in arb", async () => {
    const { cChain, arbitrumChain } = f.getChains();

    // mint to trader
    await mockUSDT.mint(trader1.address, initialUSDTBalance);
    await mockUSDT.mint(mainnetRFQArb.address, initialUSDTBalance);
    // approve tokens
    await mockUSDT.connect(trader1).approve(mainnetRFQArb.address, ethers.constants.MaxUint256);

    //*********Enable Cross Chain Trade between USDC(sell in avax) and USDT(buy in arb) **********/
    //Enable USDT for CCTRADE at Cchain for destination arb
    await portfolioBridgeAvax.enableXChainSwapDestination(usdtDetails.symbolbytes32, arbitrumChain.chainListOrgId, Utils.addressToBytes32(mockUSDT.address));
    //Enable USDC for CCTRADE at arb for destination avax
    await portfolioBridgeArb.enableXChainSwapDestination(usdcDetails.symbolbytes32, cChain.chainListOrgId, Utils.addressToBytes32(mockUSDC.address));

    expect(await portfolioBridgeAvax.xChainAllowedDestinations(usdtDetails.symbolbytes32, arbitrumChain.chainListOrgId)).to.be.equal(Utils.addressToBytes32(mockUSDT.address));
    expect(await portfolioBridgeAvax.xChainAllowedDestinations(gunDetails.symbolbytes32, arbitrumChain.chainListOrgId)).to.be.equal(constants.HashZero);
    expect(await portfolioBridgeArb.xChainAllowedDestinations(usdcDetails.symbolbytes32, cChain.chainListOrgId)).to.be.equal(Utils.addressToBytes32(mockUSDC.address));

    const {xChainSwap, signature, nonceAndMeta} = await generateXChainOrder("USDC", "USDT");
    // Fail if token dosn't exist in the portfolio at the target chain
    // await expect(mainnetRFQAvax.connect(trader1).xChainSwap(
    //   xChainSwap,
    //   signature,
    // )).to.be.revertedWith("PB-ETNS-02");

    // USDT should be in the target network
    await f.addToken(portfolioContracts.portfolioArb, portfolioContracts.portfolioSub, mockUSDT, 0.5, 0, true, 0); //gasSwapRatio 10

    await expect(
        mainnetRFQAvax.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
        )
    ).to.emit(mainnetRFQAvax, "SwapExecuted")
      .withArgs(
        nonceAndMeta,
        trader1.address,
        Utils.addressToBytes32(trader1.address),
        xChainSwap.destChainId,
        mockUSDC.address,
        Utils.addressToBytes32(mockUSDT.address),
        swapAmountUSDC,
        swapAmountUSDT,
      );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockUSDT.balanceOf(mainnetRFQArb.address)).to.equal(
      ethers.BigNumber.from(initialUSDTBalance).sub(swapAmountUSDT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQAvax.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );
  });


  it("Should trade two tokens ERC20 -> Native no user gas fee", async () => {
    const {xChainSwap, signature, nonceAndMeta} = await generateXChainOrder("USDC", "GUN");

    await expect(
        mainnetRFQAvax.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
        )
    ).to.emit(mainnetRFQAvax, "SwapExecuted")
      .withArgs(
        nonceAndMeta,
        trader1.address,
        Utils.addressToBytes32(trader1.address),
        xChainSwap.destChainId,
        mockUSDC.address,
        ethers.constants.HashZero,
        swapAmountUSDC,
        nativeSwapAmount,
      );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await ethers.provider.getBalance(mainnetRFQGun.address)).to.equal(
      ethers.BigNumber.from(initialRFQGunNativeBalance).sub(nativeSwapAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQAvax.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );
  });

  it("Should trade two tokens Native -> Native no user gas fee", async () => {
    const {xChainSwap, signature, nonceAndMeta} = await generateXChainOrder("AVAX", "GUN");

    await expect(
        mainnetRFQAvax.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
          {value: xChainSwap.takerAmount},
      )
    ).to.emit(mainnetRFQAvax, "SwapExecuted")
    .withArgs(
      nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      xChainSwap.destChainId,
      ethers.constants.AddressZero,
      ethers.constants.HashZero,
      nativeSwapAmount,
      nativeSwapAmount,
    );

    expect(await ethers.provider.getBalance(mainnetRFQAvax.address)).to.equal(nativeSwapAmount);


    expect(await ethers.provider.getBalance(mainnetRFQGun.address)).to.equal(
      ethers.BigNumber.from(initialRFQGunNativeBalance).sub(nativeSwapAmount)
    );
  });

  it("Should trade two tokens Native -> ERC20 w/ user gas fee", async () => {
    const {xChainSwap, signature, nonceAndMeta} = await generateXChainOrder("GUN", "USDC");

    const value = await portfolioBridgeGun.connect(trader1).getBridgeFee(0, xChainSwap.destChainId, ethers.constants.HashZero, 0, trader1.address, Utils.emptyOptions());

    await expect(
        mainnetRFQGun.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
          {value: value.add(xChainSwap.takerAmount)},
      )
    ).to.emit(mainnetRFQGun, "SwapExecuted")
    .withArgs(
      nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      xChainSwap.destChainId,
      ethers.constants.AddressZero,
      Utils.addressToBytes32(mockUSDC.address),
      nativeSwapAmount,
      swapAmountUSDC,
    );

    expect(await ethers.provider.getBalance(mainnetRFQGun.address)).to.equal(
      ethers.BigNumber.from(initialRFQGunNativeBalance).add(nativeSwapAmount)
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );

    expect(await mockUSDC.balanceOf(mainnetRFQAvax.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );
  });

  it("Should fail to trade two tokens Native -> ERC20 if user gas fee expected but not provided", async () => {
    const {xChainSwap, signature} = await generateXChainOrder("GUN", "USDC");

    await expect(
        mainnetRFQGun.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
          {value: xChainSwap.takerAmount},
      )
    ).to.be.revertedWith("PB-IUMF-01");
  });

  it("Should trade two tokens Native -> Native w/ user gas fee", async () => {
    const {xChainSwap, signature, nonceAndMeta} = await generateXChainOrder("GUN", "AVAX");

    await rebalancer.sendTransaction({
      to: mainnetRFQAvax.address,
      value: ethers.utils.parseEther("100.0"),
    });

    const value = await portfolioBridgeGun.connect(trader1).getBridgeFee(0, xChainSwap.destChainId, ethers.constants.HashZero, 0, trader1.address, Utils.emptyOptions());

    await expect(
      mainnetRFQGun.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
          {value: value.add(xChainSwap.takerAmount)},
      )
    ).to.emit(mainnetRFQGun, "SwapExecuted")
    .withArgs(
      nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      xChainSwap.destChainId,
      ethers.constants.AddressZero,
      ethers.constants.HashZero,
      nativeSwapAmount,
      nativeSwapAmount,
    );

    expect(await ethers.provider.getBalance(mainnetRFQGun.address)).to.equal(
      ethers.BigNumber.from(initialRFQGunNativeBalance).add(nativeSwapAmount)
    );

    expect(await ethers.provider.getBalance(mainnetRFQAvax.address)).to.equal(
      ethers.BigNumber.from(initialRFQGunNativeBalance).sub(nativeSwapAmount)
    );
  });

  it("Should fail to trade if swap struct and signature don't match", async () => {
    const {xChainSwap, signature} = await generateXChainOrder("GUN", "USDC");
    xChainSwap.makerAmount = Utils.parseUnits("1000000", 6).toString();

    await expect(
        mainnetRFQGun.connect(trader1).xChainSwap(
          xChainSwap,
          signature
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should trade and transfer two tokens ERC20 -> Native no user gas fee", async () => {
    const {xChainSwap, signature, nonceAndMeta} = await generateXChainOrder("USDC", "GUN", true);

    const trader2InitialBalance = await ethers.provider.getBalance(trader2.address);

    await expect(
        mainnetRFQAvax.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
        )
    ).to.emit(mainnetRFQAvax, "SwapExecuted")
      .withArgs(
        nonceAndMeta,
        trader1.address,
        Utils.addressToBytes32(trader2.address),
        xChainSwap.destChainId,
        mockUSDC.address,
        ethers.constants.HashZero,
        swapAmountUSDC,
        nativeSwapAmount,
      );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await ethers.provider.getBalance(mainnetRFQGun.address)).to.equal(
      ethers.BigNumber.from(initialRFQGunNativeBalance).sub(nativeSwapAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQAvax.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );

    expect(await ethers.provider.getBalance(trader2.address)).to.equal(
      ethers.BigNumber.from(trader2InitialBalance).add(nativeSwapAmount)
    );
  });

  it("Should trade and transfer two tokens Native -> Native no user gas fee", async () => {
    const {xChainSwap, signature, nonceAndMeta} = await generateXChainOrder("AVAX", "GUN", true);

    const trader2InitialBalance = await ethers.provider.getBalance(trader2.address);

    await expect(
        mainnetRFQAvax.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
          {value: xChainSwap.takerAmount},
      )
    ).to.emit(mainnetRFQAvax, "SwapExecuted")
    .withArgs(
      nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader2.address),
      xChainSwap.destChainId,
      ethers.constants.AddressZero,
      ethers.constants.HashZero,
      nativeSwapAmount,
      nativeSwapAmount,
    );

    expect(await ethers.provider.getBalance(mainnetRFQAvax.address)).to.equal(nativeSwapAmount);


    expect(await ethers.provider.getBalance(mainnetRFQGun.address)).to.equal(
      ethers.BigNumber.from(initialRFQGunNativeBalance).sub(nativeSwapAmount)
    );

    expect(await ethers.provider.getBalance(trader2.address)).to.equal(
      ethers.BigNumber.from(trader2InitialBalance).add(nativeSwapAmount)
    );
  });

  it("Should trade and transfer two tokens Native -> ERC20 w/ user gas fee", async () => {
    const {xChainSwap, signature, nonceAndMeta} = await generateXChainOrder("GUN", "USDC", true);

    const value = await portfolioBridgeGun.connect(trader1).getBridgeFee(0, xChainSwap.destChainId, ethers.constants.HashZero, 0, trader1.address, Utils.emptyOptions());

    await expect(
        mainnetRFQGun.connect(trader1).xChainSwap(
          xChainSwap,
          signature,
          {value: value.add(xChainSwap.takerAmount)},
      )
    ).to.emit(mainnetRFQGun, "SwapExecuted")
    .withArgs(
      nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader2.address),
      xChainSwap.destChainId,
      ethers.constants.AddressZero,
      Utils.addressToBytes32(mockUSDC.address),
      nativeSwapAmount,
      swapAmountUSDC,
    );

    expect(await ethers.provider.getBalance(mainnetRFQGun.address)).to.equal(
      ethers.BigNumber.from(initialRFQGunNativeBalance).add(nativeSwapAmount)
    );

    expect(await mockUSDC.balanceOf(trader2.address)).to.equal(swapAmountUSDC);

    expect(await mockUSDC.balanceOf(mainnetRFQAvax.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );
  });

  it("Should fail if processXFerPayload() has incorrect inputs", async () => {
    const { owner, trader2 } = await f.getAccounts();

    // make owner part of PORTFOLIO_BRIDGE_ROLE on PortfolioMain
    await mainnetRFQAvax.grantRole(await mainnetRFQAvax.PORTFOLIO_BRIDGE_ROLE(), owner.address)

    let xfer: any = {};
    // processing of deposit messages will fail on mainnet
    const transaction = 1;  // DEPOSIT
    const nonce = 0;
    const trader = Utils.addressToBytes32(trader2.address);
    const symbol = Utils.fromUtf8("AVAX")
    const quantity =  Utils.toWei("0.01")
    const timestamp = BigNumber.from(await f.latestTime());
    const customdata = Utils.emptyCustomData();

    xfer = {
      nonce,
      transaction,
      trader,
      symbol,
      quantity,
      timestamp,
      customdata
    }


    // fail for non-admin
    await expect(mainnetRFQAvax.connect(trader1).processXFerPayload(xfer))
        .to.be.revertedWith("AccessControl");
    // succeed for admin but Tx not supported
    await expect(mainnetRFQAvax.processXFerPayload(xfer))
      .to.be.revertedWith("RF-PTNS-01");

    xfer.transaction = 11;   // CCTRADE
    xfer.trader = Utils.addressToBytes32(owner.address);
    xfer.quantity = 0;
    // fail with 0 quantity
    await expect(mainnetRFQAvax.processXFerPayload(xfer)).to.be.revertedWith("RF-ZETD-01");
    xfer.trader = ethers.constants.HashZero;
    // fail for trader witrh zero address(0)
    await expect(mainnetRFQAvax.processXFerPayload(xfer)).to.be.revertedWith("RF-ZADDR-01");
    xfer.trader = Utils.addressToBytes32(owner.address);
    xfer.quantity = Utils.toWei("0.01");
    xfer.symbol = Utils.fromUtf8("USDt");
    // fail due to token not in portfolioBridge
    await expect(mainnetRFQAvax.processXFerPayload(xfer)).to.be.revertedWith("RF-DTNF-01");
  });

  it("Should fail on reentrancy for processXFerPayload()", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQGun.address, mainnetRFQGun.address);
    await mainnetRFQAttacker.deployed();

    await mainnetRFQGun.grantRole(await mainnetRFQGun.PORTFOLIO_BRIDGE_ROLE(), mainnetRFQAttacker.address);

    const tx = 11;
    const customdata = ethers.utils.hexZeroPad("0xff", 18);
    const amount = Utils.toWei("1");
    await mainnetRFQAttacker.attackProcessXFerPayload(Utils.addressToBytes32(mainnetRFQAttacker.address), Utils.fromUtf8("GUN"), amount, tx, customdata)
    expect(await ethers.provider.getBalance(mainnetRFQGun.address)).to.equal(ethers.utils.parseEther("100.0"));
    expect(await ethers.provider.getBalance(mainnetRFQAttacker.address)).to.equal(ethers.utils.parseEther("0"));
  });

  it("Should add/remove from swap queue if native inventory missing in MainnetRFQ contract", async () => {
    await mainnetRFQAvax.grantRole(await mainnetRFQAvax.PORTFOLIO_BRIDGE_ROLE(), owner.address)


    let xfer: any = {};
    const transaction = 11;
    const nonce = 0;
    const trader = Utils.addressToBytes32(trader1.address);
    const symbol = Utils.fromUtf8("AVAX")
    const quantity =  Utils.toWei("1")
    const timestamp = BigNumber.from(await f.latestTime());
    const customdata = ethers.utils.hexZeroPad("0xff", 18);
    const nonceAndMeta = `${trader1.address}${ethers.utils.hexZeroPad("0xff", 12).slice(2)}`;

    xfer = {
      nonce,
      transaction,
      trader,
      symbol,
      quantity,
      timestamp,
      customdata
    }

    await expect(mainnetRFQAvax.processXFerPayload(xfer))
        .to.emit(mainnetRFQAvax, "SwapQueue");


    await expect(mainnetRFQAvax.removeFromSwapQueue(nonceAndMeta)).to.be.revertedWith("RF-INVT-01");

    await rebalancer.sendTransaction({
      to: mainnetRFQAvax.address,
      value: ethers.utils.parseEther("10.0"),
    });

    await expect(mainnetRFQAvax.removeFromSwapQueue(nonceAndMeta)).to.emit(mainnetRFQAvax, "SwapQueue");
  });

  it("Should add/remove from swap queue if ERC20 inventory missing in MainnetRFQ contract", async () => {
    await mainnetRFQAvax.grantRole(await mainnetRFQAvax.PORTFOLIO_BRIDGE_ROLE(), owner.address);
    await mainnetRFQAvax.connect(rebalancer).claimBalance(mockUSDC.address, initialUSDCBalance);

    let xfer: any = {};

    const transaction = 11;
    const customdata = ethers.utils.hexZeroPad("0xff", 18);
    const nonce = 1112
    const quantity = ethers.utils.parseUnits("1", 6)
    const trader = Utils.addressToBytes32(trader1.address);
    const symbol =  Utils.fromUtf8("USDC")
    const timestamp = BigNumber.from(await f.latestTime());
    const nonceAndMeta = `${trader1.address}${ethers.utils.hexZeroPad("0xff", 12).slice(2)}`
    xfer = {nonce,
      transaction,
      trader,
      symbol,
      quantity,
      timestamp,
      customdata
    };


    await expect(mainnetRFQAvax.processXFerPayload(xfer))
        .to.emit(mainnetRFQAvax, "SwapQueue");

    await expect(mainnetRFQAvax.removeFromSwapQueue(nonceAndMeta)).to.be.revertedWith("RF-INVT-01");

    await mockUSDC.connect(rebalancer).transfer(mainnetRFQAvax.address, initialUSDCBalance);

    await expect(mainnetRFQAvax.removeFromSwapQueue(nonceAndMeta)).to.emit(mainnetRFQAvax, "SwapQueue");
  });

  it("Should fail on reentrancy for removeFromSwapQueue()", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQAvax.address, mainnetRFQAvax.address);
    await mainnetRFQAttacker.deployed();

    await mainnetRFQAvax.grantRole(await mainnetRFQAvax.PORTFOLIO_BRIDGE_ROLE(), owner.address)


    let xfer: any = {};

    const transaction = 11;
    const customdata = ethers.utils.hexZeroPad("0xff", 18);
    const nonce = 1112;
    const quantity =  Utils.toWei("1")
    const trader = Utils.addressToBytes32(mainnetRFQAttacker.address);
    const symbol =  Utils.fromUtf8("AVAX")
    const timestamp = BigNumber.from(await f.latestTime());
    const nonceAndMeta = `${mainnetRFQAttacker.address}${ethers.utils.hexZeroPad("0xff", 12).slice(2)}`;

    xfer = {nonce,
      transaction,
      trader,
      symbol,
      quantity,
      timestamp,
      customdata
    };

    await expect(mainnetRFQAvax.processXFerPayload(xfer))
        .to.emit(mainnetRFQAvax, "SwapQueue");


    await expect(mainnetRFQAvax.removeFromSwapQueue(nonceAndMeta)).to.be.revertedWith("RF-INVT-01");

    await rebalancer.sendTransaction({
      to: mainnetRFQAvax.address,
      value: ethers.utils.parseEther("100.0"),
    });

    await expect(mainnetRFQAttacker.attackRemoveFromSwapQueue(nonceAndMeta)).to.be.revertedWith("RF-INVT-01");
    expect(await ethers.provider.getBalance(mainnetRFQAvax.address)).to.equal(ethers.utils.parseEther("100"));
    expect(await ethers.provider.getBalance(mainnetRFQAttacker.address)).to.equal(ethers.utils.parseEther("0"));
  });

  it("Should fail to process swaps with same nonce", async () => {
    await mainnetRFQGun.grantRole(await mainnetRFQGun.PORTFOLIO_BRIDGE_ROLE(), owner.address)

    let xfer: any = {};
    const transaction = 11;
    const nonce = 1112;
    const trader = Utils.addressToBytes32(trader1.address);
    const symbol = Utils.fromUtf8("GUN")
    const quantity =  Utils.toWei("1")
    const timestamp = BigNumber.from(await f.latestTime());
    const customdata = ethers.utils.hexZeroPad("0xff", 18);

    xfer = {
      nonce,
      transaction,
      trader,
      symbol,
      quantity,
      timestamp,
      customdata
    }

    await expect(mainnetRFQGun.processXFerPayload(xfer)).to.not.be.reverted;
    await expect(mainnetRFQGun.processXFerPayload(xfer)).to.be.revertedWith("RF-IN-02");
  });
});

describe("Mainnet RFQ", () => {
  let mainnetRFQ: MainnetRFQ;
  let mockUSDC: MockToken;
  let mockALOT: MockToken;
  let mockWrapped: MockWrappedToken

  const initialUSDCBalance: string = Utils.parseUnits("10000", 6).toString()
  const initialALOTBalance: string = Utils.parseUnits("10000", 18).toString()
  const initialAVAXBalance: string = Utils.parseUnits("100", 18).toString()

  const swapAmountUSDC: string = Utils.parseUnits("100", 6).toString()
  const swapAmountALOT: string = Utils.parseUnits("100", 18).toString()
  const swapAmountAVAX: string = Utils.parseUnits("10", 18).toString()

  const swapAmounts: {[key: string]: string} = {}

  let owner: SignerWithAddress;
  let rebalancer: SignerWithAddress;
  let signer: SignerWithAddress;
  let aggregator: SignerWithAddress;
  let trader1: SignerWithAddress;
  let volatiltyAdmin: SignerWithAddress;

  let chainId: number;

  const getOrder = async (makerAsset: string, takerAsset: string, isAggregator?: boolean, isTransfer?: boolean): Promise<Order> => {
    const time = await f.getLatestBlockTimestamp();

    const taker = trader1.address;
    const num  = 100
    const destTrader = isTransfer ? owner.address : trader1.address;
    let nonceAndMeta = `${destTrader}${num.toString(16).padStart(24, '0')}`;
    if (isAggregator) {
      nonceAndMeta = `${aggregator.address}${num.toString(16).padStart(24, '0')}`;
    }

    return {
      nonceAndMeta: nonceAndMeta,
      expiry: time + 120,
      makerAsset,
      takerAsset,
      maker: mainnetRFQ.address,
      taker: taker,
      makerAmount: swapAmounts[makerAsset],
      takerAmount: swapAmounts[takerAsset],
    };
  }

  async function toSignature(order: Order, txSigner: SignerWithAddress) {
    const domain = {
      name: "Dexalot",
      version: "1",
      chainId: chainId,
      verifyingContract: mainnetRFQ.address,
    };

    const types = {
      Order: [
        { name: "nonceAndMeta", type: "uint256", },
        { name: "expiry", type: "uint128", },
        { name: "makerAsset", type: "address", },
        { name: "takerAsset", type: "address", },
        { name: "maker", type: "address", },
        { name: "taker", type: "address", },
        { name: "makerAmount", type: "uint256", },
        { name: "takerAmount", type: "uint256", },
      ],
    };

    const signature = await txSigner._signTypedData(domain, types, order);
    return signature;
  }


  beforeEach(async function () {
    const accounts = await f.getAccounts();

    owner = accounts.owner;
    signer = accounts.other1;
    rebalancer = signer;
    trader1 = accounts.trader1;
    aggregator = accounts.trader2;
    volatiltyAdmin = accounts.other2;

    const network = await ethers.provider.getNetwork()
    chainId = network.chainId;

    const portfolioContracts = await f.deployCompletePortfolio(true);

    // deploy upgradeable contract
    mainnetRFQ = portfolioContracts.mainnetRFQ;

    // deploy mock tokens
    mockUSDC = await f.deployMockToken("USDC", 6);
    mockALOT = portfolioContracts.alot;
    mockWrapped = await f.deployMockWrappedToken("WrappedAVAX", 18);

    // mint tokens
    await mockUSDC.mint(mainnetRFQ.address, initialUSDCBalance);
    await mockALOT.mint(mainnetRFQ.address, initialALOTBalance);
    await rebalancer.sendTransaction({
      to: mainnetRFQ.address,
      value: ethers.utils.parseEther("100.0"),
    });


    // mint to trader
    await mockUSDC.mint(trader1.address, initialUSDCBalance);
    await mockALOT.mint(trader1.address, initialALOTBalance);

    // mint to aggregator
    await mockUSDC.mint(aggregator.address, initialUSDCBalance);
    await mockALOT.mint(aggregator.address, initialALOTBalance);

    // approve tokens
    await mockUSDC.connect(trader1).approve(mainnetRFQ.address, ethers.constants.MaxUint256);
    await mockALOT.connect(trader1).approve(mainnetRFQ.address, ethers.constants.MaxUint256);
    await mockUSDC.connect(aggregator).approve(mainnetRFQ.address, ethers.constants.MaxUint256);
    await mockALOT.connect(aggregator).approve(mainnetRFQ.address, ethers.constants.MaxUint256);

    swapAmounts[mockUSDC.address] = swapAmountUSDC;
    swapAmounts[mockALOT.address] = swapAmountALOT;
    swapAmounts[ethers.constants.AddressZero] = swapAmountAVAX;
    swapAmounts[mockWrapped.address] = swapAmountAVAX;
  });

  it("Should not deploy with 0 address", async function () {
    const MainnetRFQ = await ethers.getContractFactory("MainnetRFQ");
    await expect(upgrades.deployProxy(MainnetRFQ, [
      ethers.constants.AddressZero
    ])).to.be.revertedWith("RF-SAZ-01");
  });

  it("Should not initialize again after deployment", async function () {
    await expect(mainnetRFQ.initialize(
        "0x0000000000000000000000000000000000000000"
    ))
    .to.be.revertedWith("Initializable: contract is already initialized");
  });


  it("Should deploy correctly", async () => {
    expect(await mainnetRFQ.callStatic.swapSigner()).to.equal(signer.address);
    expect(await mainnetRFQ.isAdmin(owner.address)).to.equal(true);
    expect(await mainnetRFQ.isAdmin(trader1.address)).to.equal(false);
  });

  it("Should be able to pause/unpause", async () => {
    expect(await mainnetRFQ.paused()).to.equal(false);

    // fail for non-owner
    await expect(mainnetRFQ.connect(trader1).pause()).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);

    await mainnetRFQ.connect(owner).pause();

    expect(await mainnetRFQ.paused()).to.equal(true);

    await expect(mainnetRFQ.connect(owner).pause()).to.be.revertedWith("Pausable: paused");

    // fail for non-owner
    await expect(mainnetRFQ.connect(trader1).unpause()).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);

    await mainnetRFQ.connect(owner).unpause();

    await expect(mainnetRFQ.connect(owner).unpause()).to.be.revertedWith("Pausable: not paused");

    expect(await mainnetRFQ.paused()).to.equal(false);
  });

  it("Should be able to set everything correctly", async () => {
    const dummyAddress = aggregator.address;
    // fail for non-owner
    await expect(mainnetRFQ.connect(signer).setSwapSigner(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).addAdmin(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).removeAdmin(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).addRebalancer(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).removeRebalancer(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).addVolatilityAdmin(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).removeVolatilityAdmin(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).setSlippagePoints([], [])).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x`);
    await expect(mainnetRFQ.connect(owner).removeAdmin(dummyAddress)).to.be.revertedWith("RF-ALOA-01");
    await expect(mainnetRFQ.connect(owner).removeVolatilityAdmin(dummyAddress)).to.be.revertedWith("RF-ALOA-01");
    await expect(mainnetRFQ.connect(signer).setWrapped(dummyAddress, false)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x`);


    await mainnetRFQ.connect(owner).setSwapSigner(dummyAddress);
    await mainnetRFQ.connect(owner).addAdmin(dummyAddress);
    await mainnetRFQ.connect(owner).removeAdmin(dummyAddress);
    expect(await mainnetRFQ.slippageTolerance()).to.be.equal(9800);

    await mainnetRFQ.connect(owner).addRebalancer(signer.address);
    await expect(mainnetRFQ.connect(owner).removeRebalancer(signer.address)).to.be.revertedWith("RF-ALOA-01");
    await mainnetRFQ.connect(owner).addRebalancer(dummyAddress);
    expect(await mainnetRFQ.connect(owner).isRebalancer(signer.address)).to.equal(true);
    await mainnetRFQ.connect(owner).removeRebalancer(signer.address);
    expect(await mainnetRFQ.connect(owner).isRebalancer(signer.address)).to.equal(false);

    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    await expect(mainnetRFQ.connect(owner).removeVolatilityAdmin(volatiltyAdmin.address)).to.be.revertedWith("RF-ALOA-01");
    await mainnetRFQ.connect(owner).addVolatilityAdmin(dummyAddress);
    await mainnetRFQ.connect(owner).removeVolatilityAdmin(volatiltyAdmin.address);

    // should not set to 0x0
    await expect(mainnetRFQ.connect(owner).setSwapSigner(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
    await expect(mainnetRFQ.connect(owner).addAdmin(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
    await expect(mainnetRFQ.connect(owner).addRebalancer(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
    await expect(mainnetRFQ.connect(owner).addVolatilityAdmin(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
  });

  it("Should trade two tokens", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should trade AVAX as maker asset", async () => {
    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address);

    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).add(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should trade AVAX as taker", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: swapAmountAVAX},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should refund AVAX surplus", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: Utils.parseUnits("11", 18).toString()},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should not trade with expired order", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const time = await f.getLatestBlockTimestamp();
    order.expiry = time - 120;

    const signature = await toSignature(order, signer);

    await expect(mainnetRFQ.connect(trader1).simpleSwap(order, signature, {value: swapAmountAVAX},)).to.be.revertedWith("RF-QE-02");

  });

  it("Should not trade with invalid nonce", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    // uses same nonce
    await expect(
      mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("RF-IN-01");
  });

  it("Should not trade with invalid signature", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, trader1);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should not trade with undervalued transaction", async () => {
    // when taker is avax
    let order = await getOrder(mockALOT.address, ethers.constants.AddressZero);

    let signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
          {value: ethers.BigNumber.from(swapAmountAVAX).sub(1)},
      )
    ).to.be.revertedWith("RF-IMV-01");


    await mockALOT.connect(trader1).approve(mainnetRFQ.address, 0);

    // when maker is avax
    order = await getOrder(ethers.constants.AddressZero, mockALOT.address);

    signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");

    // when maker & taker erc20
    await mockUSDC.connect(trader1).approve(mainnetRFQ.address, 0);

    order = await getOrder(mockALOT.address, mockUSDC.address);

    signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("Should not trade if msg.sender != _order.taker", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    order.taker = signer.address;
    const nonce = 100
    order.nonceAndMeta = `${signer.address}${nonce.toString(16).padStart(24, '0')}`;

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
          {value: swapAmountAVAX},
      )
    ).to.be.revertedWith("RF-IMS-01");

  });

  it("Only admin or wrapped token can send AVAX.", async () => {
    await expect(
      owner.sendTransaction({
        to: mainnetRFQ.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.revertedWith("RF-RAOW-01");

    rebalancer.sendTransaction({
      to: mainnetRFQ.address,
      value: ethers.utils.parseEther("1"),
    })

  });

  it("Rebalancer can claimBalance", async () => {
    const usdcBalanceRFQ = await mockUSDC.balanceOf(mainnetRFQ.address);
    const usdcBalanceReb = await mockUSDC.balanceOf(rebalancer.address);

    await expect(
      mainnetRFQ.connect(rebalancer).claimBalance(mockUSDC.address, usdcBalanceRFQ)
    ).to.emit(mainnetRFQ, "RebalancerWithdraw")
    .withArgs(
      mockUSDC.address,
      usdcBalanceRFQ,
    );

    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(0);
    expect(await mockUSDC.balanceOf(rebalancer.address)).to.equal(usdcBalanceReb.add(usdcBalanceRFQ));


    const avaxBalanceRFQ = await ethers.provider.getBalance(mainnetRFQ.address);
    const avaxBalanceReb = await ethers.provider.getBalance(rebalancer.address);


    const tx = await mainnetRFQ.connect(rebalancer).claimBalance(ethers.constants.AddressZero, avaxBalanceRFQ)
    const receipt = await tx.wait()
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(0);
    expect(await ethers.provider.getBalance(rebalancer.address)).to.equal(avaxBalanceReb.add(avaxBalanceRFQ).sub(gasSpent));
  });


  it("Rebalancer can batchClaimBalance", async () => {
    const usdcBalanceRFQ = await mockUSDC.balanceOf(mainnetRFQ.address);
    const usdcBalanceReb = await mockUSDC.balanceOf(rebalancer.address);
    const alotBalanceRFQ = await mockALOT.balanceOf(mainnetRFQ.address);
    const alotBalanceReb = await mockALOT.balanceOf(rebalancer.address);
    const avaxBalanceRFQ = await ethers.provider.getBalance(mainnetRFQ.address);
    const avaxBalanceReb = await ethers.provider.getBalance(rebalancer.address);



    const tx = await mainnetRFQ.connect(rebalancer).batchClaimBalance([mockALOT.address, ethers.constants.AddressZero, mockUSDC.address], [ alotBalanceRFQ, avaxBalanceRFQ, usdcBalanceRFQ]);
    const receipt = await tx.wait()
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(0);
    expect(await mockUSDC.balanceOf(rebalancer.address)).to.equal(usdcBalanceReb.add(usdcBalanceRFQ));
    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(0);
    expect(await mockALOT.balanceOf(rebalancer.address)).to.equal(alotBalanceReb.add(alotBalanceRFQ));
    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(0);
    expect(await ethers.provider.getBalance(rebalancer.address)).to.equal(avaxBalanceReb.add(avaxBalanceRFQ).sub(gasSpent));
  });

  it("Only Rebalancer can claimBalance & batchClaimBalance", async () => {
    const usdcBalanceRFQ = await mockUSDC.balanceOf(mainnetRFQ.address);
    const alotBalanceRFQ = await mockALOT.balanceOf(mainnetRFQ.address);

    await expect(
      mainnetRFQ.connect(owner).claimBalance(mockUSDC.address, usdcBalanceRFQ)
    ).to.be.revertedWith("AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0xf48fc9fa479390222c2fd5227bb7e4f7c4a85d969b82dfa11eb0954487273ab9");

    await expect(
      mainnetRFQ.connect(owner).batchClaimBalance([mockUSDC.address, mockALOT.address], [usdcBalanceRFQ, alotBalanceRFQ])
    ).to.be.revertedWith("AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0xf48fc9fa479390222c2fd5227bb7e4f7c4a85d969b82dfa11eb0954487273ab9");
  });


  it("Invalid AVAX transfer should revert", async() => {
    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address);
    order.makerAmount = Utils.parseUnits("30000", 18).toString();

    const signature = await toSignature(order, signer);

    await expect(mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )).to.be.revertedWith("RF-TF-01")


    await expect(mainnetRFQ.connect(rebalancer).claimBalance(ethers.constants.AddressZero, Utils.parseUnits("30000", 18).toString())).to.be.revertedWith("RF-TF-01");

    await expect(mainnetRFQ.connect(rebalancer).batchClaimBalance([ethers.constants.AddressZero], [ Utils.parseUnits("30000", 18).toString()])).to.be.revertedWith("RF-TF-01");
    await expect(mainnetRFQ.connect(rebalancer).batchClaimBalance([ethers.constants.AddressZero], [ Utils.parseUnits("30000", 18).toString(), Utils.parseUnits("30000", 18).toString()])).to.be.revertedWith("RF-BCAM-01");
  });

  it("Should test invalid recoverSigner", async () => {
    let invalidResp = await mainnetRFQ.isValidSignature("0x0000000000000000000000000000000000000000000000000000000000000000", "0x00");

    expect(invalidResp).to.equal("0x00000000");

    const message = 'Hello, world!';
    const messageHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message));

    invalidResp = await mainnetRFQ.isValidSignature(messageHash, "0x123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456781a");

    expect(invalidResp).to.equal("0x00000000");

  });

  it("Should test invalid reentrancy for claim balance", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQ.address, mainnetRFQ.address);
    await mainnetRFQAttacker.deployed();

    const avaxBalance: string = Utils.parseUnits("1", 18).toString()
    await mainnetRFQ.connect(owner).addRebalancer(mainnetRFQAttacker.address);
    await expect(mainnetRFQAttacker.connect(trader1).attackClaimBalance(ethers.constants.AddressZero, avaxBalance)).to.be.revertedWith("RF-TF-01");
    await expect(mainnetRFQAttacker.connect(trader1).attackBatchClaimBalance([ethers.constants.AddressZero], [avaxBalance])).to.be.revertedWith("RF-TF-01");
  });

  it("Should test invalid reentrancy for simple swap", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQ.address, mainnetRFQ.address);
    await mainnetRFQAttacker.deployed();

    const order = await getOrder(ethers.constants.AddressZero, mockUSDC.address);
    order.taker = mainnetRFQAttacker.address;
    const nonce = 100
    order.nonceAndMeta = `${mainnetRFQAttacker.address}${nonce.toString(16).padStart(24, '0')}`;
    const signature = await toSignature(order, signer);

    await mockUSDC.connect(trader1).approve(mainnetRFQAttacker.address, ethers.constants.MaxUint256);
    await expect(mainnetRFQAttacker.connect(trader1).attackSimpleSwap(order, signature)).to.be.revertedWith("RF-TF-01");
  });

  it("Should test invalid reentrancy for multi swap", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQ.address, mainnetRFQ.address);
    await mainnetRFQAttacker.deployed();

    const order = await getOrder(ethers.constants.AddressZero, mockUSDC.address);
    order.taker = mainnetRFQAttacker.address;
    const nonce = 100
    order.nonceAndMeta = `${mainnetRFQAttacker.address}${nonce.toString(16).padStart(24, '0')}`;
    const signature = await toSignature(order, signer);

    await mockUSDC.connect(trader1).approve(mainnetRFQAttacker.address, ethers.constants.MaxUint256);
    await expect(mainnetRFQAttacker.connect(trader1).attackPartialSwap(order, signature)).to.be.revertedWith("RF-TF-01");
  });

  it("Should test invalid aggregator contract for simple swap native refund", async () => {
    const FaultyAggregatorMock = await ethers.getContractFactory("FaultyAggregatorMock");
    const faultyAggregator = await FaultyAggregatorMock.deploy(mainnetRFQ.address);
    await faultyAggregator.deployed();

    const order = await getOrder(mockUSDC.address, ethers.constants.AddressZero);
    order.taker = faultyAggregator.address;
    const signature = await toSignature(order, signer);

    const avaxValue = ethers.BigNumber.from(order.takerAmount).add(swapAmountAVAX);
    await expect(faultyAggregator.connect(trader1).simpleSwap(order, signature, {value: avaxValue})).to.be.revertedWith("RF-TF-02");
  });

  it("Should trade two tokens with partialSwap exact takerAmount", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          order.takerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

  });

  it("Should trade two tokens with partialSwap larger takerAmount", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(order.takerAmount).add(100);

    await expect(
        mainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          newTakerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      newTakerAmount,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(newTakerAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(newTakerAmount)
    );

  });

  it("Should trade two tokens with partialSwap smaller takerAmount", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(order.takerAmount).sub(100);
    const expectedTakerAmount = newTakerAmount;
    const expectedMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(newTakerAmount).div(order.takerAmount);

    await expect(
        mainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          newTakerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      expectedTakerAmount,
      expectedMakerAmount,
    );

    expect(expectedMakerAmount).to.be.lt(order.makerAmount);

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(expectedMakerAmount)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(expectedTakerAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(expectedMakerAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(expectedTakerAmount)
    );

  });

  it("Should trade two tokens with partialSwap 0 takerAmount", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(0);
    const expectedTakerAmount = newTakerAmount;
    const expectedMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(newTakerAmount).div(order.takerAmount);

    await expect(
        mainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          0,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      expectedTakerAmount,
      expectedMakerAmount,
    );

    expect(expectedMakerAmount).to.be.lt(order.makerAmount);

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(0)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(0)
    );

    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(0)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(0)
    );

  });

  it("Should not trade partialSwap with invalid signature", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, trader1);

    await expect(
        mainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          order.takerAmount
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should trade two tokens aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

  });

  it("Should trade AVAX as maker asset aggregator", async () => {
    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address, true);

    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(aggregator.address);

    const tx =  await mainnetRFQ.connect(aggregator).simpleSwap(
        order,
        signature
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)



    expect(await ethers.provider.getBalance(aggregator.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).add(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should trade AVAX as taker aggregator", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero, true);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(aggregator.address);

    const tx =  await mainnetRFQ.connect(aggregator).simpleSwap(
        order,
        signature,
        {value: swapAmountAVAX},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(aggregator.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should refund AVAX surplus aggregator", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero, true);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(aggregator.address);

    const tx =  await mainnetRFQ.connect(aggregator).simpleSwap(
        order,
        signature,
        {value: Utils.parseUnits("11", 18).toString()},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(aggregator.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should not trade with expired order aggregator", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero, true);
    const time = await f.getLatestBlockTimestamp();
    order.expiry = time - 120;

    const signature = await toSignature(order, signer);

    await expect(mainnetRFQ.connect(aggregator).simpleSwap(order, signature, {value: swapAmountAVAX},)).to.be.revertedWith("RF-QE-02");

  });

  it("Should not trade with invalid nonce aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    // uses same nonce
    await expect(
      mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("RF-IN-01");
  });

  it("Should not trade with invalid signature aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, aggregator);

    await expect(
        mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should not trade with undervalued transaction aggregator", async () => {
    // when taker is avax
    let order = await getOrder(mockALOT.address, ethers.constants.AddressZero, true);

    let signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
          {value: ethers.BigNumber.from(swapAmountAVAX).sub(1)},
      )
    ).to.be.revertedWith("RF-IMV-01");


    await mockALOT.connect(aggregator).approve(mainnetRFQ.address, 0);

    // when maker is avax
    order = await getOrder(ethers.constants.AddressZero, mockALOT.address, true);

    signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");

    // when maker & taker erc20
    await mockUSDC.connect(aggregator).approve(mainnetRFQ.address, 0);

    order = await getOrder(mockALOT.address, mockUSDC.address, true);

    signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("Should trade two tokens with partialSwap exact takerAmount aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          order.takerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

  });

  it("Should trade two tokens with partialSwap larger takerAmount aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(order.takerAmount).add(100);

    await expect(
        mainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          newTakerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      newTakerAmount,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(newTakerAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(newTakerAmount)
    );

  });

  it("Should trade two tokens with partialSwap smaller takerAmount aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(order.takerAmount).sub(100);
    const expectedTakerAmount = newTakerAmount;
    const expectedMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(newTakerAmount).div(order.takerAmount);

    await expect(
        mainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          newTakerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      expectedTakerAmount,
      expectedMakerAmount,
    );

    expect(expectedMakerAmount).to.be.lt(order.makerAmount);

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(expectedMakerAmount)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(expectedTakerAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(expectedMakerAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(expectedTakerAmount)
    );

  });

  it("Should trade two tokens with partialSwap 0 takerAmount aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(0);
    const expectedTakerAmount = newTakerAmount;
    const expectedMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(newTakerAmount).div(order.takerAmount);

    await expect(
        mainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          0,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      expectedTakerAmount,
      expectedMakerAmount,
    );

    expect(expectedMakerAmount).to.be.lt(order.makerAmount);

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(0)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(0)
    );

    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(0)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(0)
    );

  });

  it("Should not trade partialSwap with invalid signature", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, trader1);

    await expect(
        mainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          order.takerAmount
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should trade and transfer two tokens", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, false, true);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(owner.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(owner.address)).to.equal(swapAmountUSDC);


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

  });

  it("Should trade and transfer AVAX as maker asset", async () => {
    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address, false, true);

    const signature = await toSignature(order, signer);

    const ownerAVAXBalance = await ethers.provider.getBalance(owner.address);

    await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )

    expect(await ethers.provider.getBalance(owner.address)).to.equal(
      ethers.BigNumber.from(ownerAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should trade and transfer AVAX as taker", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero, false, true);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: swapAmountAVAX},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(owner.address)).to.equal(swapAmountALOT);

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should refund AVAX surplus", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: Utils.parseUnits("11", 18).toString()},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should fail to set slippage points with array mismatch", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);

    await expect(
      mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0, 1], [10000])
    ).to.be.revertedWith("RF-SPAM-01");
  });

  it("Should fail to set slippage points with too high slippage mismatch", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);

    await expect(
      mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [50001])
    ).to.be.revertedWith("RF-SPMB-01");
  });

  it("Should slip with always slip bit set", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);
    const order = await getOrder(mockUSDC.address, mockALOT.address);
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"80".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const finalUSDCAmount = ethers.BigNumber.from(swapAmountUSDC).mul(9900).div(10000);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      finalUSDCAmount,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should not slip if quote ttl not provided", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);
    const order = await getOrder(mockUSDC.address, mockALOT.address);
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"2".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should not slip tokens if slipInfo set but quote executed before block ts", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);

    const order = await getOrder(mockUSDC.address, mockALOT.address);
    // 30s quote ttl
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"30".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should not slip tokens if slipInfo set but quote executed within 15 seconds", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);

    const order = await getOrder(mockUSDC.address, mockALOT.address);
    // 30s quote ttl
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"30".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);

    await ethers.provider.send("evm_mine", [order.expiry - 20]);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should slip tokens if slipInfo set but quote executed after 15 seconds and point not set", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);

    const order = await getOrder(mockUSDC.address, mockALOT.address);
    // 20 bytes | 1 bytes | 11 bytes
    // 30s quote ttl
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"30".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);
    const finalUSDCAmount = ethers.BigNumber.from(swapAmountUSDC).mul(9900).div(10000);

    await ethers.provider.send("evm_mine", [order.expiry - 10]);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      finalUSDCAmount,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should slip tokens if slipInfo set but quote executed after 15 seconds and point set", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);

    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);

    // set to 0.5% for 20s
    // 20s | 0 slipBps
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([160], [5000]);

    const order = await getOrder(mockUSDC.address, mockALOT.address);
    // 20 bytes | 1 bytes | 11 bytes
    // 30s quote ttl
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"30".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);
    const finalUSDCAmount = ethers.BigNumber.from(swapAmountUSDC).mul(9950).div(10000);

    await ethers.provider.send("evm_mine", [order.expiry - 11]);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      finalUSDCAmount,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should set wrapped token false and allow for normal swaps", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, false);

    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should set wrapped token false and trade AVAX as maker asset", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, false);

    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address);

    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)



    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).add(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should set wrapped token false and trade AVAX as taker", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, false);

    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: swapAmountAVAX},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should set wrapped token false and trade WAVAX as maker asset", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, false);

    const order = await getOrder(mockWrapped.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )

    expect(await mockWrapped.balanceOf(trader1.address)).to.equal(ethers.BigNumber.from(swapAmountAVAX));

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should set wrapped token false and trade WAVAX as taker", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, false);

    const order = await getOrder(mockALOT.address, mockWrapped.address);
    const signature = await toSignature(order, signer);

    await mockWrapped.connect(trader1).deposit({value: initialAVAXBalance});
    await mockWrapped.connect(trader1).approve(mainnetRFQ.address, swapAmountAVAX);

    await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
    )

    expect(await mockWrapped.balanceOf(trader1.address)).to.equal(ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX));

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should set wrapped token true and allow for normal swaps", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, true);
    await mainnetRFQ.connect(rebalancer).claimBalance(ethers.constants.AddressZero, initialAVAXBalance);
    await mockWrapped.connect(rebalancer).deposit({value: initialAVAXBalance});
    await mockWrapped.connect(rebalancer).transfer(mainnetRFQ.address, initialAVAXBalance);

    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should set wrapped token true and trade AVAX as maker asset", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, true);
    await mainnetRFQ.connect(rebalancer).claimBalance(ethers.constants.AddressZero, initialAVAXBalance);
    await mockWrapped.connect(rebalancer).deposit({value: initialAVAXBalance});
    await mockWrapped.connect(rebalancer).transfer(mainnetRFQ.address, initialAVAXBalance);

    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address);

    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)



    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).add(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await mockWrapped.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(0);

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should set wrapped token true and trade AVAX as taker", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, true);
    await mainnetRFQ.connect(rebalancer).claimBalance(ethers.constants.AddressZero, initialAVAXBalance);
    await mockWrapped.connect(rebalancer).deposit({value: initialAVAXBalance});
    await mockWrapped.connect(rebalancer).transfer(mainnetRFQ.address, initialAVAXBalance);

    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: swapAmountAVAX},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await mockWrapped.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(0);

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should set wrapped token true and trade WAVAX as maker asset", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, true);
    await mainnetRFQ.connect(rebalancer).claimBalance(ethers.constants.AddressZero, initialAVAXBalance);
    await mockWrapped.connect(rebalancer).deposit({value: initialAVAXBalance});
    await mockWrapped.connect(rebalancer).transfer(mainnetRFQ.address, initialAVAXBalance);

    const order = await getOrder(mockWrapped.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )

    expect(await mockWrapped.balanceOf(trader1.address)).to.equal(ethers.BigNumber.from(swapAmountAVAX));

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await mockWrapped.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(0);

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should set wrapped token true and trade WAVAX as taker", async () => {
    await mainnetRFQ.connect(owner).setWrapped(mockWrapped.address, true);
    await mainnetRFQ.connect(rebalancer).claimBalance(ethers.constants.AddressZero, initialAVAXBalance);
    await mockWrapped.connect(rebalancer).deposit({value: initialAVAXBalance});
    await mockWrapped.connect(rebalancer).transfer(mainnetRFQ.address, initialAVAXBalance);

    const order = await getOrder(mockALOT.address, mockWrapped.address);
    const signature = await toSignature(order, signer);

    await mockWrapped.connect(trader1).deposit({value: initialAVAXBalance});
    await mockWrapped.connect(trader1).approve(mainnetRFQ.address, swapAmountAVAX);

    await mainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
    )

    expect(await mockWrapped.balanceOf(trader1.address)).to.equal(ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX));

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await mockWrapped.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(0);

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });
});


describe("Dexalot Router", () => {
  let mainnetRFQ: MainnetRFQ;
  let dexalotRouter: DexalotRouter;
  let routerAsMainnetRFQ: MainnetRFQ;
  let mockUSDC: MockToken;
  let mockALOT: MockToken;
  let mockWrapped: MockWrappedToken

  const initialUSDCBalance: string = Utils.parseUnits("10000", 6).toString()
  const initialALOTBalance: string = Utils.parseUnits("10000", 18).toString()
  const initialAVAXBalance: string = Utils.parseUnits("100", 18).toString()

  const swapAmountUSDC: string = Utils.parseUnits("100", 6).toString()
  const swapAmountALOT: string = Utils.parseUnits("100", 18).toString()
  const swapAmountAVAX: string = Utils.parseUnits("10", 18).toString()

  const swapAmounts: {[key: string]: string} = {}

  let owner: SignerWithAddress;
  let rebalancer: SignerWithAddress;
  let signer: SignerWithAddress;
  let aggregator: SignerWithAddress;
  let trader1: SignerWithAddress;
  let volatiltyAdmin: SignerWithAddress;

  let chainId: number;

  const getOrder = async (makerAsset: string, takerAsset: string, isAggregator?: boolean, isTransfer?: boolean): Promise<Order> => {
    const time = await f.getLatestBlockTimestamp();

    const taker = trader1.address;
    const num  = 100
    const destTrader = isTransfer ? owner.address : trader1.address;
    let nonceAndMeta = `${destTrader}${num.toString(16).padStart(24, '0')}`;
    if (isAggregator) {
      nonceAndMeta = `${aggregator.address}${num.toString(16).padStart(24, '0')}`;
    }

    return {
      nonceAndMeta: nonceAndMeta,
      expiry: time + 120,
      makerAsset,
      takerAsset,
      maker: mainnetRFQ.address,
      taker: taker,
      makerAmount: swapAmounts[makerAsset],
      takerAmount: swapAmounts[takerAsset],
    };
  }

  async function toSignature(order: Order, txSigner: SignerWithAddress) {
    const domain = {
      name: "Dexalot",
      version: "1",
      chainId: chainId,
      verifyingContract: mainnetRFQ.address,
    };

    const types = {
      Order: [
        { name: "nonceAndMeta", type: "uint256", },
        { name: "expiry", type: "uint128", },
        { name: "makerAsset", type: "address", },
        { name: "takerAsset", type: "address", },
        { name: "maker", type: "address", },
        { name: "taker", type: "address", },
        { name: "makerAmount", type: "uint256", },
        { name: "takerAmount", type: "uint256", },
      ],
    };

    const signature = await txSigner._signTypedData(domain, types, order);
    return signature;
  }


  beforeEach(async function () {
    const accounts = await f.getAccounts();

    owner = accounts.owner;
    signer = accounts.other1;
    rebalancer = signer;
    trader1 = accounts.trader1;
    aggregator = accounts.trader2;
    volatiltyAdmin = accounts.other2;

    const network = await ethers.provider.getNetwork()
    chainId = network.chainId;

    const portfolioContracts = await f.deployCompletePortfolio(true);

    // deploy upgradeable contract
    mainnetRFQ = portfolioContracts.mainnetRFQ;
    dexalotRouter = portfolioContracts.dexalotRouter;

    // deploy mock tokens
    mockUSDC = await f.deployMockToken("USDC", 6);
    mockALOT = portfolioContracts.alot;
    mockWrapped = await f.deployMockWrappedToken("WrappedAVAX", 18);

    // mint tokens
    await mockUSDC.mint(mainnetRFQ.address, initialUSDCBalance);
    await mockALOT.mint(mainnetRFQ.address, initialALOTBalance);
    await rebalancer.sendTransaction({
      to: mainnetRFQ.address,
      value: ethers.utils.parseEther("100.0"),
    });


    // mint to trader
    await mockUSDC.mint(trader1.address, initialUSDCBalance);
    await mockALOT.mint(trader1.address, initialALOTBalance);

    // mint to aggregator
    await mockUSDC.mint(aggregator.address, initialUSDCBalance);
    await mockALOT.mint(aggregator.address, initialALOTBalance);


    const MainnetRFQ = await ethers.getContractFactory("MainnetRFQ");
    routerAsMainnetRFQ = MainnetRFQ.attach(dexalotRouter.address);

    // approve tokens
    await mockUSDC.connect(trader1).approve(routerAsMainnetRFQ.address, ethers.constants.MaxUint256);
    await mockALOT.connect(trader1).approve(routerAsMainnetRFQ.address, ethers.constants.MaxUint256);
    await mockUSDC.connect(aggregator).approve(routerAsMainnetRFQ.address, ethers.constants.MaxUint256);
    await mockALOT.connect(aggregator).approve(routerAsMainnetRFQ.address, ethers.constants.MaxUint256);

    swapAmounts[mockUSDC.address] = swapAmountUSDC;
    swapAmounts[mockALOT.address] = swapAmountALOT;
    swapAmounts[ethers.constants.AddressZero] = swapAmountAVAX;
    swapAmounts[mockWrapped.address] = swapAmountAVAX;

  });

  it("Should not deploy with 0 address", async function () {
    const DexalotRouter = await ethers.getContractFactory("DexalotRouter");
    await expect(DexalotRouter.deploy(ethers.constants.AddressZero)).to.be.revertedWith("DR-SAZ-01");
  });


  it("Should deploy correctly", async () => {
    expect(await dexalotRouter.hasRole(ethers.constants.HashZero, owner.address)).to.equal(true);
  });

  it("Should be able to set everything correctly", async () => {
    const dummyAddress = aggregator.address;
    // fail for non-owner
    await expect(mainnetRFQ.connect(signer).setTrustedForwarder(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(dexalotRouter.connect(signer).setAllowedRFQ(dummyAddress, true)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(dexalotRouter.connect(signer).retrieveToken(ethers.constants.AddressZero, 0)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);

    // should not set to 0x0
    await expect(dexalotRouter.connect(owner).setAllowedRFQ(ethers.constants.AddressZero, true)).to.be.revertedWith("DR-SAZ-01");
    await expect(mainnetRFQ.connect(owner).setTrustedForwarder(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
  });

  it("Should accept native token but no action ", async () => {
    await owner.sendTransaction({
      to: routerAsMainnetRFQ.address,
      value: ethers.utils.parseEther("1.0"),
    })
    expect(await ethers.provider.getBalance(routerAsMainnetRFQ.address)).to.equal(ethers.utils.parseEther("1.0"));
    await dexalotRouter.connect(owner).retrieveToken(ethers.constants.AddressZero, ethers.utils.parseEther("1.0"));
    expect(await ethers.provider.getBalance(routerAsMainnetRFQ.address)).to.equal(0);
  });

  it("Should retrieve ERC20 token if sent accidentally", async () => {
    const quantity = ethers.utils.parseUnits("10", 6);
    const ownerUSDCBal = await mockUSDC.balanceOf(owner.address);
    await mockUSDC.connect(trader1).transfer(routerAsMainnetRFQ.address, quantity);
    expect(await mockUSDC.balanceOf(routerAsMainnetRFQ.address)).to.equal(quantity);
    await dexalotRouter.connect(owner).retrieveToken(mockUSDC.address, quantity);
    expect(await mockUSDC.balanceOf(routerAsMainnetRFQ.address)).to.equal(0);
    expect(await mockUSDC.balanceOf(owner.address)).to.equal(ownerUSDCBal.add(quantity));
  });

  it("Should fail to call non partialSwap/simpleSwap mainnetrfq function", async () => {
    // should not set to 0x0
    await expect(routerAsMainnetRFQ.connect(owner).claimBalance(ethers.constants.AddressZero, 0)).to.be.revertedWith("DR-FSNW-01");
  });

  it("Should fail to execute swap with zero address rfq", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);
    order.maker = ethers.constants.AddressZero;

    await expect(routerAsMainnetRFQ.connect(trader1).simpleSwap(order, signature)).to.be.revertedWith("DR-IRMA-01");
  });

  it("Should fail to execute swap if rfq address disabled", async () => {
    await expect(dexalotRouter.setAllowedRFQ(mainnetRFQ.address, false)).to.emit(dexalotRouter, "AllowedRFQUpdated")
    .withArgs(
      mainnetRFQ.address,
      false,
    );
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(routerAsMainnetRFQ.connect(trader1).simpleSwap(order, signature)).to.be.revertedWith("DR-IRMA-01");

    expect(await dexalotRouter.isAllowedRFQ(mainnetRFQ.address)).to.equal(false);
  });

  it("Should succesfully return enabled rfq addresses", async () => {
    const rfqs = await dexalotRouter.getAllowedRFQs();
    expect(rfqs.length).to.equal(1);
    expect(rfqs[0]).to.equal(mainnetRFQ.address);

    await dexalotRouter.setAllowedRFQ(aggregator.address, true);
    const rfqs2 = await dexalotRouter.getAllowedRFQs();
    expect(rfqs2.length).to.equal(2);
    expect(rfqs2[0]).to.equal(mainnetRFQ.address);
    expect(rfqs2[1]).to.equal(aggregator.address);

    const n = await dexalotRouter.numberOfAllowedRFQs();
    expect(n).to.equal(2);
    const page1 = await dexalotRouter.getAllowedRFQsPaginated(0, 1);
    expect(page1.length).to.equal(1);
    expect(page1[0]).to.equal(mainnetRFQ.address);
    const page2 = await dexalotRouter.getAllowedRFQsPaginated(1, 1);
    expect(page2.length).to.equal(1);
    expect(page2[0]).to.equal(aggregator.address);
    const page3 = await dexalotRouter.getAllowedRFQsPaginated(0, 2);
    expect(page3.length).to.equal(2);
    expect(page3[0]).to.equal(mainnetRFQ.address);
    expect(page3[1]).to.equal(aggregator.address);
    const page4 = await dexalotRouter.getAllowedRFQsPaginated(0, 5);
    expect(page4.length).to.equal(2);
    expect(page4[0]).to.equal(mainnetRFQ.address);
    expect(page4[1]).to.equal(aggregator.address);
  });

  it("Should trade two tokens", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should trade AVAX as maker asset", async () => {
    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address);

    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await routerAsMainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).add(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should trade AVAX as taker", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await routerAsMainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: swapAmountAVAX},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should refund AVAX surplus", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await routerAsMainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: Utils.parseUnits("11", 18).toString()},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should not trade with expired order", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const time = await f.getLatestBlockTimestamp();
    order.expiry = time - 120;

    const signature = await toSignature(order, signer);

    await expect(routerAsMainnetRFQ.connect(trader1).simpleSwap(order, signature, {value: swapAmountAVAX},)).to.be.revertedWith("RF-QE-02");

  });

  it("Should not trade with invalid nonce", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    // uses same nonce
    await expect(
      routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("RF-IN-01");
  });

  it("Should not trade with invalid signature", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, trader1);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should not trade with undervalued transaction", async () => {
    // when taker is avax
    let order = await getOrder(mockALOT.address, ethers.constants.AddressZero);

    let signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
          {value: ethers.BigNumber.from(swapAmountAVAX).sub(1)},
      )
    ).to.be.revertedWith("RF-IMV-01");


    await mockALOT.connect(trader1).approve(routerAsMainnetRFQ.address, 0);

    // when maker is avax
    order = await getOrder(ethers.constants.AddressZero, mockALOT.address);

    signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");

    // when maker & taker erc20
    await mockUSDC.connect(trader1).approve(routerAsMainnetRFQ.address, 0);

    order = await getOrder(mockALOT.address, mockUSDC.address);

    signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("Should not trade if msg.sender != _order.taker", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    order.taker = signer.address;
    const nonce = 100
    order.nonceAndMeta = `${signer.address}${nonce.toString(16).padStart(24, '0')}`;

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
          {value: swapAmountAVAX},
      )
    ).to.be.revertedWith("RF-IMS-01");

  });


  it("Should test invalid reentrancy for simple swap", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQ.address, routerAsMainnetRFQ.address);
    await mainnetRFQAttacker.deployed();

    const order = await getOrder(ethers.constants.AddressZero, mockUSDC.address);
    order.taker = mainnetRFQAttacker.address;
    const nonce = 100
    order.nonceAndMeta = `${mainnetRFQAttacker.address}${nonce.toString(16).padStart(24, '0')}`;
    const signature = await toSignature(order, signer);

    await mockUSDC.connect(trader1).approve(mainnetRFQAttacker.address, ethers.constants.MaxUint256);
    await expect(mainnetRFQAttacker.connect(trader1).attackSimpleSwap(order, signature)).to.be.revertedWith("RF-TF-01");
  });

  it("Should test invalid reentrancy for multi swap", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQ.address, routerAsMainnetRFQ.address);
    await mainnetRFQAttacker.deployed();

    const order = await getOrder(ethers.constants.AddressZero, mockUSDC.address);
    order.taker = mainnetRFQAttacker.address;
    const nonce = 100
    order.nonceAndMeta = `${mainnetRFQAttacker.address}${nonce.toString(16).padStart(24, '0')}`;
    const signature = await toSignature(order, signer);

    await mockUSDC.connect(trader1).approve(mainnetRFQAttacker.address, ethers.constants.MaxUint256);
    await expect(mainnetRFQAttacker.connect(trader1).attackPartialSwap(order, signature)).to.be.revertedWith("RF-TF-01");
  });

  it("Should test invalid aggregator contract for simple swap native refund", async () => {
    const FaultyAggregatorMock = await ethers.getContractFactory("FaultyAggregatorMock");
    const faultyAggregator = await FaultyAggregatorMock.deploy(routerAsMainnetRFQ.address);
    await faultyAggregator.deployed();

    const order = await getOrder(mockUSDC.address, ethers.constants.AddressZero);
    order.taker = faultyAggregator.address;
    const signature = await toSignature(order, signer);

    const avaxValue = ethers.BigNumber.from(order.takerAmount).add(swapAmountAVAX);
    await expect(faultyAggregator.connect(trader1).simpleSwap(order, signature, {value: avaxValue})).to.be.revertedWith("RF-TF-02");
  });

  it("Should trade two tokens with partialSwap exact takerAmount", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          order.takerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

  });

  it("Should trade two tokens with partialSwap larger takerAmount", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(order.takerAmount).add(100);

    await expect(
        routerAsMainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          newTakerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      newTakerAmount,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(newTakerAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(newTakerAmount)
    );

  });

  it("Should trade two tokens with partialSwap smaller takerAmount", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(order.takerAmount).sub(100);
    const expectedTakerAmount = newTakerAmount;
    const expectedMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(newTakerAmount).div(order.takerAmount);

    await expect(
        routerAsMainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          newTakerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      expectedTakerAmount,
      expectedMakerAmount,
    );

    expect(expectedMakerAmount).to.be.lt(order.makerAmount);

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(expectedMakerAmount)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(expectedTakerAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(expectedMakerAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(expectedTakerAmount)
    );

  });

  it("Should trade two tokens with partialSwap 0 takerAmount", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(0);
    const expectedTakerAmount = newTakerAmount;
    const expectedMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(newTakerAmount).div(order.takerAmount);

    await expect(
        routerAsMainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          0,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      expectedTakerAmount,
      expectedMakerAmount,
    );

    expect(expectedMakerAmount).to.be.lt(order.makerAmount);

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(0)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(0)
    );

    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(0)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(0)
    );

  });

  it("Should not trade partialSwap with invalid signature", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address);

    const signature = await toSignature(order, trader1);

    await expect(
        routerAsMainnetRFQ.connect(trader1).partialSwap(
          order,
          signature,
          order.takerAmount
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should trade two tokens aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

  });

  it("Should trade AVAX as maker asset aggregator", async () => {
    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address, true);

    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(aggregator.address);

    const tx =  await routerAsMainnetRFQ.connect(aggregator).simpleSwap(
        order,
        signature
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)



    expect(await ethers.provider.getBalance(aggregator.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).add(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should trade AVAX as taker aggregator", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero, true);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(aggregator.address);

    const tx =  await routerAsMainnetRFQ.connect(aggregator).simpleSwap(
        order,
        signature,
        {value: swapAmountAVAX},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(aggregator.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should refund AVAX surplus aggregator", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero, true);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(aggregator.address);

    const tx =  await routerAsMainnetRFQ.connect(aggregator).simpleSwap(
        order,
        signature,
        {value: Utils.parseUnits("11", 18).toString()},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(aggregator.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should not trade with expired order aggregator", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero, true);
    const time = await f.getLatestBlockTimestamp();
    order.expiry = time - 120;

    const signature = await toSignature(order, signer);

    await expect(routerAsMainnetRFQ.connect(aggregator).simpleSwap(order, signature, {value: swapAmountAVAX},)).to.be.revertedWith("RF-QE-02");

  });

  it("Should not trade with invalid nonce aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    // uses same nonce
    await expect(
      mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("RF-IN-01");
  });

  it("Should not trade with invalid signature aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, aggregator);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should not trade with undervalued transaction aggregator", async () => {
    // when taker is avax
    let order = await getOrder(mockALOT.address, ethers.constants.AddressZero, true);

    let signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
          {value: ethers.BigNumber.from(swapAmountAVAX).sub(1)},
      )
    ).to.be.revertedWith("RF-IMV-01");


    await mockALOT.connect(aggregator).approve(routerAsMainnetRFQ.address, 0);

    // when maker is avax
    order = await getOrder(ethers.constants.AddressZero, mockALOT.address, true);

    signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");

    // when maker & taker erc20
    await mockUSDC.connect(aggregator).approve(routerAsMainnetRFQ.address, 0);

    order = await getOrder(mockALOT.address, mockUSDC.address, true);

    signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(aggregator).simpleSwap(
          order,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("Should trade two tokens with partialSwap exact takerAmount aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          order.takerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

  });

  it("Should trade two tokens with partialSwap larger takerAmount aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(order.takerAmount).add(100);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          newTakerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      newTakerAmount,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(newTakerAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(newTakerAmount)
    );

  });

  it("Should trade two tokens with partialSwap smaller takerAmount aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(order.takerAmount).sub(100);
    const expectedTakerAmount = newTakerAmount;
    const expectedMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(newTakerAmount).div(order.takerAmount);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          newTakerAmount,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      expectedTakerAmount,
      expectedMakerAmount,
    );

    expect(expectedMakerAmount).to.be.lt(order.makerAmount);

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(expectedMakerAmount)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(expectedTakerAmount)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(expectedMakerAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(expectedTakerAmount)
    );

  });

  it("Should trade two tokens with partialSwap 0 takerAmount aggregator", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, signer);
    const newTakerAmount = ethers.BigNumber.from(0);
    const expectedTakerAmount = newTakerAmount;
    const expectedMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(newTakerAmount).div(order.takerAmount);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          0,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(aggregator.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      expectedTakerAmount,
      expectedMakerAmount,
    );

    expect(expectedMakerAmount).to.be.lt(order.makerAmount);

    expect(await mockUSDC.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(0)
    );


    expect(await mockALOT.balanceOf(aggregator.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(0)
    );

    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(0)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(0)
    );

  });

  it("Should not trade partialSwap with invalid signature", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, true);

    const signature = await toSignature(order, trader1);

    await expect(
        routerAsMainnetRFQ.connect(aggregator).partialSwap(
          order,
          signature,
          order.takerAmount
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should trade and transfer two tokens", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address, false, true);

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(owner.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(owner.address)).to.equal(swapAmountUSDC);


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

  });

  it("Should trade and transfer AVAX as maker asset", async () => {
    const order = await getOrder(ethers.constants.AddressZero, mockALOT.address, false, true);

    const signature = await toSignature(order, signer);

    const ownerAVAXBalance = await ethers.provider.getBalance(owner.address);

    await routerAsMainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature
    )

    expect(await ethers.provider.getBalance(owner.address)).to.equal(
      ethers.BigNumber.from(ownerAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).sub(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  })

  it("Should trade and transfer AVAX as taker", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero, false, true);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await routerAsMainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: swapAmountAVAX},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(owner.address)).to.equal(swapAmountALOT);

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });

  it("Should refund AVAX surplus", async () => {
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);
    const signature = await toSignature(order, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await routerAsMainnetRFQ.connect(trader1).simpleSwap(
        order,
        signature,
        {value: Utils.parseUnits("11", 18).toString()},
    )

    const receipt = await tx.wait()

    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)


    expect(await ethers.provider.getBalance(trader1.address)).to.equal(
      ethers.BigNumber.from(t1AVAXBalance).sub(swapAmountAVAX).sub(gasSpent)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );

    expect(await ethers.provider.getBalance(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialAVAXBalance).add(swapAmountAVAX)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );
  });


  it("Should slip with always slip bit set", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);
    const order = await getOrder(mockUSDC.address, mockALOT.address);
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"80".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const finalUSDCAmount = ethers.BigNumber.from(swapAmountUSDC).mul(9900).div(10000);

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      finalUSDCAmount,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should not slip if quote ttl not provided", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);
    const order = await getOrder(mockUSDC.address, mockALOT.address);
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"2".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should not slip tokens if slipInfo set but quote executed before block ts", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);

    const order = await getOrder(mockUSDC.address, mockALOT.address);
    // 30s quote ttl
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"30".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should not slip tokens if slipInfo set but quote executed within 15 seconds", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);

    const order = await getOrder(mockUSDC.address, mockALOT.address);
    // 30s quote ttl
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"30".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);

    await ethers.provider.send("evm_mine", [order.expiry - 20]);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      swapAmountUSDC,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(swapAmountUSDC)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should slip tokens if slipInfo set but quote executed after 15 seconds and point not set", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);
    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);

    const order = await getOrder(mockUSDC.address, mockALOT.address);
    // 20 bytes | 1 bytes | 11 bytes
    // 30s quote ttl
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"30".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);
    const finalUSDCAmount = ethers.BigNumber.from(swapAmountUSDC).mul(9900).div(10000);

    await ethers.provider.send("evm_mine", [order.expiry - 10]);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      finalUSDCAmount,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });

  it("Should slip tokens if slipInfo set but quote executed after 15 seconds and point set", async () => {
    await mainnetRFQ.connect(owner).addVolatilityAdmin(volatiltyAdmin.address);

    // set to 1%
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([0], [10000]);

    // set to 0.5% for 20s
    // 20s | 0 slipBps
    await mainnetRFQ.connect(volatiltyAdmin).setSlippagePoints([160], [5000]);

    const order = await getOrder(mockUSDC.address, mockALOT.address);
    // 20 bytes | 1 bytes | 11 bytes
    // 30s quote ttl
    const newNonceAndMeta =  `${order.nonceAndMeta.slice(0, 42)}${"30".padStart(2, '0')}${order.nonceAndMeta.slice(44,)}`;
    order.nonceAndMeta = newNonceAndMeta;

    const signature = await toSignature(order, signer);
    const finalUSDCAmount = ethers.BigNumber.from(swapAmountUSDC).mul(9950).div(10000);

    await ethers.provider.send("evm_mine", [order.expiry - 11]);

    await expect(
        routerAsMainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      order.nonceAndMeta,
      trader1.address,
      Utils.addressToBytes32(trader1.address),
      chainId,
      mockALOT.address,
      Utils.addressToBytes32(mockUSDC.address),
      swapAmountALOT,
      finalUSDCAmount,
    );

    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );


    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(finalUSDCAmount)
    );


    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });
});
