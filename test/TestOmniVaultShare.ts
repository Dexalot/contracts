/**
 * The test runner for Dexalot OmniVaultShare contract
 */
import Utils from './utils';

import * as f from "./MakeTestSuite";

import { OmniVaultShare, OmniVaultShare__factory } from "../typechain-types";
import { Contract, ethers } from "ethers";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from "chai";

describe("OmniVaultShare", () => {
  const name = "OmniVaultShare";
  const symbol = "OVS";
  let vaultShare: OmniVaultShare;
  let lzEndpoint: Contract;

  let owner: SignerWithAddress;
  let ovManager: SignerWithAddress;
  let user: SignerWithAddress

  beforeEach(async () => {
    const accounts = await f.getAccounts();

    owner = accounts.owner;
    ovManager = accounts.trader1;
    user = accounts.trader2;

    const portfolioContracts = await f.deployCompletePortfolio(true);
    lzEndpoint = portfolioContracts.lzEndpointMainnet;
    vaultShare = await new OmniVaultShare__factory(owner).deploy(lzEndpoint.address, 0);
    await vaultShare.initialize(name, symbol, owner.address);
    await vaultShare.setOmniVaultManager(ovManager.address);
  });

  it("Should get the correct version", async () => {
    const version = Utils.toUtf8(await vaultShare.VERSION());
    expect(version.split(".")[0]).to.equal("1");
  });

  it("Should fail to initialize again", async () => {
    await expect(vaultShare.initialize(name, symbol, owner.address)).to.be.revertedWith('Initializable: contract is already initialized');
  });

  it("Should fail to initialize with 0 address", async () => {
    const vaultShare2 = await new OmniVaultShare__factory(owner).deploy(lzEndpoint.address, 0);
    await expect(vaultShare2.initialize(name, symbol, ethers.constants.AddressZero)).to.be.revertedWith('VS-SAZ-01');
  })

  it("Should fail to set ov manager address if not owner", async () => {
    await expect(vaultShare.connect(user).setOmniVaultManager(ethers.constants.AddressZero)).to.be.revertedWith('Ownable: caller is not the owner');
  })

  it("Should successfully set ov manager address if owner", async () => {
    await expect(vaultShare.setOmniVaultManager(ovManager.address)).to.not.be.reverted;
    expect(await vaultShare.omniVaultManager()).to.equal(ovManager.address);
  })

  it("Should fail to mint if not omni vault manager", async () => {
    await expect(vaultShare.connect(user).mint(0, user.address, 100)).to.be.revertedWith('VS-OOV-01');
  })

  it("Should fail to burn if not omni vault manager", async () => {
    await expect(vaultShare.connect(user).burn(0, 100)).to.be.revertedWith('VS-OOV-01');
  })

  it("Should fail to mint if not valid vault id", async () => {
    await expect(vaultShare.connect(ovManager).mint(1, user.address, 100)).to.be.revertedWith('VS-IVD-01');
  })

  it("Should fail to burn if not valid vault id", async () => {
    await expect(vaultShare.connect(ovManager).burn(1, 100)).to.be.revertedWith('VS-IVD-01');
  })

  it("Should successfully mint and burn shares", async () => {
    await expect(vaultShare.connect(ovManager).mint(0, user.address, 100)).to.not.be.reverted;
    expect(await vaultShare.balanceOf(user.address)).to.equal(100);

    await vaultShare.connect(user).transfer(ovManager.address, 40)
    expect(await vaultShare.balanceOf(user.address)).to.equal(60);
    expect(await vaultShare.balanceOf(ovManager.address)).to.equal(40);

    await expect(vaultShare.connect(ovManager).burn(0, 40)).to.not.be.reverted;
    expect(await vaultShare.balanceOf(ovManager.address)).to.equal(0);
  })
});
