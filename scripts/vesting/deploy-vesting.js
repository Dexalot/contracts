
const fs = require("fs")
require('dotenv').config({path: '../.env'})
const { ethers, upgrades } = require("hardhat")
const utils = require("../utils.js")

const Utils = require('../utils.js')

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev-local"
const contracts_details = require(`../${deployment_mode}-contracts.json`)
const dexalotToken = require(`../${deployment_mode}-DexalotToken.json`)

GAS_LIMIT = 1500000

var options = { gasLimit: GAS_LIMIT }


async function main() {
  const signers = await ethers.getSigners()
  accounts = []
  for (var i=0; i<signers.length; i++) {
    accounts.push(signers[i].address)
  }
  const deploymentWallet = signers[0]
  const exchangeWallet = signers[0]
  const tokenWallet = signers[0]

  const TokenVesting = await ethers.getContractFactory("TokenVesting")
  const Portfolio = await ethers.getContractFactory("Portfolio")
  const portfolio = await Portfolio.attach(contracts_details.Portfolio)

  console.log("Deployment account:", deploymentWallet.address)
  const isAdmin1 = await portfolio.isAdmin(deploymentWallet.address)
  console.log("Deployment Account is admin:", isAdmin1)
  const isAuctionAdmin1 = await portfolio.isAdmin(deploymentWallet.address)
  console.log("Deployment account is auction admin:", isAuctionAdmin1)

  console.log("Exchange account:", exchangeWallet.address)
  const isAdmin2 = await portfolio.isAdmin(exchangeWallet.address)
  console.log("Exchange Account is admin:", isAdmin2)
  const isAuctionAdmin2 = await portfolio.isAdmin(exchangeWallet.address)
  console.log("Exchange account is auction admin:", isAuctionAdmin2)

  const beneficiary=accounts[0]             // beneficiary account address
  // const start=await latestTime() + 480   // unix time, 240 for 4 min
  const start = parseInt((new Date('February 13, 2022 20:00:00').getTime() / 1000).toFixed(0))  // date and time is local
  const startPortfolioDeposits=start - 240  // unix time, 120 for 2 min
  const cliff=120                           // unix time, 120 for 2 min
  const duration=480                        // unix time, 480 for 8 min
  const revocable=true
  const firstReleasePercentage=15           // percentage, 15 for 15%

  var depVesting
  depVesting = await TokenVesting.deploy(beneficiary, start, cliff, duration, startPortfolioDeposits,
                                         revocable, firstReleasePercentage, portfolio.address)
  await depVesting.deployed()

  const beneficiaryFromContract = await depVesting.beneficiary()

  console.log("Deploying Dexalot Token Vesting")
  console.log("Beneficiary = ", beneficiaryFromContract)
  console.log("Start = ", parseInt(await depVesting.start()))
  console.log("Portfolio Deposits Start = ", parseInt(await depVesting.startPortfolioDeposits()))
  console.log("Cliff = ", parseInt(await depVesting.cliff()))
  console.log("Duration = ", parseInt(await depVesting.duration()))
  console.log("Initial Release % = ", parseInt(await depVesting.getPercentage()))
  console.log("Revocable = ", await depVesting.revocable())
  console.log("Dexalot Token Address =", dexalotToken.address)
  console.log("TokenVesting Address = ", depVesting.address)
  console.log("Portfolio Address = ", portfolio.address)

  fs.writeFileSync(`./scripts/vesting/${deployment_mode}-${beneficiaryFromContract}.json`,
                   JSON.stringify({"address": depVesting.address}, 0, 4),
                   "utf8",
                   function(err) {
    if (err) {
        console.log(err)
    }
  })

  const DexalotToken = await ethers.getContractFactory("DexalotToken")
  const alot = await DexalotToken.attach(dexalotToken.address)
  const decimals_str = Utils.bnToStr(await alot.decimals())

  var balance = await alot.balanceOf(deploymentWallet.address)
  console.log("Balance = ", Utils.formatUnits(await balance, parseInt(decimals_str)))

  //await alot.connect(tokenWallet).transfer(deploymentWallet.address, Utils.parseEther("10000"))
  await alot.connect(deploymentWallet).transfer(depVesting.address, Utils.parseEther("2000"))
  var balance1 = await alot.balanceOf(deploymentWallet.address)
  console.log("Deployment Wallet Balance = ", Utils.formatUnits(await balance1, parseInt(decimals_str)))
  var balance2 = await alot.balanceOf(depVesting.address)
  console.log("Vesting Contract Balance = ", Utils.formatUnits(await balance2, parseInt(decimals_str)))

  const symbol = await alot.symbol()
  const symbolBytes32 = ethers.utils.formatBytes32String(symbol)

  // const tx1 = await portfolio.connect(exchangeWallet).addAuctionAdmin(exchangeWallet.address, options)
  // await tx1.wait()
  // console.log(`tx hash: ${tx1.hash}`)

  const tx2 = await portfolio.connect(exchangeWallet).addTrustedContract(depVesting.address, "Dexalot", options)
  await tx2.wait()
  console.log(`tx hash: ${tx2.hash}`)

  // const tx3 = await portfolio.connect(exchangeWallet).addToken(symbolBytes32, dexalotToken.address, 0, options)   // auction mode 0
  // await tx3.wait()
  // console.log(`tx hash: ${tx3.hash}`)
  // console.log("Portfolio has been configured for the Vesting Token")
}

async function latestTime() {
  const blockNumBefore = await ethers.provider.getBlockNumber()
  const blockBefore = await ethers.provider.getBlock(blockNumBefore)
  return blockBefore.timestamp
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    console.log("ERC20 Dexalot Vesting Token deployed.")

    console.log("Saving artifacts for frontend")

    filename = "./artifacts/contracts/token/DexalotToken.sol/DexalotToken.json"
    data = Utils.readFile(filename, false)
    Utils.saveFile("../token-vesting-app/src/artifacts/contracts/DexalotToken.json", JSON.stringify({abi: data.abi } , null, 2))

    filename = "./artifacts/contracts/token/TokenVesting.sol/TokenVesting.json"
    data = Utils.readFile(filename, false)
    Utils.saveFile("../token-vesting-app/src/artifacts/contracts/TokenVesting.json", JSON.stringify({abi: data.abi } , null, 2))

    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
