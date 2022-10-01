/**
 * The test runner for Dexalot Incentive Distributor contract
 */

import { IncentiveDistributor, IncentiveDistributor__factory, DexalotToken, MockToken } from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

interface RewardClaimI {
  address: string;
  tokenIds: number;
  amounts: BigNumber[];
  signature: string;
}

describe("IncentiveDistributor", () => {
  let IncentiveDistributor: IncentiveDistributor__factory;
  let incentiveDistributor: IncentiveDistributor;

  let alot: DexalotToken;
  let lost: MockToken;

  let owner: SignerWithAddress;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

    let rewards: RewardClaimI[];

  const TOKEN_ALLOC = 100000;

  async function deployRewards() {
    IncentiveDistributor = await ethers.getContractFactory("IncentiveDistributor") as IncentiveDistributor__factory;
    alot = await f.deployDexalotToken();
    lost = await f.deployMockToken("LOST", 18);
    incentiveDistributor = await upgrades.deployProxy(IncentiveDistributor, [alot.address, signer.address]) as IncentiveDistributor;
    await incentiveDistributor.deployed();
  }

  async function addRewardTokens() {
    await alot.transfer(incentiveDistributor.address, TOKEN_ALLOC);

    await incentiveDistributor.pause();
    await incentiveDistributor.addRewardToken(lost.address);
    await incentiveDistributor.unpause();

    await lost.mint(incentiveDistributor.address, TOKEN_ALLOC);
  }

  async function toSignature(signer: SignerWithAddress, address: string, tokenIds: number, amounts: BigNumber[]) {
    const messageHash = ethers.utils.solidityKeccak256(
      ["address", "uint32", "uint128[]"],
      [address, tokenIds, amounts]
    );
    const messageHashBinary = ethers.utils.arrayify(messageHash);
    return signer.signMessage(messageHashBinary);
  }

  before(async () => {
    [owner, signer, user1, user2, user3] = await ethers.getSigners();

    rewards = [
      {
        address: user1.address,
        amounts: [BigNumber.from(1000)],
        tokenIds: 1,
        signature: "",
      },
      { address: user2.address, amounts: [BigNumber.from(5000), BigNumber.from(1000)], tokenIds: 3, signature: "" },
      {
        address: user3.address,
        amounts: [BigNumber.from(TOKEN_ALLOC - 500), BigNumber.from(5000)],
        tokenIds: 3,
        signature: "",
      },
      {
        address: user1.address,
        amounts: [BigNumber.from(1000)],
        tokenIds: 2,
        signature: "",
      },
    ];

    rewards.forEach(async (x) => (x.signature = await toSignature(signer, x.address, x.tokenIds, x.amounts)));
  });

  describe("Settings", () => {
    it("Should not initialize again after deployment", async function () {
		await deployRewards();

    await expect(incentiveDistributor.initialize(alot.address, signer.address))
      .to.be.revertedWith("Initializable: contract is already initialized");
        });

    it("Should deploy", async () => {
      await deployRewards();

      expect(await incentiveDistributor.tokens(1)).to.be.equal(alot.address);

      expect(await incentiveDistributor.owner()).to.equal(owner.address);
    });
  });

  describe("Function permissions", () => {
    it("Should allow only owner address call pause", async () => {
      await deployRewards();

      await expect(incentiveDistributor.connect(user1).pause()).to.revertedWith("Ownable: caller is not the owner");
      await expect(incentiveDistributor.connect(user1).unpause()).to.revertedWith("Ownable: caller is not the owner");
    });

    it("Should be paused to retrieve funds", async () => {
      await deployRewards();

      await expect(incentiveDistributor.retrieveRewardToken(0)).to.revertedWith("Pausable: not paused");
    });

    it("Should allow only owner address retrieve funds", async () => {
      await deployRewards();

      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await expect(incentiveDistributor.connect(user1).retrieveRewardToken(0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });

    it("Should be paused to retrieve all funds", async () => {
      await deployRewards();

      await expect(incentiveDistributor.retrieveAllRewardTokens()).to.revertedWith("Pausable: not paused");
    });

    it("Should allow only owner address retrieve all funds", async () => {
      await deployRewards();

      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await expect(incentiveDistributor.connect(user1).retrieveAllRewardTokens()).to.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });
  });

  describe("Pausable", () => {
    before(async () => {
      await deployRewards();

      await alot.transfer(incentiveDistributor.address, TOKEN_ALLOC);
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
      await expect(incentiveDistributor.addRewardToken(alot.address)).to.revertedWith("Pausable: not paused");
    });

    it("Should revert calling claim() when paused", async () => {
      await incentiveDistributor.pause();

      const userReward = rewards[0];

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.revertedWith("Pausable: paused");
    });

    it("Should not revert calling claim() when unpaused", async () => {
      await incentiveDistributor.unpause();

      const userReward = rewards[0];

      await incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature);

      const claimed = await alot.balanceOf(userReward.address);
      expect(claimed).to.be.equal(userReward.amounts[0]);
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
      await expect(incentiveDistributor.connect(user1).addRewardToken(alot.address)).to.revertedWith("Ownable: caller is not the owner");
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });

    it("Should allow add new reward token", async () => {
      expect(await incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");

      expect(await incentiveDistributor.addRewardToken(lost.address)).to.emit(incentiveDistributor, "AddRewardToken");

      expect(await incentiveDistributor.allTokens()).to.equal(parseInt("11", 2));
    });
  });

  describe("Claim", () => {
    beforeEach(async () => {
      alot = await f.deployDexalotToken();
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
      const amounts = [BigNumber.from(1000)];
      const tokenIds = 0;
      const signature = await toSignature(user1, user1.address, tokenIds, amounts);
      await expect(incentiveDistributor.connect(user1).claim(amounts, tokenIds, signature)).to.revertedWith(
        "ID-SIGN-01"
      );
    });

    it("Should handle incorrect signature (different amount)", async () => {
      const userReward = rewards[0];
      const amounts = userReward.amounts.map((x) => x.add(10));

      await expect(
        incentiveDistributor.connect(user1).claim(amounts, userReward.tokenIds, userReward.signature)
      ).to.revertedWith("ID-SIGN-01");
    });

    it("Should handle incorrect signature (different tokenIds)", async () => {
      const userReward = rewards[0];

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, 2, userReward.signature)
      ).to.revertedWith("ID-SIGN-01");
    });

    it("Should handle incorrect signature (different claimer)", async () => {
      const userReward = rewards[0];
      await expect(
        incentiveDistributor.claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.revertedWith("ID-SIGN-01");
    });

    it("Should fail if number of tokenIds less than length of amounts array", async () => {
      const amounts = [BigNumber.from(1000), BigNumber.from(500)];
      const tokenIds = 1;
      const signature = await toSignature(signer, user1.address, tokenIds, amounts);
      await expect(incentiveDistributor.connect(user1).claim(amounts, tokenIds, signature)).to.revertedWith(
        "ID-TACM-01"
      );
    });

    it("Should fail if number of tokenIds greater than length of amounts array", async () => {
      const amounts = [BigNumber.from(1000)];
      const tokenIds = 3;
      const signature = await toSignature(signer, user1.address, tokenIds, amounts);
      await expect(incentiveDistributor.connect(user1).claim(amounts, tokenIds, signature)).to.revertedWith(
        "ID-TACM-02"
      );
    });

    it("Should allow correct alot claim to be successful", async () => {
      const userReward = rewards[0];

      expect(await alot.balanceOf(userReward.address)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await alot.balanceOf(userReward.address)).to.be.equal(userReward.amounts[0]);
    });

    it("Should allow correct lost claim to be successful", async () => {
      const userReward = rewards[3];

      expect(await lost.balanceOf(userReward.address)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await lost.balanceOf(userReward.address)).to.be.equal(userReward.amounts[0]);
    });

    it("Should handle double claim and give no extra rewards", async () => {
      const userReward = rewards[0];

      expect(await alot.balanceOf(userReward.address)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.emit(incentiveDistributor, "Claimed");

      const alotAfterFirstClaim = await alot.balanceOf(userReward.address);
      expect(alotAfterFirstClaim).to.be.equal(userReward.amounts[0]);

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.revertedWith("ID-NTTC-01");
    });

    it("Should not allow subsequent claims with new signature with less amount for a given user", async () => {
      const userReward = rewards[0];

      expect(await alot.balanceOf(userReward.address)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await alot.balanceOf(userReward.address)).to.be.equal(userReward.amounts[0]);

      const newAmounts = [userReward.amounts[0].sub(100)];
      const signature = await toSignature(signer, userReward.address, userReward.tokenIds, newAmounts);

      await expect(
        incentiveDistributor.connect(user1).claim(newAmounts, userReward.tokenIds, signature)
      ).to.revertedWith("ID-RTPC-01");
    });

    it("Should allow subsequent claims with new signature for a given user", async () => {
      const userReward = rewards[0];

      expect(await alot.balanceOf(userReward.address)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await alot.balanceOf(userReward.address)).to.be.equal(userReward.amounts[0]);

      const newAmounts = [BigNumber.from(5000).add(userReward.amounts[0])];
      const signature = await toSignature(signer, userReward.address, userReward.tokenIds, newAmounts);

      await expect(incentiveDistributor.connect(user1).claim(newAmounts, userReward.tokenIds, signature)).to.emit(
        incentiveDistributor,
        "Claimed"
      );

      expect(await alot.balanceOf(userReward.address)).to.be.equal(newAmounts[0]);
    });

    it("Should allow valid claims for different users", async () => {
      let userReward = rewards[0];

      expect(await alot.balanceOf(userReward.address)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await alot.balanceOf(userReward.address)).to.be.equal(userReward.amounts[0]);

      userReward = rewards[1];

      expect(await alot.balanceOf(userReward.address)).to.be.equal(BigNumber.from(0));
      expect(await lost.balanceOf(userReward.address)).to.be.equal(BigNumber.from(0));

      await expect(
        incentiveDistributor.connect(user2).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.emit(incentiveDistributor, "Claimed");

      expect(await alot.balanceOf(userReward.address)).to.be.equal(userReward.amounts[0]);
      expect(await lost.balanceOf(userReward.address)).to.be.equal(userReward.amounts[1]);
    });

    it("Should fail if contract does not have enough ALOT tokens", async () => {
      let userReward = rewards[2];

      await expect(
        incentiveDistributor.connect(user3).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.emit(incentiveDistributor, "Claimed");

      userReward = rewards[0];

      await expect(
        incentiveDistributor.connect(user1).claim(userReward.amounts, userReward.tokenIds, userReward.signature)
      ).to.revertedWith("ID-RTBI-01");
    });
  });

  describe("retrieveRewardToken", () => {
    before(async () => {
      alot = await f.deployDexalotToken();
      await deployRewards();

      await addRewardTokens();
    });

    it("Should revert if token is not valid", async () => {
      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await expect(incentiveDistributor.retrieveRewardToken(5)).to.revertedWith("ID-TDNE-02");
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");
    });

    it("Should allow owner withdraw alot token if paused", async () => {
      const ownerBalance = await alot.balanceOf(owner.address);

      expect(await alot.balanceOf(incentiveDistributor.address)).to.equal(BigNumber.from(TOKEN_ALLOC));

      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await incentiveDistributor.retrieveRewardToken(1);
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");

      expect(await alot.balanceOf(incentiveDistributor.address)).to.equal(BigNumber.from(0));
      expect(await alot.balanceOf(owner.address)).to.equal(ownerBalance.add(TOKEN_ALLOC));
    });

    it("Should allow owner withdraw lost token if paused", async () => {
      const ownerBalance = await lost.balanceOf(owner.address);

      expect(await lost.balanceOf(incentiveDistributor.address)).to.equal(BigNumber.from(TOKEN_ALLOC));

      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");
      await incentiveDistributor.retrieveRewardToken(2);
      await expect(incentiveDistributor.unpause()).to.emit(incentiveDistributor, "Unpaused");

      expect(await lost.balanceOf(incentiveDistributor.address)).to.equal(BigNumber.from(0));
      expect(await lost.balanceOf(owner.address)).to.equal(ownerBalance.add(TOKEN_ALLOC));
    });
  });

  describe("retrieveAllRewardTokens", () => {
    before(async () => {
      alot = await f.deployDexalotToken();
      await deployRewards();

      await addRewardTokens();
    });

    it("Should allow owner withdraw multi tokens if paused ", async () => {
      const ownerALOTBalance = await alot.balanceOf(owner.address);
      const ownerLOSTBalance = await lost.balanceOf(owner.address);

      expect(await alot.balanceOf(incentiveDistributor.address)).to.equal(BigNumber.from(TOKEN_ALLOC));
      expect(await lost.balanceOf(incentiveDistributor.address)).to.equal(BigNumber.from(TOKEN_ALLOC));

      await expect(incentiveDistributor.pause()).to.emit(incentiveDistributor, "Paused");

      await incentiveDistributor.retrieveAllRewardTokens();

      expect(await alot.balanceOf(incentiveDistributor.address)).to.equal(BigNumber.from(0));
      expect(await lost.balanceOf(incentiveDistributor.address)).to.equal(BigNumber.from(0));

      expect(await alot.balanceOf(owner.address)).to.equal(ownerALOTBalance.add(TOKEN_ALLOC));
      expect(await lost.balanceOf(owner.address)).to.equal(ownerLOSTBalance.add(TOKEN_ALLOC));
    });
  });
});
