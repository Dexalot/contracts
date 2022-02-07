
require('dotenv').config({path: './.env'});
const { ethers, upgrades } = require("hardhat")

const Utils = require('./utils.js')

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev"

const contractsJson = require(`./${deployment_mode}-contracts.json`)

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

  // CHAIN INFORMATION
  console.log(`Chain Instance: ${process.env.CHAIN_INSTANCE}`)
  console.log(`Chain ID: ${process.env.CHAIN_ID}`)


  // BLOCK INFORMATION
  blockNumber = await provider.getBlockNumber()
  console.log(`Block number: ${blockNumber}`)

  gasPrice = await provider.getGasPrice()
  console.log(`Gas Price: ${gasPrice}`)

  // ACCOUNTS
  console.log(`Deployment Account: ${deploymentWallet.address}`)
  console.log(`Exchange multisig wallet: ${exchangeSafe}`)
  console.log(`Foundation multisig wallet: ${foundationSafe}`)

  const bal_wallet1 = await provider.getBalance(deploymentWallet.address)

  // get Tokens from the database
  const tokens_details = require(`./${deployment_mode}-tokensWithAddress.json`)

  // create the deployed tokens array from the database
  const tokenAddressMap = {}
  for (const td of tokens_details) {
    tokenAddressMap[td.symbol] = td.isnative ? "0x0000000000000000000000000000000000000000" : td.address
  }

  // get TradePairs from the database
  const pairs = require(`./${deployment_mode}-pairs.json`)


  // **********************************************************
  // GET CONTRACTS
  // Exchange, Portfolio, OrderBooks, TradePairs
  // **********************************************************

  exchangeAddr = contractsJson["Exchange"]
  portfolioAddr = contractsJson["Portfolio"]
  orderBooksAddr = contractsJson["OrderBooks"]
  tradePairsAddr = contractsJson["TradePairs"]

  exchAbiFile = Utils.getContractsAbi('Exchange')
  exchange = await new ethers.Contract(exchangeAddr, exchAbiFile.abi, deploymentWallet)
  console.log(`Exchange proxy: ${exchange.address}`)
  const exchangeImplAddr = await upgrades.erc1967.getImplementationAddress(exchange.address)
  console.log(`Exchange implementation: ${exchangeImplAddr}`)

  prtfAbiFile = Utils.getContractsAbi('Portfolio')
  portfolio = await new ethers.Contract(portfolioAddr, prtfAbiFile.abi, deploymentWallet)
  console.log(`Portfolio proxy: ${portfolio.address}`)
  const portfolioImplAddr = await upgrades.erc1967.getImplementationAddress(portfolio.address)
  console.log(`Portfolio implementation: ${portfolioImplAddr}`)

  obAbiFile = Utils.getContractsAbi('OrderBooks')
  orderBooks = await new ethers.Contract(orderBooksAddr, obAbiFile.abi, deploymentWallet)
  console.log(`OrderBooks proxy: ${orderBooks.address}`)
  const orderBooksImplAddr = await upgrades.erc1967.getImplementationAddress(orderBooks.address)
  console.log(`OrderBooks implementation: ${orderBooksImplAddr}`)

  tpAbiFile = Utils.getContractsAbi('TradePairs')
  tradePairs = await new ethers.Contract(tradePairsAddr, tpAbiFile.abi, deploymentWallet)
  console.log(`TradePairs proxy: ${tradePairs.address}`)
  const tradePairsImplAddr = await upgrades.erc1967.getImplementationAddress(tradePairs.address)
  console.log(`TradePairs implementation: ${tradePairsImplAddr}`)

  // get portfolio transfer fee rates
  console.log(`Portfolio ${portfolio.address} has its DEPOSIT fee rate updated to ${await portfolio.getDepositFeeRate()}/10000`)
  console.log(`Portfolio ${portfolio.address} has its WITHDRAW fee rate updated to ${await portfolio.getWithdrawFeeRate()}/10000`)

  // get maker and taker fees
  for (const pair of pairs) {
    pairIdAsBytes32 = Utils.fromUtf8(pair.pair) // trading pair id needs to be bytes32
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} MAKER fee rate: ${await exchange.getMakerRate(pairIdAsBytes32)}/10000`)
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} TAKER fee rate: ${await exchange.getTakerRate(pairIdAsBytes32)}/10000`)
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} MIN trade amount: ${await exchange.getMinTradeAmount(pairIdAsBytes32)}`)
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} MAX trade amount: ${await exchange.getMaxTradeAmount(pairIdAsBytes32)}`)
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} SLIPPAGE percentage: ${await exchange.getAllowedSlippagePercent(pairIdAsBytes32)}`)
  }

  // Check owners of deployed contracts
  console.log("EXCHANGE OWNERSHIP CHECKS")
  console.log(`Exchange Admin: Is Deployment Wallet ${deploymentWallet.address} an admin? ${await exchange.isAdmin(deploymentWallet.address)}`)
  console.log(`Exchange Admin: Is Exchange multisig wallet ${exchangeSafe} an admin? ${await exchange.isAdmin(exchangeSafe)}`)

  console.log("PORTFOLIO OWNERSHIP CHECKS")
  console.log(`Portfolio Admin: Is Deployment Wallet ${deploymentWallet.address} an admin? ${await portfolio.isAdmin(deploymentWallet.address)}`)
  console.log(`Portfolio Admin: Is Exchange multisig wallet ${exchangeSafe} an admin? ${await portfolio.isAdmin(exchangeSafe)}`)
  console.log(`Portfolio Admin: Is Exchange ${exchange.address} an admin? ${await portfolio.isAdmin(exchange.address)}`)
  console.log(`Portfolio Admin: Is TradePairs ${tradePairs.address} an admin? ${await portfolio.isAdmin(tradePairs.address)}`)

  console.log("PORTFOLIO FEE ADDRESS CHECK")
  console.log(`Portfolio Fee Address: Is Foundation multisig wallet ${foundationSafe} the fee address? ${await portfolio.getFeeAddress()}`)

  console.log("TRADEPAIRS OWNERSHIP CHECK")
  console.log(`TradePairs Owner: Is Exchange ${exchange.address} the owner? ${await tradePairs.owner() === exchange.address}`)
  console.log("ORDERBOOKS OWNERSHIP CHECK")
  console.log(`OrderBooks Owner: Is TradePairs ${tradePairs.address} the owner? ${await orderBooks.owner() === tradePairs.address}`)

  // **********************************************************
  // PRINT SYSTEM STATE AFTER DEPLOYMENT AT START
  // **********************************************************

  // get native list at system start-up
  native = await portfolio.native() // returns bytes32
  console.log(`Native Token on Portfolio: ${Utils.toUtf8(native)}`)

  // get token list at system start-up
  tokenList = await portfolio.getTokenList() // returns bytes32[]
  tokens = []
  for (var i=0; i < tokenList.length; i++) {
    tokens.push(Utils.toUtf8(tokenList[i]))
  }
  console.log(`Token List on Portfolio: ${tokens}`)

  // get trade pairs at system start-up
  tradepairs = []
  pairList = await exchange.getTradePairs() // returns bytes32[]
  for (var i=0; i < pairList.length; i++) {
    tradepairs.push(Utils.toUtf8(pairList[i]))
  }
  console.log(`Trade Pair List: ${tradepairs}`)

  console.log(`Deployment account ${deploymentWallet.address} balance: ${Utils.formatUnits(bal_wallet1, 18)} AVAX`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
