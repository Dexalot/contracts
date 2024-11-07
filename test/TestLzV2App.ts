/**
 * The test runner for Dexalot LZ V2 App
 */
import Utils from './utils';

import * as f from "./MakeTestSuite";

import { DefaultBridgeAppMock, DefaultBridgeAppMock__factory, LzV2App, PortfolioBridgeMain } from "../typechain-types";
import { Contract, ethers } from "ethers";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from "chai";
import { MockContract } from '@defi-wonderland/smock';

describe("LzV2App", () => {
  let portfolioBridgeMain: PortfolioBridgeMain;
  let lzAppMain: LzV2App;
  let lzAppSub: LzV2App;
  let defaultBridgeAppMock: DefaultBridgeAppMock;
  let lzEndpointMain: Contract | MockContract<Contract>;
  let lzEndpointSub: Contract | MockContract<Contract>;

  let owner: SignerWithAddress;
  let trader1: SignerWithAddress;

  beforeEach(async () => {
    const accounts = await f.getAccounts();

    owner = accounts.owner;
    trader1 = accounts.trader1;

    const portfolioContracts = await f.deployCompletePortfolio(true);
    portfolioBridgeMain = portfolioContracts.portfolioBridgeMainnet;
    lzAppMain = portfolioContracts.lzAppMainnet;
    lzAppSub = portfolioContracts.lzAppSub;
    defaultBridgeAppMock = await new DefaultBridgeAppMock__factory(owner).deploy()
    lzEndpointMain = portfolioContracts.lzEndpointMainnet;
    lzEndpointSub = portfolioContracts.lzEndpointSub;
  });

  it("Should get the correct version", async () => {
    const version = Utils.toUtf8(await lzAppMain.VERSION());
    expect(version.split(".")[0]).to.equal("1");
  });

  it("Should fail to set portfolio bridge address if not owner", async () => {
    await expect(lzAppMain.connect(trader1).setPortfolioBridge(portfolioBridgeMain.address)).to.be.revertedWith('Ownable:');
  })

  it("Should fail to set portfolio bridge address if 0 address", async () => {
    await expect(lzAppMain.setPortfolioBridge(ethers.constants.AddressZero)).to.be.revertedWith('DB-PBNZ-01');
  })

  it("Should successfully set portfolio bridge address if owner", async () => {
    await expect(lzAppMain.setPortfolioBridge(portfolioBridgeMain.address)).to.emit(lzAppMain, 'PortfolioBridgeUpdated').withArgs(portfolioBridgeMain.address);
  })

  it("Should fail to set remote chain if not portfolio bridge", async () => {
    const { dexalotSubnet } = f.getChains();

    const blockchainID = Utils.numberToBytes32(dexalotSubnet.lzChainId);
    const remoteAddress = Utils.addressToBytes32(lzAppSub.address);
    await expect(lzAppMain.setRemoteChain(dexalotSubnet.chainListOrgId, blockchainID, remoteAddress)).to.be.revertedWith('DB-OPBA-01');
  })

  it("Should fail to send message if not portfolio bridge", async () => {
    const { dexalotSubnet } = f.getChains();

    await expect(lzAppMain.sendMessage(dexalotSubnet.chainListOrgId, ethers.constants.HashZero, 0, portfolioBridgeMain.address)).to.be.revertedWith('DB-OPBA-01');
  })

  it("Should fail to send message if remote destination not initialised", async () => {
    const { arbitrumChain } = f.getChains();

    await lzAppMain.setPortfolioBridge(owner.address);
    await expect(lzAppMain.sendMessage(arbitrumChain.chainListOrgId, ethers.constants.HashZero, 0, portfolioBridgeMain.address)).to.be.revertedWith('DB-RCNS-01');
  })

  it("Should fail to send message if enforced options not set", async () => {
    const { dexalotSubnet } = f.getChains();
    lzAppMain = await f.deployLZV2App(lzEndpointMain);

    await lzAppMain.setPortfolioBridge(portfolioBridgeMain.address);
    const bytes32DestAddr = Utils.addressToBytes32(lzAppSub.address);

    await portfolioBridgeMain.grantRole(await portfolioBridgeMain.BRIDGE_USER_ROLE(), owner.address);
    await portfolioBridgeMain.pause();
    await portfolioBridgeMain.enableBridgeProvider(0, lzAppMain.address);
    await portfolioBridgeMain.unpause();

    await portfolioBridgeMain.setTrustedRemoteAddress(0, dexalotSubnet.chainListOrgId, ethers.utils.hexZeroPad(ethers.utils.hexlify(dexalotSubnet.lzChainId), 32), bytes32DestAddr, false);
    await lzEndpointMain.setDestLzEndpoint(lzAppSub.address, lzEndpointSub.address)
    await lzAppMain.setPeer(dexalotSubnet.lzChainId, bytes32DestAddr);
    await lzAppMain.setPortfolioBridge(owner.address);

    await expect(lzAppMain.sendMessage(dexalotSubnet.chainListOrgId, ethers.constants.HashZero, 0, portfolioBridgeMain.address)).to.be.revertedWith('LZ-EONS-01');
  })

  it("Should successfully set remote chain if portfolio bridge", async () => {
    const { dexalotSubnet } = f.getChains();

    const blockchainID = Utils.numberToBytes32(dexalotSubnet.lzChainId);
    const remoteAddress = Utils.addressToBytes32(lzAppSub.address);

    await lzAppMain.setPortfolioBridge(owner.address);
    await expect(lzAppMain.setRemoteChain(dexalotSubnet.chainListOrgId, blockchainID, remoteAddress)).to.emit(lzAppMain, 'RemoteChainUpdated').withArgs(dexalotSubnet.chainListOrgId, blockchainID.toLowerCase(), remoteAddress.toLowerCase());
  })

  it("Should fail to receive message if remote chain not set", async () => {
    const { dexalotSubnet } = f.getChains();

    const blockchainID = Utils.numberToBytes32(dexalotSubnet.lzChainId);
    const remoteAddress = Utils.addressToBytes32(lzAppSub.address);
    await expect(defaultBridgeAppMock.receiveMessage(blockchainID, remoteAddress, ethers.constants.HashZero)).to.be.revertedWith('DB-RCNS-02');
  })

  it("Should fail to get bridge fee if unsupportedChain", async () => {
    await expect(lzAppMain['getBridgeFee(uint32)'](0)).to.be.revertedWith("DB-RCNS-01");
    await expect(lzAppMain['getBridgeFee(uint32,uint8)'](0, 0)).to.be.revertedWith("DB-RCNS-01");
  })

  it("Should fail to receive message if remote contract does not match", async () => {
    const { dexalotSubnet } = f.getChains();

    const blockchainID = Utils.numberToBytes32(dexalotSubnet.lzChainId);
    const remoteAddress = Utils.addressToBytes32(lzAppSub.address);
    await defaultBridgeAppMock.setPortfolioBridge(owner.address);
    await defaultBridgeAppMock.setRemoteChain(dexalotSubnet.chainListOrgId, blockchainID, remoteAddress);
    await expect(defaultBridgeAppMock.receiveMessage(blockchainID, ethers.constants.HashZero, ethers.constants.HashZero)).to.be.revertedWith('DB-RCNM-01');
  })

  it("Should get default bridge fee of 0", async () => {
    expect(await defaultBridgeAppMock['getBridgeFee(uint32)'](0)).to.equal(0);
    expect(await defaultBridgeAppMock['getBridgeFee(uint32,uint8)'](0, 0)).to.equal(0);
  })
});
