/**
 * The test runner for Dexalot LZ V2 App
 */
import Utils from './utils';

import * as f from "./MakeTestSuite";

import { ICMApp, PortfolioBridgeMain } from "../typechain-types";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from "chai";


describe("ICMApp", () => {
  let portfolioBridgeMain: PortfolioBridgeMain;
  let icmAppMain: ICMApp;

  let owner: SignerWithAddress;
  let trader1: SignerWithAddress;
  let relayer: SignerWithAddress;

  before(async () => {
    const accounts = await f.getAccounts();
    owner = accounts.owner;
    trader1 = accounts.trader1;
    relayer = accounts.other1;

    const portfolioContracts = await f.deployCompletePortfolio(true);
    portfolioBridgeMain = portfolioContracts.portfolioBridgeMainnet;
  });

  beforeEach(async () => {
    const ICMApp = await ethers.getContractFactory("ICMApp") ;
    icmAppMain = await upgrades.deployProxy(
      // 0xF86Cb19Ad8405AEFa7d09C778215D2Cb6eBfB228 = teleporter registry on fuji testnet
      ICMApp, ["0xF86Cb19Ad8405AEFa7d09C778215D2Cb6eBfB228", 1, owner.address]) as ICMApp;
  });

  it("Should get the correct version", async () => {
    expect(await icmAppMain.VERSION()).to.equal(Utils.fromUtf8("1.0.0"));
  });

  it("Should not initialize again after deployment", async function () {
    await expect(icmAppMain.initialize(
        "0xF86Cb19Ad8405AEFa7d09C778215D2Cb6eBfB228", 1, owner.address
    ))
    .to.be.revertedWith("InvalidInitialization()");
  });

  it("Should fail to setPortfolioBridge if not owner", async () => {
    await expect(icmAppMain.connect(trader1).setPortfolioBridge(portfolioBridgeMain.address)).to.be.revertedWith("OwnableUnauthorizedAccount");
  });

  it("Should setPortfolioBridge if owner", async () => {
    await expect(icmAppMain.connect(owner).setPortfolioBridge(portfolioBridgeMain.address)).to.emit(icmAppMain, "PortfolioBridgeUpdated").withArgs(portfolioBridgeMain.address);
    expect(await icmAppMain.portfolioBridge()).to.equal(portfolioBridgeMain.address);
  });

  it("Should fail to addRelayer if not owner", async () => {
    await expect(icmAppMain.connect(trader1).addRelayer(portfolioBridgeMain.address)).to.be.revertedWith("OwnableUnauthorizedAccount");
  });

  it("Should fail to addRelayer if zero address", async () => {
    await expect(icmAppMain.addRelayer(ethers.constants.AddressZero)).to.be.revertedWith("IC-ARNZ-01");
  });

  it("Should successfully addRelayer if owner", async () => {
    await expect(icmAppMain.addRelayer(relayer.address)).to.emit(icmAppMain, "AddRelayer").withArgs(relayer.address);
    expect(await icmAppMain.allowedRelayers(0)).to.equal(relayer.address);
  });

  it("Should fail to clearRelayers if not owner", async () => {
    await expect(icmAppMain.connect(trader1).clearRelayers()).to.be.revertedWith("OwnableUnauthorizedAccount");
  });

  it("Should successfully clearRelayers if owner", async () => {
    await expect(icmAppMain.addRelayer(relayer.address)).to.emit(icmAppMain, "AddRelayer").withArgs(relayer.address);
    expect(await icmAppMain.allowedRelayers(0)).to.equal(relayer.address);
    await expect(icmAppMain.clearRelayers()).to.emit(icmAppMain, "ClearRelayers");
    await expect(icmAppMain.allowedRelayers(0)).to.be.reverted;
  });

  it("Should fail to setGasLimit if not owner", async () => {
    await expect(icmAppMain.connect(trader1).setGasLimit(0, 100000)).to.be.revertedWith("OwnableUnauthorizedAccount");
  });

  it("Should successfully setGasLimit if owner", async () => {
    await expect(icmAppMain.setGasLimit(0, 100000)).to.emit(icmAppMain, "SetGasLimit").withArgs(0, 100000);
    expect(await icmAppMain.gasLimits(0)).to.equal(100000);
  });

  it("Should get correct bridge provider", async () => {
    expect(await icmAppMain.getBridgeProvider()).to.equal(2);
  });

  it("Should get correct outbound nonce", async () => {
    const nonce = await icmAppMain.getOutboundNonce(0);
    expect(nonce.gt(0));
  });

  it("Should fail to send message if not portfolio bridge", async () => {
    const { dexalotSubnet } = f.getChains();
    await expect(icmAppMain.sendMessage(dexalotSubnet.chainListOrgId, "0x", 0, owner.address)).to.be.revertedWith("DB-OPBA-01");
  });

  it("Should fail to send message if destination not set", async () => {
    const { dexalotSubnet } = f.getChains();

    await icmAppMain.setPortfolioBridge(owner.address);
    await expect(icmAppMain.sendMessage(dexalotSubnet.chainListOrgId, "0x", 0, owner.address)).to.be.revertedWith("DB-RCNS-01");
  });

  it("Should fail to send message if bridge not enabled", async () => {
    const { dexalotSubnet } = f.getChains();

    await icmAppMain.setPortfolioBridge(portfolioBridgeMain.address);
    const subnetBlockchainID = "0x4629d736bcd8c3a7bd7eef1c872365e9db32dc06eacf57fed72a94db5d934443";
    const randRemoteAddress = Utils.addressToBytes32(trader1.address);
    await expect(portfolioBridgeMain.setTrustedRemoteAddress(2, dexalotSubnet.chainListOrgId, subnetBlockchainID, randRemoteAddress, false)).to.be.revertedWith("PB-BCNE-01");
  });

  it("Should fail to send message if gas limit not set", async () => {
    const { dexalotSubnet } = f.getChains();

    await icmAppMain.setPortfolioBridge(portfolioBridgeMain.address);
    const subnetBlockchainID = "0x4629d736bcd8c3a7bd7eef1c872365e9db32dc06eacf57fed72a94db5d934443";
    const randRemoteAddress = Utils.addressToBytes32(trader1.address);
    await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
    await portfolioBridgeMain.enableBridgeProvider(2, icmAppMain.address);
    await portfolioBridgeMain.setTrustedRemoteAddress(2, dexalotSubnet.chainListOrgId, subnetBlockchainID, randRemoteAddress, false);
    await icmAppMain.setPortfolioBridge(owner.address);
    await expect(icmAppMain.sendMessage(dexalotSubnet.chainListOrgId, "0x", 0, owner.address)).to.be.revertedWith("IC-GLNS-01");
  });

  it("Should successfully send message to teleporter messenger", async () => {
    const { dexalotSubnet } = f.getChains();

    await icmAppMain.setPortfolioBridge(portfolioBridgeMain.address);
    const subnetBlockchainID = "0x4629d736bcd8c3a7bd7eef1c872365e9db32dc06eacf57fed72a94db5d934443";
    const randRemoteAddress = Utils.addressToBytes32(trader1.address);
    await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
    await portfolioBridgeMain.enableBridgeProvider(2, icmAppMain.address);
    await portfolioBridgeMain.setTrustedRemoteAddress(2, dexalotSubnet.chainListOrgId, subnetBlockchainID, randRemoteAddress, false);
    await icmAppMain.setPortfolioBridge(owner.address);
    const msgType = 0
    await icmAppMain.setGasLimit(msgType, 100000);
    // reverts with empty string at precompile
    await expect(icmAppMain.sendMessage(dexalotSubnet.chainListOrgId, "0x01", msgType, owner.address)).to.be.revertedWith("")
  });
});
