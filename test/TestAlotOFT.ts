import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { AlotOFT, AlotOFT__factory, AlotOFTAdapter, AlotOFTAdapter__factory, Create3Factory, Create3Factory__factory, MockToken } from "../typechain-types";
import * as f from "./MakeTestSuite";
import utils from "./utils";
import { deployments } from "hardhat";
import { Contract, ContractFactory, ethers } from "ethers";
import { Options } from '@layerzerolabs/lz-v2-utilities'
import { expect } from "chai";


describe('AlotOFT', () => {
  let alotToken: MockToken;
  let EndpointV2Mock: ContractFactory;
  let avaxLZV2Endpoint: Contract;
  let arbLZV2Endpoint: Contract;
  let baseLZV2Endpoint: Contract;
  let alotOftAvax: AlotOFTAdapter;
  let alotOftArb: AlotOFT;
  let alotOftBase: AlotOFT;
  const {cChain, arbitrumChain, baseChain} = f.getChains();
  const testAmount = utils.parseUnits('1000', 18);

  let owner: SignerWithAddress;
  // let admin: SignerWithAddress;
  let userA: SignerWithAddress;
  let userB: SignerWithAddress;
  let userC: SignerWithAddress;

  async function addBaseConnection() {
    baseLZV2Endpoint = await EndpointV2Mock.deploy(baseChain.lzChainId);
    alotOftBase = await f.deployAlotOFT(baseLZV2Endpoint.address, alotToken!);
    await avaxLZV2Endpoint.setDestLzEndpoint(alotOftBase.address, baseLZV2Endpoint.address);
    await arbLZV2Endpoint.setDestLzEndpoint(alotOftBase.address, baseLZV2Endpoint.address);
    await baseLZV2Endpoint.setDestLzEndpoint(alotOftAvax.address, avaxLZV2Endpoint.address);
    await baseLZV2Endpoint.setDestLzEndpoint(alotOftArb.address, arbLZV2Endpoint.address);
    await alotOftAvax.connect(owner).setPeer(baseChain.lzChainId, ethers.utils.zeroPad(alotOftBase.address, 32));
    await alotOftArb.connect(owner).setPeer(baseChain.lzChainId, ethers.utils.zeroPad(alotOftBase.address, 32));
    await alotOftBase.connect(owner).setPeer(arbitrumChain.lzChainId, ethers.utils.zeroPad(alotOftArb.address, 32));
    await alotOftBase.connect(owner).setPeer(cChain.lzChainId, ethers.utils.zeroPad(alotOftAvax.address, 32));
  }

  async function sendToken(from: SignerWithAddress, toAddress: string, alotOFT: AlotOFTAdapter | AlotOFT, srcToken: Contract, dstToken: Contract, dstLzChainId: number, amount: ethers.BigNumber = testAmount, minAmount?: ethers.BigNumber) {
    await srcToken.connect(from).approve(alotOFT.address, amount);
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
    const feeQuote = await alotOFT.connect(from).quoteSend(sendParam, false);

    const srcAlotBefore = await srcToken.balanceOf(from.address);
    const dstAlotBefore = await dstToken.balanceOf(toAddress);

    await expect(alotOFT.connect(from).send(sendParam, {nativeFee: feeQuote.nativeFee, lzTokenFee: 0}, from.address, { value: feeQuote.nativeFee })).to.emit(alotOFT, 'OFTSent');

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

    const EndpointV2MockArtifact = await deployments.getArtifact('EndpointV2Mock');
    EndpointV2Mock = new ContractFactory(
      EndpointV2MockArtifact.abi,
      EndpointV2MockArtifact.bytecode,
      owner,
    );
  });

  beforeEach(async () => {
    alotToken = await f.deployMockToken("ALOT", 18);

    const amount = utils.parseUnits('100000', 18);
    await alotToken.mint(owner.address, amount);
    await alotToken.mint(userA.address, amount);
    await alotToken.mint(userC.address, amount);

    avaxLZV2Endpoint = await EndpointV2Mock.deploy(cChain.lzChainId);
    arbLZV2Endpoint = await EndpointV2Mock.deploy(arbitrumChain.lzChainId);
    baseLZV2Endpoint = await EndpointV2Mock.deploy(baseChain.lzChainId);
    alotOftAvax = await f.deployAlotOFTAdapter(avaxLZV2Endpoint.address, alotToken!);
    alotOftArb = await f.deployAlotOFT(arbLZV2Endpoint.address, alotToken!);

    // Setting destination endpoints in the LZEndpoint mock for each MyOFT instance
    await avaxLZV2Endpoint.setDestLzEndpoint(alotOftArb.address, arbLZV2Endpoint.address);
    await arbLZV2Endpoint.setDestLzEndpoint(alotOftAvax.address, avaxLZV2Endpoint.address);

    // Setting each MyOFT instance as a peer of the other in the mock LZEndpoint
    await alotOftAvax.connect(owner).setPeer(arbitrumChain.lzChainId, ethers.utils.zeroPad(alotOftArb.address, 32));
    await alotOftArb.connect(owner).setPeer(cChain.lzChainId, ethers.utils.zeroPad(alotOftAvax.address, 32));
  });

  it('should be able to transfer from avax to arb for same user', async () => {
    await sendToken(userA, userA.address, alotOftAvax, alotToken, alotOftArb, arbitrumChain.lzChainId);
  });

  it('should be able to transfer from avax to arb for different user', async () => {
    await sendToken(userA, userB.address, alotOftAvax, alotToken, alotOftArb, arbitrumChain.lzChainId);
  });

  it('should be able to transfer from avax to arb and back for same user', async () => {
    await sendToken(userA, userA.address, alotOftAvax, alotToken, alotOftArb, arbitrumChain.lzChainId);

    const amount = utils.parseUnits('500', 18);
    await sendToken(userA, userA.address, alotOftArb, alotOftArb, alotToken, cChain.lzChainId, amount);
  });

  it('should be able to transfer from avax to arb and back for different users', async () => {
    await sendToken(userA, userB.address, alotOftAvax, alotToken, alotOftArb, arbitrumChain.lzChainId);

    const amount = utils.parseUnits('500', 18);
    await sendToken(userB, userC.address, alotOftArb, alotOftArb, alotToken, cChain.lzChainId, amount);
  });

  it('should be able to transfer from avax to arb to base to avax for same user', async () => {
    await sendToken(userA, userA.address, alotOftAvax, alotToken, alotOftArb, arbitrumChain.lzChainId);

    await addBaseConnection();
    await sendToken(userA, userA.address, alotOftArb, alotOftArb, alotOftBase, baseChain.lzChainId);

    await sendToken(userA, userA.address, alotOftBase, alotOftBase, alotToken, cChain.lzChainId);
  });

  it('should be able to transfer from avax to arb to base to avax for different users', async () => {
    await sendToken(userA, userB.address, alotOftAvax, alotToken, alotOftArb, arbitrumChain.lzChainId);

    await addBaseConnection();
    await sendToken(userB, userB.address, alotOftArb, alotOftArb, alotOftBase, baseChain.lzChainId);

    await sendToken(userB, userC.address, alotOftBase, alotOftBase, alotToken, cChain.lzChainId);
  });

  it('should deploy AlotOft with the correct owner from create3', async() => {
    const Create3Factory = new Create3Factory__factory(owner);
    const create3Factory: Create3Factory = await Create3Factory.deploy(owner.address) as Create3Factory;

    const OftFactory = new AlotOFT__factory(owner);
    const txReq = OftFactory.getDeployTransaction('ALOT Token', 'ALOT', arbLZV2Endpoint.address, owner.address)

    const salt = ethers.utils.randomBytes(32);
    const addr = await create3Factory.getDeployedAddress(owner.address, salt);
    await create3Factory.deploy(salt, txReq.data!, {value: txReq.value});
    const arbOft = OftFactory.attach(addr);
    expect(await arbOft.owner()).to.equal(owner.address);
  })

  it('should deploy AlotOftAdapter with the correct owner from create3', async() => {
    const Create3Factory = new Create3Factory__factory(owner);
    const create3Factory: Create3Factory = await Create3Factory.deploy(owner.address) as Create3Factory;

    const OftAdapterFactor = new AlotOFTAdapter__factory(owner);
    const txReq = OftAdapterFactor.getDeployTransaction(alotToken.address, avaxLZV2Endpoint.address, owner.address)

    const salt = ethers.utils.randomBytes(32);
    const addr = await create3Factory.getDeployedAddress(owner.address, salt);
    await create3Factory.deploy(salt, txReq.data!, {value: txReq.value});
    const avaxOft = OftAdapterFactor.attach(addr);
    expect(await avaxOft.owner()).to.equal(owner.address);
  })

  it('should fail to deploy AlotOft with incorrect correct owner from create3', async() => {
    const Create3Factory = new Create3Factory__factory(owner);
    const create3Factory: Create3Factory = await Create3Factory.deploy(owner.address) as Create3Factory;

    const OftFactory = new AlotOFT__factory(owner);
    const txReq = OftFactory.getDeployTransaction('ALOT Token', 'ALOT', arbLZV2Endpoint.address, owner.address)

    const salt = ethers.utils.randomBytes(32);
    await expect(create3Factory.connect(userA).deploy(salt, txReq.data!, {value: txReq.value})).to.be.revertedWith('Ownable:');
  })
});
