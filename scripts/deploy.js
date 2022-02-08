
const fs = require("fs")
require('dotenv').config({path: './.env'});
const { ethers, upgrades } = require("hardhat")

const Utils = require('./utils.js')

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev-local"
const dexalotToken = require(`./${deployment_mode}-DexalotToken.json`)

MAX_GAS_PRICE = deployment_mode === "dev-local" ? 225000000000 : 55000000000

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
  // DEPLOY CONTRACTS
  // Exchange, Portfolio, OrderBooks, TradePairs
  // **********************************************************

  const Exchange = await ethers.getContractFactory("Exchange")
  const exchange = await upgrades.deployProxy(Exchange)
  await exchange.deployed()
  console.log(`Exchange proxy: ${exchange.address}`)
  const exchangeImplAddr = await upgrades.erc1967.getImplementationAddress(exchange.address)
  console.log(`Exchange implementation: ${exchangeImplAddr}`)

  const Portfolio = await ethers.getContractFactory("Portfolio")
  const portfolio = await upgrades.deployProxy(Portfolio)
  await portfolio.deployed()
  console.log(`Portfolio proxy: ${portfolio.address}`)
  const portfolioImplAddr = await upgrades.erc1967.getImplementationAddress(portfolio.address)
  console.log(`Portfolio implementation: ${portfolioImplAddr}`)

  const OrderBooks = await ethers.getContractFactory("OrderBooks")
  const orderBooks = await upgrades.deployProxy(OrderBooks)
  await orderBooks.deployed()
  console.log(`OrderBooks proxy: ${orderBooks.address}`)
  const orderBooksImplAddr = await upgrades.erc1967.getImplementationAddress(orderBooks.address)
  console.log(`OrderBooks implementation: ${orderBooksImplAddr}`)

  const TradePairs = await ethers.getContractFactory("TradePairs")
  const tradePairs = await upgrades.deployProxy(TradePairs, [orderBooks.address, portfolio.address])
  await tradePairs.deployed()
  console.log(`TradePairs proxy: ${tradePairs.address}`)
  const tradePairsImplAddr = await upgrades.erc1967.getImplementationAddress(tradePairs.address)
  console.log(`TradePairs implementation: ${tradePairsImplAddr}`)

  contracts = {"ExchangeSafe": exchangeSafe,
               "FoundationSafe": foundationSafe,
               "Exchange": exchange.address,
               "Portfolio": portfolio.address,
               "OrderBooks": orderBooks.address,
               "TradePairs": tradePairs.address}

  fs.writeFileSync(`./scripts/${deployment_mode}-contracts.json`, JSON.stringify(contracts, 0, 4), "utf8", function(err) {
    if (err) {
        console.log(err);
    }
  })

  let tx


  // **********************************************************
  // ADD ADMIN
  // Exchange, Portfolio
  // **********************************************************

  tx = await exchange.setPortfolio(portfolio.address, options)
  await tx.wait()
  console.log(`Called setPortfolio on Exchange ${exchange.address} [${tx.hash}]`)

  tx = await portfolio.addAdmin(exchange.address, options)
  await tx.wait()
  console.log(`Exchange ${exchange.address} is admin in Portfolio ${portfolio.address} [${tx.hash}]`)

  // add Exchange multisig wallet to the DEFAULT_ADMIN_ROLE
  tx = await exchange.addAdmin(exchangeSafe, options)
  console.log(`Exchange multisig wallet ${exchangeSafe} is admin to Exchange ${exchange.address} [${tx.hash}]`)
  console.log(`Exchange multisig wallet ${exchangeSafe} is admin to Portfolio ${portfolio.address} [${tx.hash}]`)

  tx = await portfolio.addAdmin(tradePairs.address, options)
  await tx.wait()
  console.log(`TradePairs ${tradePairs.address} is admin in Portfolio ${portfolio.address} [${tx.hash}]`)

  tx = await portfolio.addAuctionAdmin(exchangeSafe, options)
  await tx.wait()
  console.log(`Exchange safe ${exchangeSafe} added to auction admin on portfolio at ${portfolio.address}.`)

  tx = await portfolio.addAuctionAdmin(deploymentWallet.address, options)
  await tx.wait()
  console.log(`Deployment wallet ${deploymentWallet.address} added to auction admin on portfolio at ${portfolio.address}.`)


  // **********************************************************
  // ADD DEXALOT TOKEN ALOT TO EXCHANGE
  // Exchange, Portfolio, DexalotToken
  // **********************************************************

  const DexalotToken = await ethers.getContractFactory("DexalotToken")
  const alot = await DexalotToken.attach(dexalotToken.address)
  const symbol = await alot.symbol()
  const symbolBytes32 = Utils.fromUtf8(symbol)
  tx = await exchange.addToken(symbolBytes32, alot.address, 0)   // auction mode 0
  await tx.wait()
  console.log(`Dexalot Token ALOT at ${alot.address} added to exchange at ${exchange.address} and portfolio at ${portfolio.address}.`)


  // **********************************************************
  // SET CONTRACT HIERARCHY
  // Exchange, Portfolio, OrderBooks, TradePairs
  // **********************************************************

  tx = await orderBooks.transferOwnership(tradePairs.address, options)
  await tx.wait()
  console.log(`OrderBooks ${orderBooks.address} ownership transferred to TradePairs ${await orderBooks.owner()} [${tx.hash}]`)

  tx = await tradePairs.transferOwnership(exchange.address, options)
  await tx.wait()
  console.log(`TradePairs ${tradePairs.address} ownership transferred to Exchange ${await tradePairs.owner()} [${tx.hash}]`)

  tx = await exchange.setTradePairs(tradePairs.address)
  await tx.wait()
  console.log(`Called setTradePairs on Exchange ${exchange.address} [${tx.hash}]`)

  tx = await portfolio.setFeeAddress(foundationSafe, options)
  await tx.wait()
  console.log(`Called setFeeAddress on Portfolio ${portfolio.address} [${tx.hash}]`)


  // **********************************************************
  // ADD TRADE PAIRS
  // **********************************************************

  const auctionModeOff = 0

  for (const pair of pairs) {
    pairIdAsBytes32 = Utils.fromUtf8(pair.pair) // trading pair id needs to be bytes32
    mintrade_amnt = Utils.parseUnits(parseFloat(pair.mintrade_amnt).toFixed(pair.quote_evmdecimals), pair.quote_evmdecimals)
    maxtrade_amnt = Utils.parseUnits(parseFloat(pair.maxtrade_amnt).toFixed(pair.quote_evmdecimals), pair.quote_evmdecimals)
    tx = await exchange.addTradePair(pairIdAsBytes32,
                                     tokenAddressMap[pair.base], pair.basedisplaydecimals,
                                     tokenAddressMap[pair.quote], pair.quotedisplaydecimals,
                                     mintrade_amnt, maxtrade_amnt, auctionModeOff, options)
    await tx.wait()
    console.log(`${pair.pair} added to TradePairs ${tradePairs.address} via Exchange ${exchange.address} [${tx.hash}]`)
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} MIN trade amount: ${await exchange.getMinTradeAmount(pairIdAsBytes32)}`)
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} MAX trade amount: ${await exchange.getMaxTradeAmount(pairIdAsBytes32)}`)
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} SLIPPAGE percentage: ${await exchange.getAllowedSlippagePercent(pairIdAsBytes32)}`)

    const makerFee = 0
    tx = await exchange.updateRate(pairIdAsBytes32, makerFee, 0)
    await tx.wait()
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} MAKER fee rate: ${await exchange.getMakerRate(pairIdAsBytes32)}/10000 [${tx.hash}]`)

    const takerFee = 0
    tx = await exchange.updateRate(pairIdAsBytes32, takerFee, 1)
    await tx.wait()
    console.log(`${pair.pair} on TradePairs ${tradePairs.address} TAKER fee rate: ${await exchange.getTakerRate(pairIdAsBytes32)}/10000 [${tx.hash}]`)
  }

  // update portfolio transfer fee rates
  const depositFee = 0
  tx = await portfolio.updateTransferFeeRate(depositFee, 0)
  await tx.wait()
  console.log(`Portfolio ${portfolio.address} has its DEPOSIT fee rate updated to ${await portfolio.getDepositFeeRate()}/10000 [${tx.hash}]`)

  const withdrawFee = 0
  tx = await portfolio.updateTransferFeeRate(withdrawFee, 1)
  await tx.wait()
  console.log(`Portfolio ${portfolio.address} has its WITHDRAW fee rate updated to ${await portfolio.getWithdrawFeeRate()}/10000 [${tx.hash}]`)

  // remove deployment wallet from Exchange and Portfolio
  tx = await exchange.removeAdmin(deploymentWallet.address, options)
  await tx.wait()
  console.log(`Deployment Wallet ${deploymentWallet.address} removed from admin in Exchange ${exchange.address} [${tx.hash}]`)
  console.log(`Deployment Wallet ${deploymentWallet.address} removed from admin in Portfolio ${portfolio.address} [${tx.hash}]`)

  // The owner of the ProxyAdmin can upgrade our contracts
  console.log(`Transferring ownership of ProxyAdmin to ${exchangeSafe}...`)
  await upgrades.admin.transferProxyAdminOwnership(exchangeSafe)
  console.log(`Transferred ownership of ProxyAdmin to ${exchangeSafe}`)

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

  const bal_wallet2 = await provider.getBalance(deploymentWallet.address)

  console.log(`Deployment account ${deploymentWallet.address} starting balance ==> ${Utils.formatUnits(bal_wallet1, 18)} AVAX`)
  console.log(`Deployment account ${deploymentWallet.address} ending balance   ==> ${Utils.formatUnits(bal_wallet2, 18)} AVAX`)
  console.log(`Cost of deployment ==> ${parseFloat(Utils.formatUnits(bal_wallet1.sub(bal_wallet2), 18))} AVAX`)
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
