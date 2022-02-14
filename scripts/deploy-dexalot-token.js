
const fs = require("fs")
require('dotenv').config({path: './.env'});
const { ethers } = require("hardhat")

const Utils = require('./utils.js')

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev"

MAX_GAS_PRICE = deployment_mode === "dev" ? 225000000000 : 150000000000

GAS_LIMIT = 1500000

var options = { gasLimit: GAS_LIMIT }


async function main() {
  const provider =  new ethers.providers.JsonRpcProvider(process.env.CHAIN_INSTANCE)

  const signers = await ethers.getSigners()
  accounts = []
  for (var i=0; i<signers.length; i++) {
    accounts.push(signers[i].address)
  }
  const deploymentWallet = signers[0]

  // Safe address
  const exchangeSafe = process.env.EXCHANGE_SAFE_ADDRESS
  const foundationSafe = process.env.FOUNDATION_SAFE_ADDRESS
  const tokenSafe = process.env.TOKEN_SAFE_ADDRESS

  // CHAIN INFORMATION
  console.log(`Chain Instance: ${process.env.CHAIN_INSTANCE}`)
  console.log(`Chain ID: ${process.env.CHAIN_ID}`)


  // BLOCK INFORMATION
  blockNumber = await provider.getBlockNumber()
  console.log(`Block number: ${blockNumber}`)

  gasPrice = await provider.getGasPrice()
  console.log(`Gas Price: ${gasPrice}`)

  // exit this script if gas price is greater than 30 gWei
  if (gasPrice.sub(MAX_GAS_PRICE).gt(0)) {
    console.log("Gas price is too high.")
    process.exit(3)
  }

   // ACCOUNTS
  console.log(`Deployment Account: ${deploymentWallet.address}`)
  console.log(`Exchange multisig wallet: ${exchangeSafe}`)
  console.log(`Foundation multisig wallet: ${foundationSafe}`)
  console.log(`Token multisig wallet: ${tokenSafe}`)

  const bal_wallet1 = await provider.getBalance(deploymentWallet.address)

  const DexalotToken = await ethers.getContractFactory("DexalotToken")

  const alot = await DexalotToken.deploy()
  await alot.deployed()

  const name = await alot.name()
  const symbol = await alot.symbol()
  const decimals =  parseInt(Utils.bnToStr(await alot.decimals()))
  const totalSupply = await alot.totalSupply()
  const totalSupplyStr = Utils.formatUnits(totalSupply, decimals)

  console.log("Deploying ERC20 Dexalot Token")
  console.log(`Name = ${name}`)
  console.log(`Symbol = ${symbol}`)
  console.log(`Decimals = ${decimals}`)
  console.log(`Address = ${alot.address}`)
  console.log(`Total Supply = ${totalSupplyStr}`)

  fs.writeFileSync(`./scripts/${deployment_mode}-DexalotToken.json`,
                   JSON.stringify({"address": alot.address}, 0, 4),
                   "utf8",
                   function(err) {
    if (err) {
        console.log(err);
    }
  })


  // **********************************************************
  // TRANSFER FUNDS TO FOUNDATION MULTISIG
  // DexalotToken
  //

  console.log(`Sending ${totalSupplyStr} ${name} (${symbol}) to account ${tokenSafe}`)
  tx = await alot.transfer(tokenSafe, totalSupply, options)
  await tx.wait()
  console.log(`   Sent [${tx.hash}]`)


  // **********************************************************
  // CHECK BALANCE OF FUNDS AT TOKEN MULTISIG
  // DexalotToken
  //

  const tokenSafeBalance = await alot.balanceOf(tokenSafe)
  const deploymentAccountBalance = await alot.balanceOf(deploymentWallet.address)
  console.log(`Deployment account ${name} (${symbol}) balance = ${Utils.formatUnits(deploymentAccountBalance, decimals)}`)
  console.log(`Token multisig ${name} (${symbol}) balance = ${Utils.formatUnits(tokenSafeBalance, decimals)}`)


  // **********************************************************
  // TRANSFER AND CHECK TOKEN OWNERSHIP
  // DexalotToken
  //

  console.log(`Transferring Dexalot Token (${symbol}) ${alot.address} ownership...`)
  console.log(`   from deployment account ${await alot.owner()}`)
  tx = await alot.transferOwnership(tokenSafe, options)
  await tx.wait()
  console.log(`   to token multisig ${await alot.owner()} [${tx.hash}]`)


  // **********************************************************
  // PRINT SYSTEM STATE AFTER DEPLOYMENT AT START
  // **********************************************************

  const bal_wallet2 = await provider.getBalance(deploymentWallet.address)

  console.log(`Deployment account ${deploymentWallet.address} starting balance ==> ${Utils.formatUnits(bal_wallet1, 18)} AVAX`)
  console.log(`Deployment account ${deploymentWallet.address} ending balance   ==> ${Utils.formatUnits(bal_wallet2, 18)} AVAX`)
  console.log(`Cost of deployment ==> ${parseFloat(Utils.formatUnits(bal_wallet1.sub(bal_wallet2), 18))} AVAX`)
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    console.log("ERC20 Dexalot Token (ALOT) deployed.")
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
