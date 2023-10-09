/**
 * The test runner for Dexalot Mainnet RFQ
 */

import Utils from './utils';


import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MainnetRFQ, MockToken } from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

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

describe("Mainnet RFQ", () => {
  let mainnetRFQ: MainnetRFQ;
  let mockUSDC: MockToken;
  let mockALOT: MockToken;

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

  let chainId: number;

  const getOrder = async (makerAsset: string, takerAsset: string, isAggregator?: boolean) => {
    const time = await f.getLatestBlockTimestamp();

    let taker = trader1.address;
    if (isAggregator) {
      taker = aggregator.address;
    }

    return {
      nonceAndMeta: taker,
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

    const network = await ethers.provider.getNetwork()
    chainId = network.chainId;

    const MainnetRFQ = await ethers.getContractFactory("MainnetRFQ");

    await expect(upgrades.deployProxy(MainnetRFQ, [
      ethers.constants.AddressZero
    ])).to.be.revertedWith("RF-SAZ-01");

    // deploy upgradeable contract
    mainnetRFQ = (await upgrades.deployProxy(MainnetRFQ, [
      signer.address
    ])) as MainnetRFQ;

    await mainnetRFQ.deployed();

    // deploy mock tokens
    mockUSDC = await f.deployMockToken("USDC", 6);
    mockALOT = await f.deployMockToken("ALOT", 18);

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


    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero);

    const signature = await toSignature(order, signer);

    await expect(
      mainnetRFQ.connect(trader1).simpleSwap(order, signature, {value: swapAmountAVAX},)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      mainnetRFQ.connect(trader1).partialSwap(order, signature, order.takerAmount, {value: swapAmountAVAX},)
    ).to.be.revertedWith("Pausable: paused");

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
    await expect(mainnetRFQ.connect(signer).setSlippageTolerance(1)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).addRebalancer(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);;
    await expect(mainnetRFQ.connect(signer).removeRebalancer(dummyAddress)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);;
    await expect(mainnetRFQ.connect(owner).removeAdmin(dummyAddress)).to.be.revertedWith("RF-ALOA-01");

    await mainnetRFQ.connect(owner).setSwapSigner(dummyAddress);
    await mainnetRFQ.connect(owner).addAdmin(dummyAddress);
    await mainnetRFQ.connect(owner).removeAdmin(dummyAddress);
    await mainnetRFQ.connect(owner).setSlippageTolerance(9800);
    expect(await mainnetRFQ.slippageTolerance()).to.be.equal(9800);

    await mainnetRFQ.connect(owner).addRebalancer(signer.address);
    await expect(mainnetRFQ.connect(owner).removeRebalancer(signer.address)).to.be.revertedWith("RF-ALOA-01");
    await mainnetRFQ.connect(owner).addRebalancer(dummyAddress);
    expect(await mainnetRFQ.connect(owner).isRebalancer(signer.address)).to.equal(true);
    await mainnetRFQ.connect(owner).removeRebalancer(signer.address);
    expect(await mainnetRFQ.connect(owner).isRebalancer(signer.address)).to.equal(false);


    // should not set to 0x0
    await expect(mainnetRFQ.connect(owner).setSwapSigner(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
    await expect(mainnetRFQ.connect(owner).addAdmin(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
    await expect(mainnetRFQ.connect(owner).addRebalancer(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
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
      trader1.address,
      mainnetRFQ.address,
      trader1.address,
      mockUSDC.address,
      mockALOT.address,
      swapAmountUSDC,
      swapAmountALOT,
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
      trader1.address,
      mainnetRFQ.address,
      trader1.address,
      mockUSDC.address,
      mockALOT.address,
      swapAmountUSDC,
      swapAmountALOT,
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
    order.nonceAndMeta = "0x01";

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
    order.nonceAndMeta = "0x02";

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

    const signature = await toSignature(order, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
          {value: swapAmountAVAX},
      )
    ).to.be.revertedWith("RF-IMS-01");

  });

  it("Only admin can send AVAX.", async () => {
    await expect(
      owner.sendTransaction({
        to: mainnetRFQ.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.revertedWith("AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0xf48fc9fa479390222c2fd5227bb7e4f7c4a85d969b82dfa11eb0954487273ab9");

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



  it("Only Rebalancer can call updateOrderExpiry", async () => {
    await expect(
      mainnetRFQ.connect(owner).updateOrderExpiry(0, 1)
    ).to.be.revertedWith("AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0xf48fc9fa479390222c2fd5227bb7e4f7c4a85d969b82dfa11eb0954487273ab9");
  });

  it("Only Rebalancer can call updateTakerAmount", async () => {
    await expect(
      mainnetRFQ.connect(owner).updateOrderMakerAmount(0, 1, 1)
    ).to.be.revertedWith("AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0xf48fc9fa479390222c2fd5227bb7e4f7c4a85d969b82dfa11eb0954487273ab9");
  });


  it("Updating expiry works", async () => {
    const time = await f.getLatestBlockTimestamp();
    const order = await getOrder(mockALOT.address, ethers.constants.AddressZero)

    const signature = await toSignature(order, signer);

    await mainnetRFQ.connect(rebalancer).updateOrderExpiry(order.nonceAndMeta, time-100)


    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
          {value: swapAmountAVAX},
      )
    ).to.be.revertedWith("RF-QE-01");


    await mainnetRFQ.connect(rebalancer).updateOrderExpiry(order.nonceAndMeta, time+100)


    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature,
          {value: swapAmountAVAX},
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      trader1.address,
      mainnetRFQ.address,
      trader1.address,
      mockALOT.address,
      ethers.constants.AddressZero,
      swapAmountALOT,
      swapAmountAVAX,
    );
  });


  it("Updating makerAmount works", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address)

    const signature = await toSignature(order, signer);


    const newMakerAmount = ethers.BigNumber.from(order.makerAmount).mul(9900).div(10000);


    await expect(
      mainnetRFQ.connect(rebalancer).updateOrderMakerAmount(order.nonceAndMeta, newMakerAmount, order.makerAmount)
    )

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          order,
          signature
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      trader1.address,
      mainnetRFQ.address,
      trader1.address,
      mockUSDC.address,
      mockALOT.address,
      newMakerAmount,
      swapAmountALOT,
    );


    expect(await mockUSDC.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).add(newMakerAmount)
    );

    expect(await mockALOT.balanceOf(trader1.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).sub(swapAmountALOT)
    );

    expect(await mockUSDC.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialUSDCBalance).sub(newMakerAmount)
    );

    expect(await mockALOT.balanceOf(mainnetRFQ.address)).to.equal(
      ethers.BigNumber.from(initialALOTBalance).add(swapAmountALOT)
    );
  });



  it("MakerAmount Slippage has a lower bounds", async () => {
    const order = await getOrder(mockUSDC.address, mockALOT.address)

    await expect(
      mainnetRFQ.connect(rebalancer).updateOrderMakerAmount(order.nonceAndMeta, 1, order.makerAmount)
    ).to.be.revertedWith("RF-TMS")

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
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQ.address);
    await mainnetRFQAttacker.deployed();

    const avaxBalance: string = Utils.parseUnits("1", 18).toString()
    await mainnetRFQ.connect(owner).addRebalancer(mainnetRFQAttacker.address);
    await expect(mainnetRFQAttacker.connect(trader1).attackClaimBalance(ethers.constants.AddressZero, avaxBalance)).to.be.revertedWith("RF-TF-01");
    await expect(mainnetRFQAttacker.connect(trader1).attackBatchClaimBalance([ethers.constants.AddressZero], [avaxBalance])).to.be.revertedWith("RF-TF-01");
  });

  it("Should test invalid reentrancy for simple swap", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQ.address);
    await mainnetRFQAttacker.deployed();

    const order = await getOrder(ethers.constants.AddressZero, mockUSDC.address);
    order.taker = mainnetRFQAttacker.address;
    const signature = await toSignature(order, signer);

    await mockUSDC.connect(trader1).approve(mainnetRFQAttacker.address, ethers.constants.MaxUint256);
    await expect(mainnetRFQAttacker.connect(trader1).attackSimpleSwap(order, signature)).to.be.revertedWith("RF-TF-01");
  });

  it("Should test invalid reentrancy for multi swap", async () => {
    const MainnetRFQAttacker = await ethers.getContractFactory("MainnetRFQAttacker");
    const mainnetRFQAttacker = await MainnetRFQAttacker.deploy(mainnetRFQ.address);
    await mainnetRFQAttacker.deployed();

    const order = await getOrder(ethers.constants.AddressZero, mockUSDC.address);
    order.taker = mainnetRFQAttacker.address;
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
      trader1.address,
      mainnetRFQ.address,
      trader1.address,
      mockUSDC.address,
      mockALOT.address,
      swapAmountUSDC,
      swapAmountALOT,
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
      trader1.address,
      mainnetRFQ.address,
      trader1.address,
      mockUSDC.address,
      mockALOT.address,
      swapAmountUSDC,
      newTakerAmount,
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
      trader1.address,
      mainnetRFQ.address,
      trader1.address,
      mockUSDC.address,
      mockALOT.address,
      expectedMakerAmount,
      expectedTakerAmount,
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
      trader1.address,
      mainnetRFQ.address,
      trader1.address,
      mockUSDC.address,
      mockALOT.address,
      expectedMakerAmount,
      expectedTakerAmount,
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
});
