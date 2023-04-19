/**
 * The test runner for Dexalot Mainnet RFQ
 */

import Utils from './utils';


import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MainnetRFQ, MockToken } from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';



interface Quote {
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

  let rebalancer: SignerWithAddress;
  let signer: SignerWithAddress;

  let chainId: number;


  async function toSignature(quote: Quote, txSigner: SignerWithAddress) {

    const domain = {
      name: "Dexalot",
      version: ethers.utils.parseBytes32String(await mainnetRFQ.VERSION()),
      chainId: chainId,
      verifyingContract: mainnetRFQ.address,
    };

    const types = {
      Quote: [
        { name: "nonceAndMeta", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "makerAsset", type: "address" },
        { name: "takerAsset", type: "address" },
        { name: "maker", type: "address" },
        { name: "taker", type: "address" },
        { name: "makerAmount", type: "uint256" },
        { name: "takerAmount", type: "uint256" },
      ],
    };

    const signature = await txSigner._signTypedData(domain, types, quote);
    return signature;
  }




  beforeEach(async function () {
    const { owner, other1: _signer,  trader1 } = await f.getAccounts();

    signer = _signer;
    rebalancer = signer;

    const network = await ethers.provider.getNetwork()
    chainId = network.chainId;


    const MainnetRFQ = await ethers.getContractFactory("MainnetRFQ");

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

    // approve tokens
    await mockUSDC.connect(trader1).approve(mainnetRFQ.address, ethers.constants.MaxUint256);
    await mockALOT.connect(trader1).approve(mainnetRFQ.address, ethers.constants.MaxUint256);
  });

  it("Should not initialize again after deployment", async function () {
    await expect(mainnetRFQ.initialize(
        "0x0000000000000000000000000000000000000000",
    ))
    .to.be.revertedWith("Initializable: contract is already initialized");
  });

  it("Should deploy correctly", async () => {
    const { owner, other1: signer } = await f.getAccounts();

    expect(await mainnetRFQ.callStatic.swapSigner()).to.equal(signer.address);
    expect(await mainnetRFQ.isAdmin(owner.address)).to.equal(true);
  });

