import Utils from "./utils";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { InventoryManager, MockToken, PortfolioBridgeSub, PortfolioMain, PortfolioSub, PortfolioSubHelper } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

describe("InventoryManager", () => {
  let mockUSDC: MockToken;
  let inventoryManager: InventoryManager;
  let portfolioSub: PortfolioSub;
  let portfolioAvax: PortfolioMain;
  let portfolioArb: PortfolioMain;
  let portfolioGun: PortfolioMain;
  let portfolioBase: PortfolioMain;
  let portfolioBridgeSub: PortfolioBridgeSub;
  let portfolioSubHelper: PortfolioSubHelper;

  const { cChain, gunzillaSubnet, arbitrumChain } = f.getChains();

  const usdcHex = Utils.fromUtf8("USDC");
  const usdcDecimals = 6;
  const usdcAvax = Utils.fromUtf8("USDC" + cChain.chainListOrgId);
  const usdcArb = Utils.fromUtf8("USDC" + arbitrumChain.chainListOrgId);
  const usdcGun = Utils.fromUtf8("USDC" + gunzillaSubnet.chainListOrgId);

  const initialUSDCBalance: string = Utils.parseUnits("100000000000000", 6).toString();

  let owner: SignerWithAddress;
  let trader1: SignerWithAddress;

  const updateA = async (newA: number) => {
    await inventoryManager.updateFutureA(newA, 3600);
    await ethers.provider.send("evm_mine", [(await inventoryManager.futureATime()).toNumber()]);
    await inventoryManager.updateA();
  };

  beforeEach(async function () {
    const accounts = await f.getAccounts();

    owner = accounts.owner;
    trader1 = accounts.trader1;

    const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);

    // deploy upgradeable contract
    inventoryManager = portfolioContracts.inventoryManager;
    portfolioSub = portfolioContracts.portfolioSub;
    portfolioAvax = portfolioContracts.portfolioAvax;
    portfolioArb = portfolioContracts.portfolioArb;
    portfolioGun = portfolioContracts.portfolioGun;
    portfolioBase = portfolioContracts.portfolioBase;
    portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
    portfolioSubHelper = portfolioContracts.portfolioSubHelper;

    // deploy mock tokens
    mockUSDC = await f.deployMockToken("USDC", 6);

    await f.addToken(portfolioAvax, portfolioSub, mockUSDC, 0.5, 0, true, 0); //gasSwapRatio 10
    await f.addToken(portfolioArb, portfolioSub, mockUSDC, 0.5, 0, true, 0); //gasSwapRatio 10
    await f.addToken(portfolioGun, portfolioSub, mockUSDC, 0.5, 0, true, 0); //gasSwapRatio 10
    await f.addToken(portfolioBase, portfolioSub, mockUSDC, 0.5, 0, true, 0); //gasSwapRatio 10

    // mint to trader
    await mockUSDC.mint(trader1.address, initialUSDCBalance);

    // approve tokens
    await mockUSDC.connect(trader1).approve(portfolioAvax.address, ethers.constants.MaxUint256);
    await mockUSDC.connect(trader1).approve(portfolioArb.address, ethers.constants.MaxUint256);
    await mockUSDC.connect(trader1).approve(portfolioGun.address, ethers.constants.MaxUint256);
    await mockUSDC.connect(trader1).approve(portfolioBase.address, ethers.constants.MaxUint256);
  });

  it("Should not initialize again after deployment", async function () {
    await expect(inventoryManager.initialize("0x0000000000000000000000000000000000000000")).to.be.revertedWith(
      "Initializable: contract is already initialized"
    );
  });

  it("Should fail to modify inventory if not PortfolioBridge", async function () {
    await expect(
      inventoryManager.increment(ethers.constants.HashZero, ethers.constants.HashZero, 0)
    ).to.be.revertedWith("AccessControl:");
    await expect(
      inventoryManager.decrement(ethers.constants.HashZero, ethers.constants.HashZero, 0)
    ).to.be.revertedWith("AccessControl:");
    await expect(inventoryManager.remove(ethers.constants.HashZero, ethers.constants.HashZero)).to.be.revertedWith(
      "AccessControl:"
    );
    // await expect(inventoryManager.convertSymbol(ethers.constants.HashZero, ethers.constants.HashZero, ethers.constants.HashZero))
    // .to.be.revertedWith("AccessControl:");
  });

  // it("Should fail to set inventory if not Admin", async function () {
  //   await expect(inventoryManager.connect(trader1).setInventoryBySymbolId([], [])).to.be.revertedWith("AccessControl:");
  // });

  it("Should fail to set PortfolioBridgeSub if not Admin", async function () {
    await expect(
      inventoryManager.connect(trader1).updatePortfolioBridgeSub(ethers.constants.AddressZero)
    ).to.be.revertedWith("AccessControl:");
  });

  it("Should fail to set PortfolioBridgeSub as an empty address", async function () {
    await expect(inventoryManager.updatePortfolioBridgeSub(ethers.constants.AddressZero)).to.be.revertedWith(
      "IM-ZADDR-01"
    );

    const InventoryManager = await ethers.getContractFactory("InventoryManager");
    await expect(upgrades.deployProxy(InventoryManager, [ethers.constants.AddressZero])).to.be.revertedWith(
      "IM-ZADDR-01"
    );
  });

  it("Should update PortfolioBridgeSub correctly", async function () {
    const dummyAddress = trader1.address;
    await expect(inventoryManager.updatePortfolioBridgeSub(trader1.address)).to.not.be.reverted;

    expect(await inventoryManager.portfolioBridgeSub()).to.be.equal(dummyAddress);
  });

  it("Should fail to update future A if not Admin", async function () {
    await expect(inventoryManager.connect(trader1).updateFutureA(0, 0)).to.be.revertedWith("AccessControl:");
  });

  it("Should fail to update A if not Admin", async function () {
    await expect(inventoryManager.connect(trader1).updateA()).to.be.revertedWith("AccessControl:");
  });

  it("Should fail to update future A if new A less than min", async function () {
    await expect(inventoryManager.updateFutureA(0, 10000)).to.be.revertedWith("IM-AVNP-01");
  });

  it("Should fail to update future A if new A more than max", async function () {
    await expect(inventoryManager.updateFutureA(BigNumber.from(10).pow(9), 10000)).to.be.revertedWith("IM-AVNP-01");
  });

  it("Should fail to update future A if time period less than 1 hour", async function () {
    await expect(inventoryManager.updateFutureA(20, 60)).to.be.revertedWith("IM-ATNP-01");
  });

  it("Should successfuly update future A", async function () {
    const startTime = Math.floor(Date.now() / 1000);
    const timePeriod = 3600;
    const newA = 20;
    await expect(inventoryManager.updateFutureA(newA, timePeriod)).to.emit(inventoryManager, "FutureAUpdated");

    expect(await inventoryManager.futureA()).to.be.equal(newA);
    expect((await inventoryManager.futureATime()).toNumber()).to.be.greaterThanOrEqual(startTime + timePeriod);
  });

  it("Should fail to update A if time has not elapsed", async function () {
    const startTime = Math.floor(Date.now() / 1000);
    const timePeriod = 3600;
    const newA = 20;
    await expect(inventoryManager.updateFutureA(newA, timePeriod)).to.emit(inventoryManager, "FutureAUpdated");

    expect(await inventoryManager.futureA()).to.be.equal(newA);
    expect((await inventoryManager.futureATime()).toNumber()).to.be.greaterThanOrEqual(startTime + timePeriod);

    await expect(inventoryManager.updateA()).to.be.revertedWith("IM-BTNE-01");
  });

  it("Should successfully update A if time has elapsed", async function () {
    const startTime = Math.floor(Date.now() / 1000);
    const timePeriod = 3600;
    const newA = 20;
    await expect(inventoryManager.updateFutureA(newA, timePeriod)).to.emit(inventoryManager, "FutureAUpdated");

    expect(await inventoryManager.futureA()).to.be.equal(newA);
    const futureATime = (await inventoryManager.futureATime()).toNumber();
    expect(futureATime).to.be.greaterThanOrEqual(startTime + timePeriod);

    await ethers.provider.send("evm_mine", [futureATime]);

    await expect(inventoryManager.updateA()).to.emit(inventoryManager, "AUpdated");
    expect(await inventoryManager.A()).to.be.equal(newA);
  });

  it("Should fail to update scaling factor if not Admin", async function () {
    await expect(
      inventoryManager.connect(trader1).setScalingFactors([ethers.constants.HashZero], [0])
    ).to.be.revertedWith("AccessControl:");
  });

  it("Should fail to update scaling factor for non present token", async function () {
    expect(await inventoryManager.scalingFactor(usdcAvax)).to.be.equal(0);
    await expect(inventoryManager.setScalingFactors([Utils.fromUtf8("USDC000")], [5])).to.be.revertedWith("IM-NVSI-01");
  });

  it("Should successfully update scaling factor if Admin", async function () {
    expect(await inventoryManager.scalingFactor(usdcAvax)).to.be.equal(0);
    await expect(inventoryManager.setScalingFactors([usdcAvax], [5])).to.emit(inventoryManager, "ScalingFactorUpdated");
    expect(await inventoryManager.scalingFactor(usdcAvax)).to.be.equal(5);
  });

  it("Should fail to remove scaling factor if not Admin", async function () {
    await expect(
      inventoryManager.connect(trader1).removeScalingFactors([ethers.constants.HashZero])
    ).to.be.revertedWith("AccessControl:");
  });

  it("Should fail to remove scaling factor for present token", async function () {
    await expect(inventoryManager.removeScalingFactors([usdcAvax])).to.be.revertedWith("IM-NVSI-02");
  });

  it("Should successfully successfully remove scaling factors if Admin", async function () {
    expect(await inventoryManager.scalingFactor(usdcAvax)).to.be.equal(0);
    await expect(inventoryManager.setScalingFactors([usdcAvax], [5])).to.emit(inventoryManager, "ScalingFactorUpdated");
    expect(await inventoryManager.scalingFactor(usdcAvax)).to.be.equal(5);

    await portfolioBridgeSub.grantRole(await portfolioBridgeSub.BRIDGE_USER_ROLE(), trader1.address);
    await portfolioBridgeSub.connect(trader1).pause();
    await portfolioBridgeSub.removeToken(usdcHex, cChain.chainListOrgId, usdcHex);
    await portfolioBridgeSub.removeToken(usdcHex, arbitrumChain.chainListOrgId, usdcHex);


    await expect(inventoryManager.removeScalingFactors([usdcAvax, usdcArb])).to.emit(inventoryManager, "ScalingFactorUpdated");
  });

  // it("Should set InventoryBySymbolId correctly", async () => {
  //   const { cChain } = f.getChains();

  //   const AVAX = Utils.fromUtf8("AVAX");
  //   const ALOT = Utils.fromUtf8("ALOT");
  //   const NEX = Utils.fromUtf8("NEX");
  //   const AlotId = Utils.fromUtf8("ALOT" + cChain.chainListOrgId);
  //   const AvaxId = Utils.fromUtf8("AVAX" + cChain.chainListOrgId);
  //   const NonExistentId = Utils.fromUtf8("NEX" + cChain.chainListOrgId);
  //   const tokens = [AlotId, AvaxId, NonExistentId];
  //   const quantity1 = Utils.toWei("99");
  //   const quantity2 = Utils.toWei("75");
  //   const quantities = [quantity1, quantity2, quantity2];

  //   await portfolioBridgeSub.addToken(ALOT, ethers.constants.AddressZero, cChain.chainListOrgId, 18, 0, ALOT, 0);

  //   await expect(inventoryManager.setInventoryBySymbolId(tokens, [quantity1])).to.be.revertedWith("IM-LENM-01");
  //   // // success for owner
  //   await inventoryManager.setInventoryBySymbolId(tokens, quantities);
  //   await expect(inventoryManager.setInventoryBySymbolId([AlotId], [quantity1])).to.be.revertedWith("IM-SIAE-01");
  //   expect(await inventoryManager.get(ALOT, AlotId)).to.be.equal(quantity1);
  //   expect(await inventoryManager.get(AVAX, AvaxId)).to.be.equal(quantity2);
  //   // non existent, not set 0 qty
  //   expect(await inventoryManager.get(NEX, NonExistentId)).to.be.equal(0);
  // });

  // it("Should fail to convert symbol if empty symbol", async () => {
  //   await inventoryManager.grantRole(await portfolioSub.PORTFOLIO_BRIDGE_ROLE(), owner.address);
  //   await expect(inventoryManager.convertSymbol(ethers.constants.HashZero, ethers.constants.HashZero, ethers.constants.HashZero))
  //   .to.be.revertedWith("IM-SMEB-01");
  //   await expect(inventoryManager.convertSymbol(ethers.constants.HashZero, Utils.fromUtf8("USDC"), ethers.constants.HashZero))
  //   .to.be.revertedWith("IM-SMEB-01");
  // });

  // it("Should successfully convert symbol if no inventory", async () => {
  //   await inventoryManager.grantRole(await portfolioSub.PORTFOLIO_BRIDGE_ROLE(), owner.address);
  //   await expect(inventoryManager.convertSymbol(usdcAvax, usdcHex, Utils.fromUtf8("NEW")))
  //   .to.not.be.reverted;
  // });

  // it("Should successfully convert symbol if inventory", async () => {
  //   await inventoryManager.grantRole(await portfolioSub.PORTFOLIO_BRIDGE_ROLE(), owner.address);
  //   await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");

  //   const depositQuantity = Utils.parseUnits("100000", usdcDecimals);
  //   expect(await inventoryManager.get(usdcHex, usdcAvax)).to.be.equal(depositQuantity);

  //   const newToken = Utils.fromUtf8("NEW");
  //   await expect(inventoryManager.convertSymbol(usdcAvax, usdcHex, newToken))
  //   .to.not.be.reverted;
  //   expect(await inventoryManager.get(usdcHex, usdcAvax)).to.be.equal(0);
  //   expect(await inventoryManager.get(newToken, usdcAvax)).to.be.equal(depositQuantity);
  // });

  it("Should fail to get withdrawal fee for multiple chain if quantity exceeds inventory", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");

    const quantity = Utils.parseUnits("100001", usdcDecimals);

    await expect(inventoryManager.calculateWithdrawalFee(usdcHex, usdcAvax, quantity)).to.be.revertedWith("IM-INVT-02");
  });

  it("Should get 0 withdrawal fee for one chain", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");

    const quantity = Utils.parseUnits("10000", usdcDecimals);

    expect(await inventoryManager.calculateWithdrawalFee(usdcHex, usdcAvax, quantity)).to.be.equal(0);
  });

  it("Should get 0 withdrawal fee if token not deposited", async () => {
    const quantity = Utils.parseUnits("10000", usdcDecimals);

    expect(await inventoryManager.calculateWithdrawalFee(usdcHex, usdcAvax, quantity)).to.be.equal(0);
  });

  it("Should successfully get withdrawal fee if 0 inventory in one chain", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "1");

    await portfolioSubHelper.addAdminAccountForRates(trader1.address, "hh")
    await f.withdrawTokenToDst(portfolioSub, trader1, usdcHex, usdcDecimals, "1", gunzillaSubnet.chainListOrgId);

    const quantity = Utils.parseUnits("10000", usdcDecimals);

    await expect(inventoryManager.calculateWithdrawalFee(usdcHex, usdcAvax, quantity)).to.not.be.reverted;
    await expect(inventoryManager.calculateWithdrawalFee(usdcHex, usdcArb, quantity)).to.not.be.reverted;
    expect(await inventoryManager.calculateWithdrawalFee(usdcHex, usdcGun, quantity)).to.equal(0);
  });

  it("Should get same bridge fee for multiple chains given same inventory", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    const quantity = Utils.parseUnits("10000", usdcDecimals);

    const avax = await portfolioSub.getBridgeFee(0, cChain.chainListOrgId, usdcHex, quantity);
    const gun = await portfolioSub.getBridgeFee(0, gunzillaSubnet.chainListOrgId, usdcHex, quantity);
    const arb = await portfolioSub.getBridgeFee(0, arbitrumChain.chainListOrgId, usdcHex, quantity);

    expect(avax).to.be.equal(gun);
    expect(avax).to.be.equal(arb);
  });

  it("Should get varying bridge fees for multiple chains given different inventory", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "10010");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "1000000");
    const quantity = Utils.parseUnits("10000", usdcDecimals);

    const avax = await portfolioSub.getBridgeFee(0, cChain.chainListOrgId, usdcHex, quantity);
    const gun = await portfolioSub.getBridgeFee(0, gunzillaSubnet.chainListOrgId, usdcHex, quantity);
    const arb = await portfolioSub.getBridgeFee(0, arbitrumChain.chainListOrgId, usdcHex, quantity);

    expect(avax.gt(gun));
    expect(gun.gt(arb));
  });

  it("Should get varying bridge fees for multiple chains given different inventory in one call", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "10010");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "1000000");
    const quantity = Utils.parseUnits("10000", usdcDecimals);

    const avax = await portfolioSub.getBridgeFee(0, cChain.chainListOrgId, usdcHex, quantity);
    const gun = await portfolioSub.getBridgeFee(0, gunzillaSubnet.chainListOrgId, usdcHex, quantity);
    const arb = await portfolioSub.getBridgeFee(0, arbitrumChain.chainListOrgId, usdcHex, quantity);
    const all = await portfolioSub.getAllBridgeFees(0, usdcHex, quantity);
    const chainIds = [];
    const fees = [];
    let j = 0;
    const chainIdToIndex: { [key: number]: number } = {};
    for (let i = 0; i < all[0].length; i++) {
      if (all.chainIds[i] === 0) {
        continue;
      }
      const curChainId = all.chainIds[i];
      chainIdToIndex[curChainId] = j;
      j++;
      chainIds.push(curChainId);
      fees.push(all.bridgeFees[i]);
    }

    expect(chainIds.length).to.be.equal(4);
    expect(fees.length).to.be.equal(4);
    expect(chainIds.includes(cChain.chainListOrgId));
    expect(chainIds.includes(gunzillaSubnet.chainListOrgId));
    expect(chainIds.includes(arbitrumChain.chainListOrgId));
    expect(fees[chainIdToIndex[cChain.chainListOrgId]].eq(avax));
    expect(fees[chainIdToIndex[gunzillaSubnet.chainListOrgId]].eq(gun));
    expect(fees[chainIdToIndex[arbitrumChain.chainListOrgId]].eq(arb));

    expect(avax.gt(gun));
    expect(gun.gt(arb));
  });

  it("Should not revert for multiple chains where quantity > inventory of one", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "1600000");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "60000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "1000000");
    await f.depositToken(portfolioBase, trader1, mockUSDC, usdcDecimals, usdcHex, "60000");
    const quantity = Utils.parseUnits("700000", usdcDecimals);

    // 0 bridge fee for unsupported icm
    const allICM = await portfolioSub.getAllBridgeFees(2, usdcHex, quantity);
    expect(allICM.chainIds[0]).to.be.equal(0);
    expect(allICM.chainIds[1]).to.be.equal(0);
    expect(allICM.chainIds[2]).to.be.equal(0);
    expect(allICM.chainIds[3]).to.be.equal(0);

     // 0 bridge fee for unsupported token
     const allNonToken = await portfolioSub.getAllBridgeFees(0, Utils.fromUtf8("USDC1"), quantity);
     expect(allNonToken.chainIds[0]).to.be.equal(0);
     expect(allNonToken.chainIds[1]).to.be.equal(0);
     expect(allNonToken.chainIds[2]).to.be.equal(0);
     expect(allNonToken.chainIds[3]).to.be.equal(0);

    const all = await portfolioSub.getAllBridgeFees(0, usdcHex, quantity);
    const avax = await portfolioSub.getBridgeFee(0, cChain.chainListOrgId, usdcHex, quantity);
    const arb = await portfolioSub.getBridgeFee(0, arbitrumChain.chainListOrgId, usdcHex, quantity);
    const chainIds = [];
    const fees = [];
    let j = 0;
    const chainIdToIndex: { [key: number]: number } = {};
    for (let i = 0; i < all[0].length; i++) {
      if (all.chainIds[i] === 0) {
        continue;
      }
      const curChainId = all.chainIds[i];
      chainIdToIndex[curChainId] = j;
      j++;
      chainIds.push(curChainId);
      fees.push(all.bridgeFees[i]);
    }

    expect(chainIds.length).to.be.equal(2);
    expect(fees.length).to.be.equal(2);
    expect(chainIds.includes(cChain.chainListOrgId));
    expect(!chainIds.includes(gunzillaSubnet.chainListOrgId));
    expect(chainIds.includes(arbitrumChain.chainListOrgId));
    expect(fees[chainIdToIndex[cChain.chainListOrgId]].eq(avax));
    expect(fees[chainIdToIndex[arbitrumChain.chainListOrgId]].eq(arb));
  });

  it("Should get varying bridge fees for multiple chains given extreme different inventory", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "1");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "10");

    const avax = await portfolioSub.getBridgeFee(
      0,
      cChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("1", usdcDecimals)
    );
    const gun = await portfolioSub.getBridgeFee(
      0,
      gunzillaSubnet.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100000", usdcDecimals)
    );
    const arb = await portfolioSub.getBridgeFee(
      0,
      arbitrumChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("10", usdcDecimals)
    );

    expect(avax.gt(gun));
    expect(gun.gt(arb));
  });

  it("Should get varying bridge fees for multiple chains given extreme different inventory and low A", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "1");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "10");
    await updateA(11);

    const avax = await portfolioSub.getBridgeFee(
      0,
      cChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("1", usdcDecimals)
    );
    const gun = await portfolioSub.getBridgeFee(
      0,
      gunzillaSubnet.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100000", usdcDecimals)
    );
    const arb = await portfolioSub.getBridgeFee(
      0,
      arbitrumChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("10", usdcDecimals)
    );

    expect(avax.gt(gun));
    expect(gun.gt(arb));
  });

  it("Should get varying bridge fees for multiple chains given extreme different inventory and large A", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "1");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "10");
    await updateA(999999);

    const avax = await portfolioSub.getBridgeFee(
      0,
      cChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("1", usdcDecimals)
    );
    const gun = await portfolioSub.getBridgeFee(
      0,
      gunzillaSubnet.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100000", usdcDecimals)
    );
    const arb = await portfolioSub.getBridgeFee(
      0,
      arbitrumChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("10", usdcDecimals)
    );

    expect(avax.gt(gun));
    expect(gun.gt(arb));
  });

  it("Should get varying bridge fees for multiple chains given different scaling factors", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "10000");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "10000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "10000");

    await inventoryManager.setScalingFactors([usdcGun, usdcArb], [2, 3]);

    const avax = await portfolioSub.getBridgeFee(
      0,
      cChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100", usdcDecimals)
    );
    const gun = await portfolioSub.getBridgeFee(
      0,
      gunzillaSubnet.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100", usdcDecimals)
    );
    const arb = await portfolioSub.getBridgeFee(
      0,
      arbitrumChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100", usdcDecimals)
    );

    expect(avax.lt(gun));
    expect(gun.lt(arb));
  });

  it("Should get similar bridge fees for multiple chains given different scaling factors and scaled quantities", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "10000");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "20000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "30000");

    await inventoryManager.setScalingFactors([usdcAvax, usdcGun, usdcArb], [1, 2, 3]);

    const avax = await portfolioSub.getBridgeFee(
      0,
      cChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100", usdcDecimals)
    );
    const gun = await portfolioSub.getBridgeFee(
      0,
      gunzillaSubnet.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100", usdcDecimals)
    );
    const arb = await portfolioSub.getBridgeFee(
      0,
      arbitrumChain.chainListOrgId,
      usdcHex,
      Utils.parseUnits("100", usdcDecimals)
    );

    expect(avax.gt(gun));
    expect(gun.eq(arb));
  });

  it("Should successfully remove if symbol does not exist in inventory", async () => {
    await inventoryManager.updatePortfolioBridgeSub(owner.address);

    const txData = inventoryManager.interface.encodeFunctionData("remove", [usdcHex, usdcAvax]);
    const txResult = await ethers.provider.call({
      to: inventoryManager.address,
      data: txData
    });
    const decodedResult = ethers.utils.defaultAbiCoder.decode(["bool"], txResult);
    expect(decodedResult[0]).to.be.equal(true);
  });

  // it("Should successfully remove if symbol does exist in inventory but is 0", async () => {
  //   await inventoryManager.setInventoryBySymbolId([usdcAvax], [0]);
  //   await inventoryManager.updatePortfolioBridgeSub(owner.address);

  //   const txData = inventoryManager.interface.encodeFunctionData("remove", [usdcHex, usdcAvax]);
  //   const txResult = await ethers.provider.call({
  //     to: inventoryManager.address,
  //     data: txData
  //   });
  //   const decodedResult = ethers.utils.defaultAbiCoder.decode(["bool"], txResult);
  //   expect(decodedResult[0]).to.be.equal(true);
  // });

  // it("Should fail to remove if symbol does exist in inventory but is not 0", async () => {
  //   await inventoryManager.setInventoryBySymbolId([usdcAvax], [10]);
  //   await inventoryManager.updatePortfolioBridgeSub(owner.address);

  //   const txData = inventoryManager.interface.encodeFunctionData("remove", [usdcHex, usdcAvax]);
  //   const txResult = await ethers.provider.call({
  //     to: inventoryManager.address,
  //     data: txData
  //   });
  //   const decodedResult = ethers.utils.defaultAbiCoder.decode(["bool"], txResult);
  //   expect(decodedResult[0]).to.be.equal(false);
  // });

  it("Should successfully get inventory by subnet symbol", async () => {
    const avaxBalance = "100000";
    const gunBalance = "1000";
    const arbBalance = "10000";
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, avaxBalance);
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, gunBalance);
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, arbBalance);

    const [symbols, inventories] = await inventoryManager.getInventoryBySubnetSymbol(usdcHex);
    expect(symbols.length).to.be.equal(3);
    expect(inventories.length).to.be.equal(3);
    expect(symbols[0]).to.be.equal(usdcAvax);
    expect(symbols[1]).to.be.equal(usdcGun);
    expect(symbols[2]).to.be.equal(usdcArb);
    expect(inventories[0]).to.be.equal(ethers.utils.parseUnits(avaxBalance, usdcDecimals));
    expect(inventories[1]).to.be.equal(ethers.utils.parseUnits(gunBalance, usdcDecimals));
    expect(inventories[2]).to.be.equal(ethers.utils.parseUnits(arbBalance, usdcDecimals));
  });
});
