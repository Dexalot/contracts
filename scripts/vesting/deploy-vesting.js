
const fs = require("fs")
require('dotenv').config({path: './.env'})
const { ethers, upgrades } = require("hardhat")

const Utils = require('../utils.js')

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev-local"
const contracts_details = require(`../${deployment_mode}-contracts.json`)
const dexalotToken = require(`../${deployment_mode}-DexalotToken.json`)

async function main() {
  const signers = await ethers.getSigners()
  accounts = []
  for (var i=0; i<signers.length; i++) {
    accounts.push(signers[i].address)
  }
  const deploymentAccount = accounts[0]

  const TokenVesting = await ethers.getContractFactory("TokenVesting")
  const Portfolio = await ethers.getContractFactory("Portfolio")
  const portfolio = await Portfolio.attach(contracts_details.Portfolio)

  console.log("Deployment account:", deploymentAccount)
  const isAdmin = await portfolio.isAdmin(signers[0].address)
  console.log("Deployment Account is admin:", isAdmin)
  const isAuctionAdmin = await portfolio.isAdmin(signers[0].address)
  console.log("Deployment account is auction admin:", isAuctionAdmin)

  const beneficiary=accounts[1];
  const start=await latestTime() + 1000;
  const cliffDuration=86400;
  const duration=604800;
  const revocable=true;

  var depVesting
  depVesting = await TokenVesting.deploy(beneficiary, start, cliffDuration, duration, revocable, 20, portfolio.address)
  await depVesting.deployed()

  const beneficiaryFromContract = await depVesting.beneficiary()

  console.log("Deploying Dexalot Token Vesting")
  console.log("Beneficiary = ", beneficiaryFromContract)
  console.log("Cliff = ", parseInt(await depVesting.cliff()))
  console.log("Start = ", parseInt(await depVesting.start()))
  console.log("Duration = ", parseInt(await depVesting.duration()))
  console.log("Revocable = ", await depVesting.revocable())
  console.log("Vesting Contract Address = ", depVesting.address)
  console.log("Portfolio Address = ", portfolio.address)

  fs.writeFileSync(`./scripts/vesting/${deployment_mode}-${beneficiaryFromContract}.json`,
                   JSON.stringify({"address": depVesting.address}, 0, 4),
                   "utf8",
                   function(err) {
    if (err) {
        console.log(err);
    }
  })

  const DexalotToken = await ethers.getContractFactory("DexalotToken");
  const contract = await DexalotToken.attach(dexalotToken.address);
  const decimals_str = Utils.bnToStr(await contract.decimals())

  await contract.transfer(depVesting.address, Utils.parseEther("1234.5678"))
  var balance = await contract.balanceOf(depVesting.address)

  console.log("Balance = ", Utils.formatUnits(await balance, parseInt(decimals_str)))

  await portfolio.addTrustedContract(depVesting.address, "Dexalot")
  console.log("Portfolio has been configured for the Vesting Token")
}

async function latestTime() {
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  return blockBefore.timestamp;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    console.log("Dexalot Vesting Contract deployed.")
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