  it("Should be able to pause/unpause", async () => {
    const { owner, trader1 } = await f.getAccounts();

    expect(await mainnetRFQ.paused()).to.equal(false);

    // fail for non-owner
    await expect(mainnetRFQ.connect(trader1).pause()).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);

    await mainnetRFQ.connect(owner).pause();

    expect(await mainnetRFQ.paused()).to.equal(true);

    // fail for non-owner
    await expect(mainnetRFQ.connect(trader1).unpause()).to.be.revertedWith(`AccessControl: account ${trader1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);


    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: mockALOT.address,
      takerAsset: ethers.constants.AddressZero,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountALOT,
      takerAmount: swapAmountAVAX,
    };



    const signature = await toSignature(quote, signer);

    await expect(
      mainnetRFQ.connect(trader1).simpleSwap(quote, signature, {value: swapAmountAVAX},)
    ).to.be.revertedWith("Pausable: paused");

    await mainnetRFQ.connect(owner).unpause();

    expect(await mainnetRFQ.paused()).to.equal(false);
  });

  it("Should be able to set everything correctly", async () => {
    const { owner, other1: signer, other2: rebalancer } = await f.getAccounts();

    // fail for non-owner
    await expect(mainnetRFQ.connect(signer).setSwapSigner(rebalancer.address)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).setRebalancer(rebalancer.address)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).addAdmin(rebalancer.address)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).removeAdmin(rebalancer.address)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).addTrustedContract(rebalancer.address, "ps")).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(signer).removeTrustedContract(rebalancer.address)).to.be.revertedWith(`AccessControl: account ${signer.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    await expect(mainnetRFQ.connect(owner).removeAdmin(rebalancer.address)).to.be.revertedWith("RF-ALOA-01");


    await mainnetRFQ.connect(owner).setSwapSigner(rebalancer.address);
    await mainnetRFQ.connect(owner).setRebalancer(rebalancer.address);
    await mainnetRFQ.connect(owner).addAdmin(rebalancer.address);
    await mainnetRFQ.connect(owner).removeAdmin(rebalancer.address);
    await mainnetRFQ.connect(owner).addTrustedContract(rebalancer.address, "ps")
    await mainnetRFQ.connect(owner).removeTrustedContract(rebalancer.address)


    // should not set to 0x0
    await expect(mainnetRFQ.connect(owner).setSwapSigner(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");
    await expect(mainnetRFQ.connect(owner).setRebalancer(ethers.constants.AddressZero)).to.be.revertedWith("RF-SAZ-01");

  });


  it("Should trade two tokens", async () => {

    const { other1: signer, trader1 } = await f.getAccounts();

    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: mockUSDC.address,
      takerAsset: mockALOT.address,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountUSDC,
      takerAmount: swapAmountALOT,
    };


    const signature = await toSignature(quote, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          quote,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
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
    const { other1: signer, trader1 } = await f.getAccounts();

    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: ethers.constants.AddressZero,
      takerAsset: mockALOT.address,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountAVAX,
      takerAmount: swapAmountALOT,
    };

    const signature = await toSignature(quote, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        quote,
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
    const { other1: signer, trader1 } = await f.getAccounts();

    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: mockALOT.address,
      takerAsset: ethers.constants.AddressZero,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountALOT,
      takerAmount: swapAmountAVAX,
    };


    const signature = await toSignature(quote, signer);

    const t1AVAXBalance = await ethers.provider.getBalance(trader1.address);

    const tx =  await mainnetRFQ.connect(trader1).simpleSwap(
        quote,
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

  it("Should not trade with expired quote", async () => {
    const { other1: signer, trader1 } = await f.getAccounts();

    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time - 120,
      makerAsset: mockALOT.address,
      takerAsset: ethers.constants.AddressZero,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountALOT,
      takerAmount: swapAmountAVAX,
    };

    const signature = await toSignature(quote, signer);

    await expect(mainnetRFQ.connect(trader1).simpleSwap(quote, signature, {value: swapAmountAVAX},)).to.be.revertedWith("RF-QE-01");

  });

  it("Should not trade with invalid nonce", async () => {
    const { other1: signer, trader1 } = await f.getAccounts();

    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: mockUSDC.address,
      takerAsset: mockALOT.address,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountUSDC,
      takerAmount: swapAmountALOT,
    };


    const signature = await toSignature(quote, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          quote,
          signature,
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
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
          quote,
          signature,
      )
    ).to.be.revertedWith("RF-IN-01");
  });

  it("Should not trade with invalid signature", async () => {
    const { other1: signer, trader1 } = await f.getAccounts();

    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: mockUSDC.address,
      takerAsset: mockALOT.address,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountUSDC,
      takerAmount: swapAmountALOT,
    };

    const signature = await toSignature(quote, trader1);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          quote,
          signature,
      )
    ).to.be.revertedWith("RF-IS-01");
  });

  it("Should not trade with undervalued transaction", async () => {
    const { other1: signer, trader1 } = await f.getAccounts();

    const time = await f.getLatestBlockTimestamp();

    // when taker is avax
    let quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: mockALOT.address,
      takerAsset: ethers.constants.AddressZero,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountALOT,
      takerAmount: swapAmountAVAX,
    };


    let signature = await toSignature(quote, signer);

    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          quote,
          signature,
          {value: ethers.BigNumber.from(swapAmountAVAX).sub(1)},
      )
    ).to.be.revertedWith("RF-IMV-01"); // With("0x522d4953412d3031")


    await mockALOT.connect(trader1).approve(mainnetRFQ.address, 0);

    // when maker is avax
    quote = {
      nonceAndMeta: "0x01",
      expiry: time + 120,
      makerAsset: ethers.constants.AddressZero,
      takerAsset: mockALOT.address,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountAVAX,
      takerAmount: swapAmountALOT,
    };


    signature = await toSignature(quote, signer);



    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          quote,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");




    // when maker & taker erc20

    await mockUSDC.connect(trader1).approve(mainnetRFQ.address, 0);

    quote = {
      nonceAndMeta: "0x02",
      expiry: time + 120,
      makerAsset: mockALOT.address,
      takerAsset: mockUSDC.address,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountALOT,
      takerAmount: swapAmountUSDC,
    };


    signature = await toSignature(quote, signer);


    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          quote,
          signature,
      )
    ).to.be.revertedWith("ERC20: insufficient allowance");




  });

  it("Should not trade if msg.sender != _quote.taker", async () => {
    const { other1: signer, trader1 } = await f.getAccounts();

    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: mockALOT.address,
      takerAsset: ethers.constants.AddressZero,
      maker: mainnetRFQ.address,
      taker: signer.address,
      makerAmount: swapAmountALOT,
      takerAmount: swapAmountAVAX,
    };



    const signature = await toSignature(quote, signer);




    await expect(
        mainnetRFQ.connect(trader1).simpleSwap(
          quote,
          signature,
          {value: swapAmountAVAX},
      )
    ).to.be.revertedWith("RF-IMS-01");

  });


  it("Whitelisted address can make trade when msg.sender != _quote.taker", async () => {
    const { owner, other1: signer, trader1 } = await f.getAccounts();

    await mainnetRFQ.addTrustedContract(signer.address, "ps");

    expect(
      await mainnetRFQ.isTrustedContract(signer.address)
    ).to.equal(true);

    const time = await f.getLatestBlockTimestamp();


    const quote: Quote = {
      nonceAndMeta: trader1.address,
      expiry: time + 120,
      makerAsset: mockALOT.address,
      takerAsset: ethers.constants.AddressZero,
      maker: mainnetRFQ.address,
      taker: trader1.address,
      makerAmount: swapAmountALOT,
      takerAmount: swapAmountAVAX,
    };


    const signature = await toSignature(quote, signer);

    await expect(
        mainnetRFQ.connect(signer).simpleSwap(
          quote,
          signature,
          {value: swapAmountAVAX},
      )
    ).to.emit(mainnetRFQ, "SwapExecuted")
    .withArgs(
      mainnetRFQ.address,
      trader1.address,
      mockALOT.address,
      ethers.constants.AddressZero,
      swapAmountALOT,
      swapAmountAVAX,
    );

  });


  it("Only admin can send AVAX.", async () => {
    const { owner, other1: signer, other1: rebalancer } = await f.getAccounts();

    await expect(
      owner.sendTransaction({
        to: mainnetRFQ.address,
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.revertedWith("RF-OCR-01");

    rebalancer.sendTransaction({
      to: mainnetRFQ.address,
      value: ethers.utils.parseEther("1"),
    })

  });

  it("Rebalancer can claimBalance", async () => {
    const { owner, other1: signer, other1: rebalancer } = await f.getAccounts();

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
    const { owner, other1: signer, other1: rebalancer } = await f.getAccounts();

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
    const { owner, other1: signer, other1: rebalancer } = await f.getAccounts();

    const usdcBalanceRFQ = await mockUSDC.balanceOf(mainnetRFQ.address);
    const alotBalanceRFQ = await mockALOT.balanceOf(mainnetRFQ.address);

    await expect(
      mainnetRFQ.connect(owner).claimBalance(mockUSDC.address, usdcBalanceRFQ)
    ).to.be.revertedWith("RF-OCR-01");

    await expect(
      mainnetRFQ.connect(owner).batchClaimBalance([mockUSDC.address, mockALOT.address], [usdcBalanceRFQ, alotBalanceRFQ])
    ).to.be.revertedWith("RF-OCR-01");
  });

});
