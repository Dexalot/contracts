/**
 * The test runner for Dexalot Incentive Distributor contract
 */
import Utils from "./utils";

import {
  IncentiveDistributor,
  IncentiveDistributor__factory,
  MockToken,
  PortfolioSub,
  PortfolioMain,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

interface RewardClaimI {
  user: string;
  tokenIds: number;
  amounts: BigNumber[];
}

describe("IncentiveDistributor", () => {
  let IncentiveDistributor: IncentiveDistributor__factory;
  let incentiveDistributor: IncentiveDistributor;
  let portfolioSub: PortfolioSub;
  let portfolioMain: PortfolioMain;

  let alot: MockToken;
  let lost: MockToken;

  let owner: SignerWithAddress;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  let rewards: RewardClaimI[];

  let firstRun = true;

  const TOKEN_ALLOC = Utils.parseUnits("100000", 18);
  const GAS_COST = Utils.parseUnits("0.1", 18);

  async function deployRewards() {
    const completePortfolio = await f.deployCompletePortfolio();

    portfolioSub = completePortfolio.portfolioSub;
    portfolioMain = completePortfolio.portfolioMain;

    alot = await f.deployMockToken("ALOT", 18);
    lost = await f.deployMockToken("LOST", 18);

    await f.addToken(portfolioMain, alot, 1, 0);
    await f.addToken(portfolioSub, lost, 1, 0);
    await f.addToken(portfolioMain, lost, 1, 0);

    IncentiveDistributor = (await ethers.getContractFactory("IncentiveDistributor")) as IncentiveDistributor__factory;
    if (firstRun) {
      // to test failure with zero address for signer and portfolio
      firstRun = false;
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
      await expect(
        upgrades.deployProxy(IncentiveDistributor, [Utils.fromUtf8("ALOT"), ZERO_ADDRESS, portfolioSub.address])
      ).to.be.revertedWith("ID-ZADDR-01");

      await expect(
        upgrades.deployProxy(IncentiveDistributor, [Utils.fromUtf8("ALOT"), signer.address, ZERO_ADDRESS])
      ).to.be.revertedWith("ID-ZADDR-02");
    } else {
      // for all other regular tests with correct address for signer
      incentiveDistributor = (await upgrades.deployProxy(IncentiveDistributor, [
        Utils.fromUtf8("ALOT"),
        signer.address,
        portfolioSub.address,
      ])) as IncentiveDistributor;
      await incentiveDistributor.deployed();
    }
  }

  async function alotFundDistributor() {
    await alot.mint(owner.address, TOKEN_ALLOC.mul(2));

    await f.depositToken(
      portfolioMain,
      owner,
      alot,
      18,
      Utils.fromUtf8("ALOT"),
      Utils.formatUnits(TOKEN_ALLOC.add(GAS_COST), 18)
    );
    await portfolioSub.transferToken(incentiveDistributor.address, Utils.fromUtf8("ALOT"), TOKEN_ALLOC.add(GAS_COST));
  }

  async function addRewardTokens() {
    await alotFundDistributor();

    await incentiveDistributor.pause();
    await incentiveDistributor.addRewardToken(Utils.fromUtf8("LOST"));
    await incentiveDistributor.unpause();

    await lost.mint(owner.address, TOKEN_ALLOC.mul(2));
    await f.depositToken(portfolioMain, owner, lost, 18, Utils.fromUtf8("LOST"), Utils.formatUnits(TOKEN_ALLOC, 18));
    await portfolioSub.transferToken(incentiveDistributor.address, Utils.fromUtf8("LOST"), TOKEN_ALLOC);
  }

  async function getBalance(userAddr: string, symbol?: string) {
    if (symbol == void 0) {
      symbol = "ALOT";
    }
    const balance = await portfolioSub.getBalance(userAddr, Utils.fromUtf8(symbol));
    return balance.total;
  }

  async function toSignature(claimMsg: RewardClaimI, tempSigner?: SignerWithAddress) {
    const domain = {
      name: "Dexalot",
      version: ethers.utils.parseBytes32String(await incentiveDistributor.VERSION()),
      chainId: network.config.chainId,
      verifyingContract: incentiveDistributor.address,
    };

    const types = {
      Claim: [
        { name: "user", type: "address" },
        { name: "tokenIds", type: "uint32" },
        { name: "amounts", type: "uint128[]" },
      ],
    };

    if (tempSigner == void 0) {
      tempSigner = signer;
    }

    const signature = await tempSigner._signTypedData(domain, types, claimMsg);
    return signature;
  }

  before(async () => {
    [owner, signer, user1, user2, user3] = await ethers.getSigners();

    rewards = [
      {
        user: user1.address.toLowerCase(),
        tokenIds: 1,
        amounts: [Utils.parseUnits("1000", 18)],
      },
      {
        user: user2.address.toLowerCase(),
        tokenIds: 3,
        amounts: [Utils.parseUnits("5000", 18), Utils.parseUnits("1000", 18)],
      },
      {
        user: user3.address.toLowerCase(),
        tokenIds: 3,
        amounts: [TOKEN_ALLOC.sub(Utils.parseUnits("500", 18)), Utils.parseUnits("5000", 18)],
      },
      {
        user: user1.address.toLowerCase(),
        tokenIds: 2,
        amounts: [Utils.parseUnits("1000", 18)],
      },
    ];
  });

  describe("Settings", () => {
    it("Should fail with zero address for signer", async function () {
      // fail with zero address for signer
      await deployRewards();
    });

    it("Should not initialize again after deployment", async function () {
      await deployRewards();

      await expect(
        incentiveDistributor.initialize(Utils.fromUtf8("ALOT"), signer.address, portfolioSub.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Should deploy", async () => {
      await deployRewards();

      expect(await incentiveDistributor.tokens(1)).to.be.equal(Utils.fromUtf8("ALOT"));

      expect(await incentiveDistributor.owner()).to.equal(owner.address);
    });
  });

  describe("Function permissions", () => {
    beforeEach(async () => {
      await deployRewards();
    });

    it("Should allow only owner address call pause", async () => {
      await expect(incentiveDistributor.connect(user1).pause()).to.revertedWith("Ownable: caller is not the owner");
      await expect(incentiveDistributor.connect(user1).unpause()).to.revertedWith("Ownable: caller is not the owner");
    });

    it("Should be paused to retrieve funds", async () => {
      await expect(incentiveDistributor.retrieveRewardToken(0)).to.revertedWith("Pausable: not paused");
    });

    it("Should allow only owner address retrieve funds", async () => {
      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await expect(incentiveDistributor.connect(user1).retrieveRewardToken(0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });

    it("Should be paused to retrieve all funds", async () => {
      await expect(incentiveDistributor.retrieveAllRewardTokens()).to.revertedWith("Pausable: not paused");
    });

    it("Should allow only owner address retrieve all funds", async () => {
      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await expect(incentiveDistributor.connect(user1).retrieveAllRewardTokens()).to.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });

    it("Should allow only owner address to withdraw gas", async () => {
      await expect(incentiveDistributor.connect(user1).withdrawGas(0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Pausable", () => {
    before(async () => {
      await deployRewards();
      await alotFundDistributor();
    });

    it("Should revert if trying to pause when paused", async () => {
      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await expect(incentiveDistributor.pause()).to.revertedWith("Pausable: paused");
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });

    it("Should revert if trying to unpause when unpaused", async () => {
      await expect(incentiveDistributor.unpause()).to.revertedWith("Pausable: not paused");
    });

    it("Should revert addRewardToken when not paused", async () => {
      await expect(incentiveDistributor.addRewardToken(Utils.fromUtf8("ALOT"))).to.revertedWith("Pausable: not paused");
    });

    it("Should revert calling claim() when paused", async () => {
      await incentiveDistributor.pause();

      const userReward = rewards[0];
      const signature = await toSignature(userReward);

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.revertedWith("Pausable: paused");
    });

    it("Should not revert calling claim() when unpaused", async () => {
      await incentiveDistributor.unpause();

      const userReward = rewards[0];
      const signature = await toSignature(userReward);

      await incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature);

      expect(await getBalance(userReward.user)).to.be.equal(userReward.amounts[0]);
    });
  });

  describe("Ownable", () => {
    it("Should make the deployer owner", async () => {
      expect(await incentiveDistributor.owner()).to.be.equal(owner.address);
    });
  });

  describe("addRewardToken", () => {
    it("Should allow only owner use addRewardToken", async () => {
      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await expect(incentiveDistributor.connect(user1).addRewardToken(Utils.fromUtf8("ALOT"))).to.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });

    it("Should allow add new reward token", async () => {
      expect(await incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");

      expect(await incentiveDistributor.addRewardToken(Utils.fromUtf8("LOST"))).to.emit(
        incentiveDistributor,
        "AddRewardToken"
      );

      expect(await incentiveDistributor.allTokens()).to.equal(parseInt("11", 2));
    });
  });

  describe("Claim", () => {
    beforeEach(async () => {
      await deployRewards();

      await addRewardTokens();
    });

    it("Should handle invalid token ids", async () => {
      await expect(incentiveDistributor.claim([100], 5, "0x00")).to.revertedWith("ID-TDNE-01");
    });

    it("Should handle invalid signature length", async () => {
      await expect(incentiveDistributor.claim([100], 1, "0x00")).to.revertedWith("ECDSA: invalid signature length");
    });

    it("Should handle incorrect signature (different signer)", async () => {
      const amounts = [Utils.parseUnits("1000", 18)];
      const tokenIds = 0;
      const signature = await toSignature({ user: user1.address, tokenIds, amounts }, user1);

      await expect(incentiveDistributor.connect(user1).claim(amounts, tokenIds, signature)).to.revertedWith(
        "ID-SIGN-01"
      );
    });

    it("Should handle incorrect signature (different amount)", async () => {
      const userReward = rewards[0];
      const signature = await toSignature(userReward);
      const amounts = userReward.amounts.map((x) => x.add(10));

      await expect(incentiveDistributor.connect(user1).claim(amounts, userReward.tokenIds, signature)).to.revertedWith(
        "ID-SIGN-01"
      );
    });

    it("Should handle incorrect signature (different tokenIds)", async () => {
      const userReward = rewards[0];
      const signature = await toSignature(userReward);

      await expect(incentiveDistributor.connect(user1).claim(userReward.amounts, 2, signature)).to.revertedWith(
        "ID-SIGN-01"
      );
    });

    it("Should handle incorrect signature (different claimer)", async () => {
      const userReward = rewards[0];
      const signature = await toSignature(userReward);

      await expect(incentiveDistributor.claim(userReward.amounts, userReward.tokenIds, signature)).to.revertedWith(
        "ID-SIGN-01"
      );
    });

    it("Should fail if number of tokenIds less than length of amounts array", async () => {
      const amounts = [Utils.parseUnits("1000", 18), Utils.parseUnits("500", 18)];
      const tokenIds = 1;
      const signature = await toSignature({ user: user1.address, tokenIds, amounts });
      await expect(incentiveDistributor.connect(user1).claim(amounts, tokenIds, signature)).to.revertedWith(
        "ID-TACM-01"
      );
    });

    it("Should fail if number of tokenIds greater than length of amounts array", async () => {
      const amounts = [Utils.parseUnits("1000", 18)];
      const tokenIds = 3;
      const signature = await toSignature({ user: user1.address, tokenIds, amounts });
      await expect(incentiveDistributor.connect(user1).claim(amounts, tokenIds, signature)).to.revertedWith(
        "ID-TACM-02"
      );
    });

    it("Should allow correct alot claim to be successful", async () => {
      const userReward = rewards[0];
      const signature = await toSignature(userReward);

      expect(await getBalance(userReward.user)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await getBalance(userReward.user)).to.be.equal(userReward.amounts[0]);
    });

    it("Should allow correct lost claim to be successful", async () => {
      const userReward = rewards[3];
      const signature = await toSignature(userReward);

      expect(await getBalance(userReward.user, "LOST")).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await getBalance(userReward.user, "LOST")).to.be.equal(userReward.amounts[0]);
    });

    it("Should handle double claim and give no extra rewards", async () => {
      const userReward = rewards[0];
      const signature = await toSignature(userReward);

      expect(await getBalance(userReward.user)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await getBalance(userReward.user)).to.be.equal(userReward.amounts[0]);

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.revertedWith("ID-NTTC-01");
    });

    it("Should not allow subsequent claims with new signature with less amount for a given user", async () => {
      const userReward = rewards[0];
      let signature = await toSignature(userReward);

      expect(await getBalance(userReward.user)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await getBalance(userReward.user)).to.be.equal(userReward.amounts[0]);

      const newAmounts = [userReward.amounts[0].sub(100)];
      signature = await toSignature({ user: userReward.user, tokenIds: userReward.tokenIds, amounts: newAmounts });

      await expect(
        incentiveDistributor.connect(user1).claim(newAmounts, userReward.tokenIds, signature)
      ).to.revertedWith("ID-RTPC-01");
    });

    it("Should allow subsequent claims with new signature for a given user", async () => {
      const userReward = rewards[0];
      let signature = await toSignature(userReward);

      expect(await getBalance(userReward.user)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await getBalance(userReward.user)).to.be.equal(userReward.amounts[0]);

      const newAmounts = [Utils.parseUnits("5000", 18).add(userReward.amounts[0])];
      signature = await toSignature({ user: userReward.user, tokenIds: userReward.tokenIds, amounts: newAmounts });

      await expect(incentiveDistributor.connect(user1).claim(newAmounts, userReward.tokenIds, signature)).to.emit(
        incentiveDistributor,
        "Claimed"
      );

      expect(await getBalance(userReward.user)).to.be.equal(newAmounts[0]);
    });

    it("Should allow valid claims for different users", async () => {
      let userReward = rewards[0];
      let signature = await toSignature(userReward);

      expect(await getBalance(userReward.user)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await getBalance(userReward.user)).to.be.equal(userReward.amounts[0]);

      userReward = rewards[1];
      signature = await toSignature(userReward);

      expect(await getBalance(userReward.user)).to.be.equal(BigNumber.from(0));
      expect(await getBalance(userReward.user, "LOST")).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user2).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await getBalance(userReward.user)).to.be.equal(userReward.amounts[0]);
      expect(await getBalance(userReward.user, "LOST")).to.be.equal(userReward.amounts[1]);
    });

    it("Should fail if contract does not have enough ALOT tokens", async () => {
      let userReward = rewards[2];
      let signature = await toSignature(userReward);

      await expect(
        incentiveDistributor.connect(user3).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.emit(incentiveDistributor, "Claimed");

      userReward = rewards[0];
      signature = await toSignature(userReward);

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, signature)
      ).to.revertedWith("P-AFNE-02");
    });
  });

  describe("retrieveRewardToken", () => {
    before(async () => {
      await deployRewards();

      await addRewardTokens();
    });

    it("Should revert if token is not valid", async () => {
      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await expect(incentiveDistributor.retrieveRewardToken(5)).to.revertedWith("ID-TDNE-02");
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });

    it("Should allow owner withdraw alot token if paused", async () => {
      const ownerBalance = await getBalance(owner.address);

      expect(await getBalance(incentiveDistributor.address)).to.equal(BigNumber.from(TOKEN_ALLOC));

      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await incentiveDistributor.retrieveRewardToken(1);
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");

      expect(await getBalance(incentiveDistributor.address)).to.equal(BigNumber.from(0));
      expect(await getBalance(owner.address)).to.equal(ownerBalance.add(TOKEN_ALLOC));
    });

    it("Should allow owner withdraw lost token if paused", async () => {
      const ownerBalance = await getBalance(owner.address, "LOST");

      expect(await getBalance(incentiveDistributor.address, "LOST")).to.equal(BigNumber.from(TOKEN_ALLOC));

      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await incentiveDistributor.retrieveRewardToken(2);
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");

      expect(await getBalance(incentiveDistributor.address, "LOST")).to.equal(BigNumber.from(0));
      expect(await getBalance(owner.address, "LOST")).to.equal(ownerBalance.add(TOKEN_ALLOC));
    });
  });

  describe("retrieveAllRewardTokens", () => {
    before(async () => {
      await deployRewards();

      await addRewardTokens();
    });

    it("Should allow owner withdraw multi tokens if paused ", async () => {
      const ownerALOTBalance = await getBalance(owner.address);
      const ownerLOSTBalance = await getBalance(owner.address, "LOST");

      expect(await getBalance(incentiveDistributor.address)).to.equal(BigNumber.from(TOKEN_ALLOC));
      expect(await getBalance(incentiveDistributor.address, "LOST")).to.equal(BigNumber.from(TOKEN_ALLOC));

      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");

      await incentiveDistributor.retrieveAllRewardTokens();

      expect(await getBalance(incentiveDistributor.address)).to.equal(BigNumber.from(0));
      expect(await getBalance(incentiveDistributor.address, "LOST")).to.equal(BigNumber.from(0));

      expect(await getBalance(owner.address)).to.equal(ownerALOTBalance.add(TOKEN_ALLOC));
      expect(await getBalance(owner.address, "LOST")).to.equal(ownerLOSTBalance.add(TOKEN_ALLOC));
    });
  });

  describe("depositGas", () => {
    before(async () => {
      await deployRewards();

      await addRewardTokens();
    });

    it("Should allow anyone to deposit gas to contract balance", async () => {
      const contractBalanceBefore = await ethers.provider.getBalance(incentiveDistributor.address);

      await expect(
        user1.sendTransaction({
          to: incentiveDistributor.address,
          value: Utils.parseUnits("5.0035", 18),
          gasLimit: 700000,
          maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
        })
      ).to.emit(incentiveDistributor, "DepositGas");

      const contractBalanceAfter = await ethers.provider.getBalance(incentiveDistributor.address);
      expect(contractBalanceAfter.gte(contractBalanceBefore.add(Utils.parseUnits("5", 18))));
    });
  });

  describe("withdrawGas", () => {
    before(async () => {
      await deployRewards();

      await addRewardTokens();
    });

    it("Should revert if withdraw amount greater than contract balance", async () => {
      const contractBalance = await ethers.provider.getBalance(incentiveDistributor.address);
      await expect(incentiveDistributor.withdrawGas(contractBalance.add(1))).to.revertedWith("ID-AGCB-01");
    });

    it("Should allow owner to withdraw gas from contract balance", async () => {
      let contractBalance = await ethers.provider.getBalance(incentiveDistributor.address);
      const ownerBalanceBefore = await owner.getBalance();

      await expect(incentiveDistributor.withdrawGas(contractBalance)).to.emit(incentiveDistributor, "WithdrawGas");

      contractBalance = await ethers.provider.getBalance(incentiveDistributor.address);
      expect(contractBalance).to.equal(BigNumber.from(0));

      const ownerBalanceAfter = await owner.getBalance();
      expect(ownerBalanceAfter.gte(ownerBalanceBefore));
    });
  });
});
