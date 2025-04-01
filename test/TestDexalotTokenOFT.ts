import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Create3Factory, Create3Factory__factory, DexalotTokenOFT, DexalotTokenOFT__factory, DexalotTokenOFTMinter } from "../typechain-types";
import * as f from "./MakeTestSuite";
import utils from "./utils";
import { deployments } from "hardhat";
import { Contract, ContractFactory, ethers } from "ethers";
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { expect } from "chai";


describe('DexalotTokenOFT', () => {
  let EndpointV2Mock: ContractFactory;
  let avaxLZV2Endpoint: Contract;
  let arbLZV2Endpoint: Contract;
  let baseLZV2Endpoint: Contract;
  let dexalotOftAvax: DexalotTokenOFTMinter;
  let dexalotOftArb: DexalotTokenOFT;
  let dexalotOftBase: DexalotTokenOFT;
  const {cChain, arbitrumChain, baseChain} = f.getChains();
  const testAmount = utils.parseUnits('1000', 18);

  let owner: SignerWithAddress;
  let treasurySafe: SignerWithAddress;
  // let admin: SignerWithAddress;
  let userA: SignerWithAddress;
  let userB: SignerWithAddress;
  let userC: SignerWithAddress;

  async function addBaseConnection() {
    baseLZV2Endpoint = await EndpointV2Mock.deploy(baseChain.lzChainId);
    dexalotOftBase = await f.deployDexalotTokenOFT(baseLZV2Endpoint.address);
    await avaxLZV2Endpoint.setDestLzEndpoint(dexalotOftBase.address, baseLZV2Endpoint.address);
    await arbLZV2Endpoint.setDestLzEndpoint(dexalotOftBase.address, baseLZV2Endpoint.address);
    await baseLZV2Endpoint.setDestLzEndpoint(dexalotOftAvax.address, avaxLZV2Endpoint.address);
    await baseLZV2Endpoint.setDestLzEndpoint(dexalotOftArb.address, arbLZV2Endpoint.address);
    await dexalotOftAvax.connect(owner).setPeer(baseChain.lzChainId, ethers.utils.zeroPad(dexalotOftBase.address, 32));
    await dexalotOftArb.connect(owner).setPeer(baseChain.lzChainId, ethers.utils.zeroPad(dexalotOftBase.address, 32));
    await dexalotOftBase.connect(owner).setPeer(arbitrumChain.lzChainId, ethers.utils.zeroPad(dexalotOftArb.address, 32));
    await dexalotOftBase.connect(owner).setPeer(cChain.lzChainId, ethers.utils.zeroPad(dexalotOftAvax.address, 32));
  }

  async function sendToken(from: SignerWithAddress, toAddress: string, dexalotOFT: DexalotTokenOFTMinter | DexalotTokenOFT, srcToken: Contract, dstToken: Contract, dstLzChainId: number, amount: ethers.BigNumber = testAmount, minAmount?: ethers.BigNumber) {
    await srcToken.connect(from).approve(dexalotOFT.address, amount);
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString()
    const sendParam = {
      dstEid: dstLzChainId,
      to: ethers.utils.zeroPad(toAddress, 32),
      amountLD: amount,
      minAmountLD: minAmount || amount,
      extraOptions: options,
      composeMsg: ethers.utils.zeroPad("0x", 0),
      oftCmd: ethers.utils.zeroPad("0x", 0)
    };
    const feeQuote = await dexalotOFT.connect(from).quoteSend(sendParam, false);

    const srcAlotBefore = await srcToken.balanceOf(from.address);
    const dstAlotBefore = await dstToken.balanceOf(toAddress);

    await expect(dexalotOFT.connect(from).send(sendParam, {nativeFee: feeQuote.nativeFee, lzTokenFee: 0}, from.address, { value: feeQuote.nativeFee })).to.emit(dexalotOFT, 'OFTSent');

    const srcAlotAfter = await srcToken.balanceOf(from.address);
    const dstAlotAfter = await dstToken.balanceOf(toAddress);

    expect(srcAlotAfter).to.equal(srcAlotBefore.sub(amount));
    expect(dstAlotAfter).to.equal(dstAlotBefore.add(amount));

  }

  before(async () => {
    const acc = await f.getAccounts();
    owner = acc.owner;
    userA = acc.trader1;
    userB = acc.trader2;
    userC = acc.other1;
    treasurySafe = acc.treasurySafe;

    const EndpointV2MockArtifact = await deployments.getArtifact('EndpointV2Mock');
    EndpointV2Mock = new ContractFactory(
      EndpointV2MockArtifact.abi,
      EndpointV2MockArtifact.bytecode,
      owner,
    );
  });

  beforeEach(async () => {
    avaxLZV2Endpoint = await EndpointV2Mock.deploy(cChain.lzChainId);
    arbLZV2Endpoint = await EndpointV2Mock.deploy(arbitrumChain.lzChainId);
    baseLZV2Endpoint = await EndpointV2Mock.deploy(baseChain.lzChainId);
    dexalotOftAvax = await f.deployDexalotTokenOFTMinter(avaxLZV2Endpoint.address);
    dexalotOftArb = await f.deployDexalotTokenOFT(arbLZV2Endpoint.address);

    const amount = utils.parseUnits('100000', 18);
    await dexalotOftAvax.connect(treasurySafe).transfer(owner.address, amount);
    await dexalotOftAvax.connect(treasurySafe).transfer(userA.address, amount);
    await dexalotOftAvax.connect(treasurySafe).transfer(userC.address, amount);

    // Setting destination endpoints in the LZEndpoint mock for each MyOFT instance
    await avaxLZV2Endpoint.setDestLzEndpoint(dexalotOftArb.address, arbLZV2Endpoint.address);
    await arbLZV2Endpoint.setDestLzEndpoint(dexalotOftAvax.address, avaxLZV2Endpoint.address);

    // Setting each MyOFT instance as a peer of the other in the mock LZEndpoint
    await dexalotOftAvax.connect(owner).setPeer(arbitrumChain.lzChainId, ethers.utils.zeroPad(dexalotOftArb.address, 32));
    await dexalotOftArb.connect(owner).setPeer(cChain.lzChainId, ethers.utils.zeroPad(dexalotOftAvax.address, 32));
  });

  it('should be able to transfer from avax to arb for same user', async () => {
    await sendToken(userA, userA.address, dexalotOftAvax, dexalotOftAvax, dexalotOftArb, arbitrumChain.lzChainId);
  });

  it('should be able to transfer from avax to arb for different user', async () => {
    await sendToken(userA, userB.address, dexalotOftAvax, dexalotOftAvax, dexalotOftArb, arbitrumChain.lzChainId);
  });

  it('should be able to transfer from avax to arb and back for same user', async () => {
    await sendToken(userA, userA.address, dexalotOftAvax, dexalotOftAvax, dexalotOftArb, arbitrumChain.lzChainId);

    const amount = utils.parseUnits('500', 18);
    await sendToken(userA, userA.address, dexalotOftArb, dexalotOftArb, dexalotOftAvax, cChain.lzChainId, amount);
  });

  it('should be able to transfer from avax to arb and back for different users', async () => {
    await sendToken(userA, userB.address, dexalotOftAvax, dexalotOftAvax, dexalotOftArb, arbitrumChain.lzChainId);

    const amount = utils.parseUnits('500', 18);
    await sendToken(userB, userC.address, dexalotOftArb, dexalotOftArb, dexalotOftAvax, cChain.lzChainId, amount);
  });

  it('should be able to transfer from avax to arb to base to avax for same user', async () => {
    await sendToken(userA, userA.address, dexalotOftAvax, dexalotOftAvax, dexalotOftArb, arbitrumChain.lzChainId);

    await addBaseConnection();
    await sendToken(userA, userA.address, dexalotOftArb, dexalotOftArb, dexalotOftBase, baseChain.lzChainId);

    await sendToken(userA, userA.address, dexalotOftBase, dexalotOftBase, dexalotOftAvax, cChain.lzChainId);
  });

  it('should be able to transfer from avax to arb to base to avax for different users', async () => {
    await sendToken(userA, userB.address, dexalotOftAvax, dexalotOftAvax, dexalotOftArb, arbitrumChain.lzChainId);

    await addBaseConnection();
    await sendToken(userB, userB.address, dexalotOftArb, dexalotOftArb, dexalotOftBase, baseChain.lzChainId);

    await sendToken(userB, userC.address, dexalotOftBase, dexalotOftBase, dexalotOftAvax, cChain.lzChainId);
  });

  it('should deploy DxtrOft with the correct owner from create3', async() => {
    const Create3Factory = new Create3Factory__factory(owner);
    const create3Factory: Create3Factory = await Create3Factory.deploy(owner.address) as Create3Factory;

    const OftFactory = new DexalotTokenOFT__factory(owner);
    const txReq = OftFactory.getDeployTransaction('Dexalot Token', 'DXTR', arbLZV2Endpoint.address, owner.address)

    const salt = ethers.utils.randomBytes(32);
    const addr = await create3Factory.getDeployedAddress(owner.address, salt);
    await create3Factory.deploy(salt, txReq.data!, {value: txReq.value});
    const arbOft = OftFactory.attach(addr);
    expect(await arbOft.owner()).to.equal(owner.address);
  })

  it('should fail to deploy AlotOft with incorrect correct owner from create3', async() => {
    const Create3Factory = new Create3Factory__factory(owner);
    const create3Factory: Create3Factory = await Create3Factory.deploy(owner.address) as Create3Factory;

    const OftFactory = new DexalotTokenOFT__factory(owner);
    const txReq = OftFactory.getDeployTransaction('Dexalot Token', 'DXTR', arbLZV2Endpoint.address, owner.address)

    const salt = ethers.utils.randomBytes(32);
    await expect(create3Factory.connect(userA).deploy(salt, txReq.data!, {value: txReq.value})).to.be.revertedWith('Ownable:');
  })

  it('should fail to rename symbol for non owner', async() => {
    await expect(dexalotOftAvax.connect(userA).renameSymbol('DXTR1')).to.be.revertedWith('Ownable:');
  })

  it('should successfully rename symbol for owner', async() => {
    await expect(dexalotOftAvax.connect(owner).renameSymbol('DXTR1')).to.not.be.reverted;
    expect(await dexalotOftAvax.symbol()).to.equal('DXTR1');
  })
});
