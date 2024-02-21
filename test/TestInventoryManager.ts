import Utils from "./utils";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  InventoryManager,
  MockToken,
  PortfolioBridgeSub,
  PortfolioMain,
  PortfolioSub
} from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("InventoryManager", () => {
  let mockUSDC: MockToken;
  let inventoryManager: InventoryManager;
  let portfolioSub: PortfolioSub;
  let portfolioAvax: PortfolioMain;
  let portfolioArb: PortfolioMain;
  let portfolioGun: PortfolioMain;
  let portfolioBridgeSub: PortfolioBridgeSub;

  const { cChain, gunzillaSubnet, arbitrumChain } = f.getChains();

  const usdcHex = Utils.fromUtf8("USDC");
  const usdcDecimals = 6;
  const usdcAvax = Utils.fromUtf8("USDC" + cChain.chainListOrgId);
  const usdcArb = Utils.fromUtf8("USDC" + arbitrumChain.chainListOrgId);
  const usdcGun = Utils.fromUtf8("USDC" + gunzillaSubnet.chainListOrgId);

  const initialUSDCBalance: string = Utils.parseUnits("100000000000000", 6).toString();
  const lowUSDCBalance: string = Utils.parseUnits("100", 6).toString();
  const mediumUSDCBalance: string = Utils.parseUnits("10000", 6).toString();
  const highUSDCBalance: string = Utils.parseUnits("100000", 6).toString();

  let owner: SignerWithAddress;
  let trader1: SignerWithAddress;
  let trader2: SignerWithAddress;

  beforeEach(async function () {
    const accounts = await f.getAccounts();

    owner = accounts.owner;
    trader1 = accounts.trader1;
    trader2 = accounts.trader2;

    const portfolioContracts = await f.deployCompleteMultiChainPortfolio(true);

    // deploy upgradeable contract
    inventoryManager = portfolioContracts.inventoryManager;
    portfolioSub = portfolioContracts.portfolioSub;
    portfolioAvax = portfolioContracts.portfolioAvax;
    portfolioArb = portfolioContracts.portfolioArb;
    portfolioGun = portfolioContracts.portfolioGun;
    portfolioBridgeSub = portfolioContracts.portfolioBridgeSub;
    const inventoryManagerAddr = await portfolioBridgeSub.inventoryManager();

    // deploy mock tokens
    mockUSDC = await f.deployMockToken("USDC", 6);

    await f.addToken(portfolioAvax, portfolioSub, mockUSDC, 0.5, 0, true, 0); //gasSwapRatio 10
    await f.addToken(portfolioArb, portfolioSub, mockUSDC, 0.5, 0, true, 0); //gasSwapRatio 10
    await f.addToken(portfolioGun, portfolioSub, mockUSDC, 0.5, 0, true, 0); //gasSwapRatio 10

    // mint to trader
    await mockUSDC.mint(trader1.address, initialUSDCBalance);

    // approve tokens
    await mockUSDC.connect(trader1).approve(portfolioAvax.address, ethers.constants.MaxUint256);
    await mockUSDC.connect(trader1).approve(portfolioArb.address, ethers.constants.MaxUint256);
    await mockUSDC.connect(trader1).approve(portfolioGun.address, ethers.constants.MaxUint256);
  });

  it("Should not initialize again after deployment", async function () {
    await expect(inventoryManager.initialize(
        "0x0000000000000000000000000000000000000000",
        0
    ))
    .to.be.revertedWith("Initializable: contract is already initialized");
  });

  it("Should fail to modify inventory if not PortfolioBridge", async function () {
    await expect(inventoryManager.increment(ethers.constants.HashZero, ethers.constants.HashZero, 0))
    .to.be.revertedWith("AccessControl:");
    await expect(inventoryManager.decrement(ethers.constants.HashZero, ethers.constants.HashZero, 0))
    .to.be.revertedWith("AccessControl:");
    await expect(inventoryManager.remove(ethers.constants.HashZero, ethers.constants.HashZero))
    .to.be.revertedWith("AccessControl:");
    await expect(inventoryManager.convertSymbol(ethers.constants.HashZero, ethers.constants.HashZero, ethers.constants.HashZero))
    .to.be.revertedWith("AccessControl:");
  });

  it("Should fail to set inventory if not Admin", async function () {
    await expect(inventoryManager.connect(trader1).setInventoryBySymbolId([], []))
    .to.be.revertedWith("AccessControl:");
  });

  it("Should fail to set PortfolioBridgeSub if not Admin", async function () {
    await expect(inventoryManager.connect(trader1).updatePortfolioBridgeSub(ethers.constants.AddressZero))
    .to.be.revertedWith("AccessControl:");
  });

  it("Should fail to set PortfolioBridgeSub as an empty address", async function () {
    await expect(inventoryManager.updatePortfolioBridgeSub(ethers.constants.AddressZero))
    .to.be.revertedWith("IM-ZADDR-01");

    const InventoryManager = await ethers.getContractFactory("InventoryManager") ;
    await expect(upgrades.deployProxy(InventoryManager, [ethers.constants.AddressZero, 256]))
    .to.be.revertedWith("IM-ZADDR-01");
  });

  it("Should update PortfolioBridgeSub correctly", async function () {
    const dummyAddress = trader1.address
    await expect(inventoryManager.updatePortfolioBridgeSub(trader1.address)).to.not.be.reverted;

    expect(await inventoryManager.portfolioBridgeSub()).to.be.equal(dummyAddress);
  });

  it("Should fail to set A if not Admin", async function () {
    await expect(inventoryManager.connect(trader1).updateA(0))
    .to.be.revertedWith("AccessControl:");
  });

  it("Should fail to set A to 0", async function () {
    await expect(inventoryManager.updateA(0))
    .to.be.revertedWith("IM-ZVFA-01");
  });

  it("Should update A correctly", async function () {
    const newA = 50;
    await expect(inventoryManager.updateA(newA)).to.not.be.reverted;

    expect(await inventoryManager.A()).to.be.equal(newA);
  });

  it("Should set InventoryBySymbolId correctly", async () => {
    const { cChain } = f.getChains();

    const AVAX = Utils.fromUtf8("AVAX");
    const ALOT = Utils.fromUtf8("ALOT");
    const NEX = Utils.fromUtf8("NEX");
    const AlotId =Utils.fromUtf8("ALOT" + cChain.chainListOrgId )
    const AvaxId = Utils.fromUtf8("AVAX" + cChain.chainListOrgId)
    const NonExistentId=Utils.fromUtf8("NEX" + cChain.chainListOrgId )
    const tokens = [AlotId, AvaxId, NonExistentId ];
    const quantity1 = Utils.toWei('99');
    const quantity2 = Utils.toWei('75');
    const quantities  = [quantity1, quantity2, quantity2];

    await portfolioBridgeSub.addToken(ALOT, ethers.constants.AddressZero, cChain.chainListOrgId, 18, 0, ALOT, 0);

    await expect(inventoryManager.setInventoryBySymbolId(tokens,[quantity1]))
        .to.be.revertedWith("IM-LENM-01");
    // // success for owner
    await inventoryManager.setInventoryBySymbolId(tokens, quantities);
    await expect(inventoryManager.setInventoryBySymbolId([AlotId], [quantity1]))
        .to.be.revertedWith("IM-SIAE-01");
    expect(await inventoryManager.get(ALOT, AlotId)).to.be.equal(quantity1);
    expect(await inventoryManager.get(AVAX, AvaxId)).to.be.equal(quantity2);
    // non existent, not set 0 qty
    expect(await inventoryManager.get(NEX, NonExistentId)).to.be.equal(0);
  });

  it("Should fail to convert symbol if empty symbol", async () => {
    await inventoryManager.grantRole(await portfolioSub.PORTFOLIO_BRIDGE_ROLE(), owner.address);
    await expect(inventoryManager.convertSymbol(ethers.constants.HashZero, ethers.constants.HashZero, ethers.constants.HashZero))
    .to.be.revertedWith("IM-SMEB-01");
    await expect(inventoryManager.convertSymbol(ethers.constants.HashZero, Utils.fromUtf8("USDC"), ethers.constants.HashZero))
    .to.be.revertedWith("IM-SMEB-01");
  });

  it("Should successfully convert symbol if no inventory", async () => {
    await inventoryManager.grantRole(await portfolioSub.PORTFOLIO_BRIDGE_ROLE(), owner.address);
    await expect(inventoryManager.convertSymbol(usdcAvax, usdcHex, Utils.fromUtf8("NEW")))
    .to.not.be.reverted;
  });

  it("Should successfully convert symbol if inventory", async () => {
    await inventoryManager.grantRole(await portfolioSub.PORTFOLIO_BRIDGE_ROLE(), owner.address);
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");

    const depositQuantity = Utils.parseUnits("100000", usdcDecimals);
    expect(await inventoryManager.get(usdcHex, usdcAvax)).to.be.equal(depositQuantity);

    const newToken = Utils.fromUtf8("NEW");
    await expect(inventoryManager.convertSymbol(usdcAvax, usdcHex, newToken))
    .to.not.be.reverted;
    expect(await inventoryManager.get(usdcHex, usdcAvax)).to.be.equal(0);
    expect(await inventoryManager.get(newToken, usdcAvax)).to.be.equal(depositQuantity);
  });

  it("Should fail to get withdrawal fee for multiple chain if quantity exceeds inventory", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "100000");

    const quantity = Utils.parseUnits("100001", usdcDecimals);

    await expect(inventoryManager.calculateWithdrawalFee(usdcHex, usdcAvax, quantity))
    .to.be.revertedWith("IM-INVT-02");
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

    const tx = await inventoryManager.setInventoryBySymbolId([usdcGun], [0]);
    await tx.wait();
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
    const all = await portfolioSub.getAllBridgeFees(usdcHex, quantity);
    const chainIds = [];
    const fees = [];
    let j = 0;
    const chainIdToIndex: {[key: number]: number} = {};
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

    expect(chainIds.length).to.be.equal(3);
    expect(fees.length).to.be.equal(3);
    expect(chainIds.includes(cChain.chainListOrgId));
    expect(chainIds.includes(gunzillaSubnet.chainListOrgId));
    expect(chainIds.includes(arbitrumChain.chainListOrgId));
    expect(fees[chainIdToIndex[cChain.chainListOrgId]].eq(avax));
    expect(fees[chainIdToIndex[gunzillaSubnet.chainListOrgId]].eq(gun));
    expect(fees[chainIdToIndex[arbitrumChain.chainListOrgId]].eq(arb));

    expect(avax.gt(gun));
    expect(gun.gt(arb));
  });


  it("Should get varying bridge fees for multiple chains given extreme different inventory", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "1");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "10");
    const quantity = Utils.parseUnits("10000", usdcDecimals);

    const avax = await portfolioSub.getBridgeFee(0, cChain.chainListOrgId, usdcHex, Utils.parseUnits("1", usdcDecimals));
    const gun = await portfolioSub.getBridgeFee(0, gunzillaSubnet.chainListOrgId, usdcHex, Utils.parseUnits("100000", usdcDecimals));
    const arb = await portfolioSub.getBridgeFee(0, arbitrumChain.chainListOrgId, usdcHex, Utils.parseUnits("10", usdcDecimals));

    expect(avax.gt(gun));
    expect(gun.gt(arb));
  });

  it("Should get varying bridge fees for multiple chains given extreme different inventory and low A", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "1");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "10");
    await inventoryManager.updateA(1);

    const avax = await portfolioSub.getBridgeFee(0, cChain.chainListOrgId, usdcHex, Utils.parseUnits("1", usdcDecimals));
    const gun = await portfolioSub.getBridgeFee(0, gunzillaSubnet.chainListOrgId, usdcHex, Utils.parseUnits("100000", usdcDecimals));
    const arb = await portfolioSub.getBridgeFee(0, arbitrumChain.chainListOrgId, usdcHex, Utils.parseUnits("10", usdcDecimals));

    expect(avax.gt(gun));
    expect(gun.gt(arb));
  });

  it("Should get varying bridge fees for multiple chains given extreme different inventory and large A", async () => {
    await f.depositToken(portfolioAvax, trader1, mockUSDC, usdcDecimals, usdcHex, "1");
    await f.depositToken(portfolioGun, trader1, mockUSDC, usdcDecimals, usdcHex, "100000000");
    await f.depositToken(portfolioArb, trader1, mockUSDC, usdcDecimals, usdcHex, "10");
    await inventoryManager.updateA(999999);

    const avax = await portfolioSub.getBridgeFee(0, cChain.chainListOrgId, usdcHex, Utils.parseUnits("1", usdcDecimals));
    const gun = await portfolioSub.getBridgeFee(0, gunzillaSubnet.chainListOrgId, usdcHex, Utils.parseUnits("100000", usdcDecimals));
    const arb = await portfolioSub.getBridgeFee(0, arbitrumChain.chainListOrgId, usdcHex, Utils.parseUnits("10", usdcDecimals));

    expect(avax.gt(gun));
    expect(gun.gt(arb));
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

  it("Should successfully remove if symbol does exist in inventory but is 0", async () => {
    await inventoryManager.setInventoryBySymbolId([usdcAvax], [0]);
    await inventoryManager.updatePortfolioBridgeSub(owner.address);

    const txData = inventoryManager.interface.encodeFunctionData("remove", [usdcHex, usdcAvax]);
    const txResult = await ethers.provider.call({
      to: inventoryManager.address,
      data: txData
    });
    const decodedResult = ethers.utils.defaultAbiCoder.decode(["bool"], txResult);
    expect(decodedResult[0]).to.be.equal(true);
  });

  it("Should fail to remove if symbol does exist in inventory but is not 0", async () => {
    await inventoryManager.setInventoryBySymbolId([usdcAvax], [10]);
    await inventoryManager.updatePortfolioBridgeSub(owner.address);

    const txData = inventoryManager.interface.encodeFunctionData("remove", [usdcHex, usdcAvax]);
    const txResult = await ethers.provider.call({
      to: inventoryManager.address,
      data: txData
    });
    const decodedResult = ethers.utils.defaultAbiCoder.decode(["bool"], txResult);
    expect(decodedResult[0]).to.be.equal(false);
  });
});
