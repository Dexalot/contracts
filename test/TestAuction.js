
require('dotenv').config({path: './.env'})

const chai = require('chai');
const expect = chai.expect;

const {   ethers, upgrades } = require("hardhat");
require("@nomiclabs/hardhat-ethers");
const BigNumber = require('bignumber.js');
const { BigNumber: BigNumberEthers }  = require("ethers")
const Utils = require('./utils.js');

const MockTokenAbi = require('../artifacts/contracts/token/MockToken.sol/MockToken.json');
const TradePairsAbi = require('../artifacts/contracts/TradePairs.sol/TradePairs.json');
const PortfolioAbi = require('../artifacts/contracts/Portfolio.sol/Portfolio.json');
const ExchangeAbi = require('../artifacts/contracts/Exchange.sol/Exchange.json');

let MockToken;
let OrderBooks;
let TradePairs;
let Exchange;
let Portfolio;

// using the first numberOfAccounts accounts
const numberOfAccounts = 10;

// fee rates
const makerRate = BigNumber(0.0030);
const takerRate = BigNumber(0.0030);

// initial state
// do transfers to Portfolio contract as follows before starting tests
const tokens = ["LFG", "SER"];

const decimalsMap = {"AVAX": 18,
                     "LFG": 18,
                     "SER": 18}

const native = "AVAX";

const tokenList = ["LFG", "SER"];

const tokenPairs = ["LFG/SER"];

const minTradeAmountMap = {"LFG/SER": 10}

const maxTradeAmountMap = {"LFG/SER": 10000}

const baseDisplayDecimalMap = {"LFG/SER": 2}

const quoteDisplayDecimalMap = {"LFG/SER": 2}

const initial_mints = {AVAX: 10000, LFG: 15000, SER: 50000};

const initial_portfolio_deposits = {AVAX: 9000, LFG: 14000, SER: 45000};

var options = { gasLimit: 5000000 };

const startAuctionMode = 2

// address (a multisig in production) that collects the fees
const foundationSafe = '0x48a04b706548F7034DC50bafbF9990C6B4Bff177'


describe("Auction", () => {

before(async () => {

  wallets = await ethers.getSigners();
  accounts = [];

  MockToken = await ethers.getContractFactory("MockToken");
  OrderBooks = await ethers.getContractFactory("OrderBooks");
  TradePairs = await ethers.getContractFactory("TradePairs");
  Exchange = await ethers.getContractFactory("Exchange");
  Portfolio = await ethers.getContractFactory("Portfolio");

  deploymentAccount = wallets[0];
  console.log("deploymentAccount =", deploymentAccount.address);

  //const auctionAdminWallet = new ethers.Wallet(nconf.get("AUCTION_ADMIN_KEY"), provider);
  auctionAdminWallet = wallets[1] // AUCTION Admin Account  HH
  console.log("Auction Admin Account:", auctionAdminWallet.address)

  // initialize OrderBooks contract
  console.log();
  console.log("=== Initialize OrderBooks Contract ===");
  orderBooks = await upgrades.deployProxy(OrderBooks);
  console.log("OrderBooks contract deployed at: ", orderBooks.address)

  // initialize Portfolio contract
  portfolio = await upgrades.deployProxy(Portfolio);
  console.log("OrderBooks contract deployed at: ", portfolio.address)

  // initialize TradePairs contract
  console.log();
  console.log("=== Initialize TradePairs Contract ===");
  tradePairs = await upgrades.deployProxy(TradePairs, [orderBooks.address, portfolio.address]);
  console.log("TradePairs contract deployed at: ", tradePairs.address)

  // initialize portfolios with state-chaning ABIs
  for (var i=0; i<numberOfAccounts; i++) {
    portfolioC = await new ethers.Contract(portfolio.address, PortfolioAbi.abi, wallets[i])
    tradePairsC = await new ethers.Contract(tradePairs.address, TradePairsAbi.abi, wallets[i])
    accounts[i]= {address: wallets[i].address, portfolioC, tradePairsC}
  }

  //console.log("=== Accounts ===");
  //console.log(accounts);
  // get depositFeeRate
  depositFeeRate = parseFloat((await portfolio.getDepositFeeRate()).toString())/10000;

  // initialize address collecting fees
  console.log("=== Set Address Collecting the Fees ===");
  await portfolio.setFeeAddress(foundationSafe);
  console.log("Called setFeeAddress on Portfolio ");

  console.log();
  console.log("=== Creating and Minting Mock Tokens ===");

  for (var j=0; j<tokenList.length; j++) {
      _tokenStr = tokenList[j];
      _tokenBytes32 = Utils.fromUtf8(_tokenStr);
      _tokenDecimals = decimalsMap[_tokenStr];
      _token = await MockToken.deploy("Mock " + _tokenStr + " Token", _tokenStr, _tokenDecimals);
      await portfolio.addToken(Utils.fromUtf8(await _token.symbol()), _token.address, startAuctionMode); //Auction mode on
      for (i=0; i<numberOfAccounts; i++) {
          account = accounts[i].address;
          //console.log("Account:", account, "before minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
          _mint_amount = initial_mints[_tokenStr] - Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals);
          if (_mint_amount>0) {
              await _token.mint(account, Utils.parseUnits(_mint_amount.toString(), _tokenDecimals));
              //console.log("Account:", account, "after minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
          }
      }
  }

  tokenAddressMap = {};
  tokenAddressMap["AVAX"] = "0x0000000000000000000000000000000000000000";
  for (var j=0; j<tokenList.length; j++) {
      _tokenStr = tokenList[j];
      _tokenAddr = await portfolio.getToken(Utils.fromUtf8(_tokenStr));
      _token = await MockToken.attach(_tokenAddr);
      tokenAddressMap[_tokenStr] = _token.address;
  }
  console.log(tokenAddressMap);

  console.log();
  console.log("=== Making Initial Portfolio Deposits ===");
  for (var i=0; i<numberOfAccounts; i++) {
      wallet = wallets[i];
      account = accounts[i].address;
      iportfolio = accounts[i].portfolioC;

      // deposit native coin for account to portfolio
      _nativeBytes32 = Utils.fromUtf8(native);
      _bal = await portfolio.getBalance(account, _nativeBytes32);
      Utils.printBalances(account, _bal, 18);
      if ((parseFloat(Utils.fromWei(_bal.total)) + parseFloat(Utils.fromWei(_bal.available))) < initial_portfolio_deposits[native]) {
          _deposit_amount = initial_portfolio_deposits[native] - Utils.fromWei(_bal.total) - Utils.fromWei(_bal.available);
          await wallet.sendTransaction({from: account,
                                        to: portfolio.address,
                                        value: Utils.toWei(_deposit_amount.toString())});
          //console.log("Deposited for", account, _deposit_amount, native, "to portfolio.");
          _bal = await portfolio.getBalance(account, _nativeBytes32);
          //Utils.printBalances(account, _bal, 18);
      }
      console.log();

      // deposit ERC20 token for account to portfolio
      for (var j=0; j<tokenList.length; j++) {
          _tokenStr = tokenList[j];
          _tokenBytes32 = Utils.fromUtf8(_tokenStr);
          _tokenAddr = await portfolio.getToken(_tokenBytes32);
          _token = await MockToken.attach(_tokenAddr);
          _token = new ethers.Contract(_tokenAddr, MockTokenAbi.abi, wallet);
          _tokenDecimals = await _token.decimals();
          _bal = await portfolio.getBalance(account, _tokenBytes32);
          Utils.printBalances(account, _bal, _tokenDecimals);
          if ((parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) + parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals))) < initial_portfolio_deposits[_tokenStr]) {
              _deposit_amount = initial_portfolio_deposits[_tokenStr] - parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) - parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals));
              _deposit_amount_bn = Utils.parseUnits(_deposit_amount.toString(), _tokenDecimals);
              await _token.approve(portfolio.address, _deposit_amount_bn, options);
              //console.log("Approve:", account, "to deposit ", _deposit_amount, _tokenStr, "to portfolio.");
              await iportfolio.depositToken(account, Utils.fromUtf8(_tokenStr), _deposit_amount_bn, options);
              //console.log("Deposit:", account, _deposit_amount, _tokenStr, "to portfolio.");
              _bal = await portfolio.getBalance(account, _tokenBytes32);
              //Utils.printBalances(account, _bal, _tokenDecimals);
          }
          console.log();
      }
      console.log();
  }



  // initialize Exchange contract and create the TradePairs  "AVAX/USDT" "AVAX/BUSD" ....
  console.log();
  console.log("=== Initialize Exchange Contract ===");
  exchange = await upgrades.deployProxy(Exchange);
  await exchange.setPortfolio(portfolio.address);
  console.log("Called setPortfolio on Exchange");
  await exchange.setTradePairs(tradePairs.address);
  console.log("Called setTradePairs on Exchange");
  console.log("Exchange contract deployed at: ", exchange.address)

  // adjust ownership and access hierarchy among contracts for security
  //
  // OrderBooks through Ownable
  const tx_orderBooks = await orderBooks.transferOwnership(tradePairs.address)
  await tx_orderBooks.wait()
  console.log(`OrderBooks at ${orderBooks.address} ownership transferred to ${await orderBooks.owner()}.`)

  // TradePairs through Ownable
  const tx_tradePairs = await tradePairs.transferOwnership(exchange.address)
  await tx_tradePairs.wait()
  console.log(`TradePairs at ${tradePairs.address} ownership transferred to ${await tradePairs.owner()}.`)

  // Portfolio through AccessControl
  await portfolio.addAdmin(exchange.address);
  console.log("Exchange added to portfolio admin group.");
  await portfolio.addAdmin(tradePairs.address);
  console.log("TradePairs added to portfolio admin group.");

  pairs = [];
  for (var j=0; j<tokenPairs.length; j++) {
      pair = tokenPairs[j]
      symbols = pair.split("/", 2);
      baseSymbol = symbols[0];
      quoteSymbol = symbols[1];
      tokenAddr = await portfolio.getToken(Utils.fromUtf8(quoteSymbol));
      token = await MockToken.attach(tokenAddr);
      pairs.push({id: pair, pairIdAsBytes32: Utils.fromUtf8(pair), baseSymbol, quoteSymbol,
                  baseDecimals: 18, basePriceDecimal: baseDisplayDecimalMap[pair],
                  quoteDecimals: await token.decimals(), quotePriceDecimal: quoteDisplayDecimalMap[pair],
                  minTradeAmount: minTradeAmountMap[pair], maxTradeAmount:maxTradeAmountMap[pair]});
  }

  for (const pair of pairs)  {
      pairIdAsBytes32 = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32
      await exchange.addTradePair(pairIdAsBytes32,
                                  tokenAddressMap[pair.baseSymbol], pair.basePriceDecimal,
                                  tokenAddressMap[pair.quoteSymbol],  pair.quotePriceDecimal,
                                  Utils.parseUnits((pair.minTradeAmount).toString(), pair.quoteDecimals),
                                  Utils.parseUnits((pair.maxTradeAmount).toString(), pair.quoteDecimals), startAuctionMode);
      console.log(`${pair.id} added to TradePairs at ${tradePairs.address} with min trade amount of ${pair.minTradeAmount}.`)
      await exchange.addOrderType(pairIdAsBytes32, 0)  // 0 = MARKET, 1 = LIMIT
      console.log(`MARKET order type added to ${pair.id} at ${tradePairs.address}.`)
      await exchange.updateRate(pairIdAsBytes32, 10, 0)
      console.log(`${pair.id} at ${tradePairs.address} has its MAKER fee rate updated to 10/10000.`)
      await exchange.updateRate(pairIdAsBytes32, 20, 1)
      console.log(`${pair.id} at ${tradePairs.address} has its TAKER fee rate updated to 20/10000.`)
  }


  await exchange.addAuctionAdmin(auctionAdminWallet.address);

  // get native list at system start-up
  console.log();
  console.log("=== Native Coin at Start-Up ===");
  _native = await portfolio.native(); // return is bytes32[]
  console.log(Utils.toUtf8(_native));

  // get token list at system start-up
  console.log();
  console.log("=== ERC20 Token List at Start-Up ===");
  _tokenList = await portfolio.getTokenList(); // return is bytes32[]
  for (var i=0; i < _tokenList.length; i++) {
      console.log(Utils.toUtf8(_tokenList[i]));
  }

  // check all balances at the start of orders processing
  console.log();
  console.log("=== Portfolio State Before Processing Orders ===");
  for (var i=0; i<numberOfAccounts; i++) {
      account = accounts[i].address;
      for (var j=0; j<tokens.length; j++) {
          token = tokens[j];
          res = await accounts[i].portfolioC.getBalance(account, Utils.fromUtf8(token));
          Utils.printBalances(account, res, decimalsMap[token]);
      }
  }



  orders = new Map();
  pair = pairs[0];
  auctionAdmin = await new ethers.Contract(exchange.address, ExchangeAbi.abi, wallets[1])


});


it("... Auction should be setup properly", async () => {
  console.log();
  tradePairC = accounts[0].tradePairsC;

  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  console.log (`${pair.id} Auction Mode ${auctionData.mode},  price ${auctionData.price.toString()}, Pct ${auctionData.percent.toString()} ` )

  // exchange.getOrderType(pairIdAsBytes32, 0) ONLY LIMIT Orders

  expect(auctionData.mode).to.equal(2);
  expect(auctionData.price).to.equal(0);
  expect(auctionData.lower).to.equal(0);
  expect(auctionData.upper).to.equal(0);
  expect(auctionData.percent).to.equal(1000);
  expect(await exchange.isAuctionAdmin(auctionAdminWallet.address) ).to.equal(true);
  expect(await portfolio.isAuctionAdmin(auctionAdminWallet.address) ).to.equal(true);

});

it("... Nobody can withdraw auction token when mode=OPEN", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 2)
  expect(auctionData.mode).to.equal(2);
  for (i=0; i<10; i++) {  // 2 sells at 0.01
    await expect(withdrawToken(accounts[i].address, accounts[i].portfolioC, 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals) ).to.be.revertedWith("P-AUCT-02");
  }
});

it("...Send orders ", async () => {
  console.log();
  side = 1;//SELL

  for (i=0; i<2; i++) {  // 2 sells at 0.01
    tradePairC = accounts[i].tradePairsC;
    let order= {tp: pairIdAsBytes32, price: "0.01", quantity:"1000", side}
    expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true);
    await expect(withdrawToken(accounts[i].address, accounts[i].portfolioC, 100, Utils.fromUtf8(pair.baseSymbol) , pair.baseDecimals) ).to.be.revertedWith("P-AUCT-02");

  }

  side = 0;//BUY
  for (i=2; i<4; i++) {  // 2 buys  at 5000000
    tradePairC = accounts[i].tradePairsC;
    let order= {tp: pairIdAsBytes32, price: "500000", quantity:"0.01", side}
    expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true);
  }



  side = 0;//BUY
  for (i=4; i<6; i++) {
    tradePairC = accounts[i].tradePairsC;
    let order= {tp: pairIdAsBytes32, price: "50000", quantity:"0.01", side}
    if(i===5) {
      order.quantity="0.02"
    }
     expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true);
  }

  side = 0;//BUY
  for (i=6; i<8; i++) {
    tradePairC = accounts[i].tradePairsC;
    let order= {tp: pairIdAsBytes32, price: "1", quantity:"5000", side}
     expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true);
  }

  side = 1;//SELL
  for (i=8; i<10; i++) {
    tradePairC = accounts[i].tradePairsC;
    let order= {tp: pairIdAsBytes32, price: "0.02", quantity:"500", side}
    if(i===9) {
      order.quantity="501"
    }
     expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true);
  }

  expect(orders.size).to.equal(10);

});

it("... All order operations allowed when CLOSING ", async () => {

  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 3)
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  console.log (`${pair.id} Auction Mode ${auctionData.mode},  price ${auctionData.price.toString()}, Pct ${auctionData.percent.toString()} ` )

  side = 1;//SELL
  tradePairC = accounts[3].tradePairsC;

  let order= {tp: pairIdAsBytes32, price: "0.03", quantity:"400", side}
  expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true);
  order = findOrder(accounts[3].address, side, BigNumber("400"), BigNumber("0.03"), orders);
  expect(await CancelReplaceOrder(tradePairC, order, "0.03", "410", pair, orders) ).to.equal(true);
  order = findOrder(accounts[3].address,side, BigNumber("410"), BigNumber("0.03"), orders);
  expect(await cancelOrder(tradePairC, order,  pair, orders)).to.equal(true);


});

it("... Nobody can withdraw auction token when mode=CLOSING", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 3)
  expect(auctionData.mode).to.equal(3);
  for (i=0; i<10; i++) {
    await expect(withdrawToken(accounts[i].address, accounts[i].portfolioC, 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals) ).to.be.revertedWith("P-AUCT-02");
  }
});


it("... Can't have any order operation when MATCHING", async () => {
  console.log();
  // OFF = 0,
  // LIVETRADING = 1,
  // OPEN = 2,
  // CLOSING = 3,
  // PAUSED = 4,
  // MATCHING = 5
  // CLOSINGT2 = 6
  // RESTRICTED = 7
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 5)
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  console.log (`${pair.id} Auction Mode ${auctionData.mode},  price ${auctionData.price.toString()}, Pct ${auctionData.percent.toString()} ` )

  side = 0;//BUY
  tradePairC = accounts[3].tradePairsC;
  let order= {tp: pairIdAsBytes32, price: "500000", quantity:"0.01", side}
  await expect(addOrder (tradePairC, order,  pair, orders) ).to.be.revertedWith("T-PPAU-01");


  order = findOrder(accounts[3].address, side, BigNumber("0.01"), BigNumber("500000"), orders);
  await expect(cancelOrder(tradePairC, order,  pair, orders)).to.be.revertedWith("T-PPAU-02");
  await expect(CancelReplaceOrder(tradePairC, order, "0.03", "410", pair, orders)).to.be.revertedWith("T-PPAU-04");
  orderids=[]
  orderids[0]= order.id;
  await expect(cancelAllOrders(tradePairC, orderids,  pair, orders)).to.be.revertedWith("T-PPAU-03");

});

it("... Nobody can withdraw auction token when mode=MATCHING", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 2)
  expect(auctionData.mode).to.equal(5);
  for (i=0; i<10; i++) {
    await expect(withdrawToken(accounts[i].address, accounts[i].portfolioC, 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals) ).to.be.revertedWith("P-AUCT-02");
  }
});



it("... Can't set LIVETRADING or OFF when order book is crossed", async () => {
  await expect(auctionAdmin.setAuctionMode(pairIdAsBytes32, 0)).to.be.revertedWith("T-AUCT-11");
  await expect(auctionAdmin.setAuctionMode(pairIdAsBytes32, 1)).to.be.revertedWith("T-AUCT-11");
});

it("... Set the auction Price & Do the actual matching", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 5);
  await auctionAdmin.setAuctionPrice(pairIdAsBytes32, Utils.parseUnits('0.51', pair.quoteDecimals), 0);
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  expect(auctionData.mode).to.equal(5);
  expect(Utils.formatUnits(auctionData.price, pair.quoteDecimals)).to.equal('0.51');

  for (i=0; i<6; i++) {
    console.log(`${pair.id} **** Matching Orders  **** ${i}`)
    tx = await auctionAdmin.matchAuctionOrders(pairIdAsBytes32, 30 , options);
    result = await tx.wait();
  }

});


it("... Get The OrderBook", async () => {

  tradePairC = accounts[0].tradePairsC;
  sellbook = await getBookwithLoop(tradePairC, pair.id,"SELL");
  buybook =  await getBookwithLoop(tradePairC, pair.id,"BUY");
  expect(sellbook.length).to.equal(0);
  expect(buybook.length).to.equal(1);
  expect(Utils.formatUnits(buybook[0].price, pair.quoteDecimals)).to.equal('1.0');
  expect(Utils.formatUnits(buybook[0].quantity, pair.baseDecimals)).to.equal('6999.05');
  expect(Utils.formatUnits(buybook[0].total, pair.baseDecimals)).to.equal('6999.05');
});



it("... Live Trading Mode : Add then C/R Order ", async () => {
   await auctionAdmin.setAuctionMode(pairIdAsBytes32, 1);
   auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
   expect(auctionData.mode).to.equal(1);

   side = 1;//SELL
   tradePairC = accounts[3].tradePairsC;

   let order= {tp: pairIdAsBytes32, price: "1.03", quantity:"200", side}
   expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true);
  //  order = findOrder(accounts[3].address, side, BigNumber("200"), BigNumber("1.03"), orders);
  //  await expect( CancelReplaceOrder(tradePairC, order, "1.04", "250", pair, orders) ).to.be.revertedWith("T-AUCT-13");

});


it("... Nobody can withdraw auction token when mode=LIVE_TRADING", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 1)
  expect(auctionData.mode).to.equal(1);
  for (i=0; i<10; i++) {
    await expect(withdrawToken(accounts[i].address, accounts[i].portfolioC, 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals) ).to.be.revertedWith("P-AUCT-02");
  }
});

it("... Get The OrderBook", async () => {

  tradePairC = accounts[0].tradePairsC;
  sellbook = await getBookwithLoop(tradePairC, pair.id,"SELL");
  buybook =  await getBookwithLoop(tradePairC, pair.id,"BUY");
  expect(sellbook.length).to.equal(1);
  expect(buybook.length).to.equal(1);
  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.03');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('200.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('200.0');
});


it("... Make a partial fill ", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 1);
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  expect(auctionData.mode).to.equal(1);

  side = 0; //BUY
  tradePairC = accounts[4].tradePairsC;
  let order= {tp: pairIdAsBytes32, price: "1.03", quantity:"180", side}
  expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true); // This will be fully filled


});

it("... Get The OrderBook", async () => {

  tradePairC = accounts[0].tradePairsC;
  sellbook = await getBookwithLoop(tradePairC, pair.id,"SELL");
  buybook =  await getBookwithLoop(tradePairC, pair.id,"BUY");
  expect(sellbook.length).to.equal(1);
  expect(buybook.length).to.equal(1);
  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.03');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('20.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('20.0');
});


it("... Cancel All Outstanding Buy Orders ", async () => {

  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 1);
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  expect(auctionData.mode).to.equal(1);

    for (i=6; i<8; i++) {
      tradePairC = accounts[i].tradePairsC;
      order = findOrder(accounts[i].address, 0, BigNumber("5000"), BigNumber("1"), orders);
      if (order) {
        await cancelOrder(tradePairC, order,  pair, orders);
      }
    }

});

it("... Get The OrderBook", async () => {
  tradePairC = accounts[0].tradePairsC;
  sellbook = await getBookwithLoop(tradePairC, pair.id,"SELL");
  buybook =  await getBookwithLoop(tradePairC, pair.id,"BUY");
  expect(sellbook.length).to.equal(1);
  expect(buybook.length).to.equal(0);
  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.03');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('20.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('20.0');
});

it("... Can set the auction mode to 1 when nothing in buybook ", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 1);
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  expect(auctionData.mode).to.equal(1);
});


it("... Cancel All Outstanding Sell Orders ", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 1);
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  expect(auctionData.mode).to.equal(1);
  order = findOrder(accounts[3].address, 1 , BigNumber("200"), BigNumber("1.03"), orders);
  if (order) {
   expect(await cancelOrder(accounts[3].tradePairsC , order,  pair, orders)).to.equal(true);
  }

});

it("... Can set the auction mode to 1 when both books are empty ", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 1);
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  expect(auctionData.mode).to.equal(1);
});

it("... ALL OUTSTANING ORDERS CANCELED! All Portfolio Totals Should be equal to available ", async () => {

    for (var i=0; i<accounts.length; i++) {
        _owner = accounts[i].address;
        for (var j=0; j < tokens.length; j++) {
            _token = tokens[j];
            _bal = await portfolio.getBalance(_owner, Utils.fromUtf8(_token));
            //console.log(_owner , _token,  "Bal Total ", Utils.formatUnits(_bal.total, decimalsMap[_token]) , "Available", Utils.formatUnits(_bal.available, decimalsMap[_token]));
            expect(_bal.total).to.equal(_bal.available);
        }
    }

});


it("... Turn Auction Mode OFF. Match 2 orders Live", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 0);
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  expect(auctionData.mode).to.equal(0);

  side = 1;//SELL

  order= {tp: pairIdAsBytes32, price: "0.03", quantity:"400", side}
  expect(await addOrder(accounts[3].tradePairsC, order,  pair, orders) ).to.equal(true);
  // order = findOrder(accounts[3].address, side, BigNumber("400"), BigNumber("0.03"), orders);
  // await expect( CancelReplaceOrder(tradePairC, order, "0.03", "410", pair, orders) ).to.be.revertedWith("T-AUCT-13");

  tradePairC = accounts[4].tradePairsC;
  order= {tp: pairIdAsBytes32, price: "0.03", quantity:"400", side:0}
  expect(await addOrder (tradePairC, order,  pair, orders) ).to.equal(true);

});

it("... Get The OrderBook", async () => {
  tradePairC = accounts[0].tradePairsC;
  sellbook = await getBookwithLoop(tradePairC, pair.id,"SELL");
  buybook =  await getBookwithLoop(tradePairC, pair.id,"BUY");
  expect(sellbook.length).to.equal(0);
  expect(buybook.length).to.equal(0);
  // expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.03');
  // expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('20.0');
  // expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('20.0');
});


it("... Turn Auction Mode OFF. Withdrawal Allowed of Auction Token ", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 0);
  auctionData= (await exchange.getAuctionData(pairIdAsBytes32));
  expect(auctionData.mode).to.equal(0);
});


it("... All oders filled! All Portfolio Totals Should be equal to available ", async () => {

  for (var i=0; i<accounts.length; i++) {
      _owner = accounts[i].address;
      for (var j=0; j < tokens.length; j++) {
          _token = tokens[j];
          _bal = await portfolio.getBalance(_owner, Utils.fromUtf8(_token));
          //console.log(_owner , _token,  "Bal Total ", Utils.formatUnits(_bal.total, decimalsMap[_token]) , "Available", Utils.formatUnits(_bal.available, decimalsMap[_token]));
          expect(_bal.total).to.equal(_bal.available);
          if (token==='LFG') {
            accounts[i].lfgBalance = _bal.total;
          }
      }
  }

});


it("... Can withdraw auction token when mode=OFF", async () => {
  await auctionAdmin.setAuctionMode(pairIdAsBytes32, 0)
  expect(auctionData.mode).to.equal(0);
  for (i=0; i<10; i++) {
     expect(await withdrawToken(accounts[i].address, accounts[i].portfolioC, 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals) ).to.equal(true);
  }
});

it("... Balance Check After Auction Token withdraw ", async () => {

  for (var i=0; i<accounts.length; i++) {
      _owner = accounts[i].address;
      for (var j=0; j < tokens.length; j++) {
          _token = tokens[j];
          _bal = await portfolio.getBalance(_owner, Utils.fromUtf8(_token));
          //console.log(_owner , _token,  "Bal Total ", Utils.formatUnits(_bal.total, decimalsMap[_token]) , "Available", Utils.formatUnits(_bal.available, decimalsMap[_token]));
          expect(_bal.total).to.equal(_bal.available);
          if (token==='LFG') {
            expect(_bal.total).to.equal(accounts[i].lfgBalance.sub(Utils.parseUnits('100', pair.baseDecimals) ));
          }
      }
  }

});


}).timeout(240000);

async function depositToken (account, portfolio, contract, symbolByte32,  decimals, deposit_amount) {
  const tx1 = await contract.approve(portfolio.address, Utils.parseUnits(deposit_amount.toString(), decimals), options);
  const log = await tx1.wait();

  const tx = await portfolio.depositToken(account, symbolByte32, Utils.parseUnits(deposit_amount.toString(), decimals), options);
  const log2 =await tx.wait();

}

async function  withdrawToken(account, portfolio, withdrawal_amount, symbolByte32 , decimals) {
  const tx = await portfolio.withdrawToken(account, symbolByte32, Utils.parseUnits(withdrawal_amount.toString(), decimals), options);
  const log =await tx.wait();
  return true;
}

async function addOrder (tradePairC, order,  pair, orders) {

    const tx = await tradePairC.addOrder(order.tp, Utils.parseUnits(order.price, pair.quoteDecimals),
    Utils.parseUnits(order.quantity, pair.baseDecimals), order.side, 1, options );

    const orderLog = await tx.wait();
    if (orderLog){
      for (let _log of orderLog.events) {
        if (_log.event) {
          if (_log.event === 'OrderStatusChanged') {
            var rOrder= await processOrders( _log.args.traderaddress, _log.args.pair, _log.args.id, _log.args.price, _log.args.totalamount, _log.args.quantity,
                _log.args.side, _log.args.type1, _log.args.status, _log.args.quantityfilled, _log.args.totalfee , _log,  pair.baseDecimals,  pair.quoteDecimals) ;
            orders.set(rOrder.id, rOrder);
            return true
          }
        }
      }
    }

}

async function cancelOrder  (tradePairC, order,  pair, orders) {
      const tx = await tradePairC.cancelOrder(Utils.fromUtf8(order.pair), order.id, options);
      const orderLog = await tx.wait();

      if (orderLog){
        for (let _log of orderLog.events) {
          if (_log.event) {
            if (_log.event === 'OrderStatusChanged') {
              var rOrder=  await processOrders(_log.args.traderaddress, _log.args.pair, _log.args.id, _log.args.price, _log.args.totalamount, _log.args.quantity,
                    _log.args.side, _log.args.type1, _log.args.status, _log.args.quantityfilled, _log.args.totalfee , _log,  pair.baseDecimals,  pair.quoteDecimals) ;
              orders.set(rOrder.id, rOrder);
            }
          }
        }
      }
    return true;
}


async function cancelAllOrders  (tradePairC, orderIds,  pair, orders) {
  const tx = await tradePairC.cancelAllOrders(pair.pairIdAsBytes32, orderIds, options);
  const orderLog = await tx.wait();

  if (orderLog){
    for (let _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          var rOrder=  await processOrders(_log.args.traderaddress, _log.args.pair, _log.args.id, _log.args.price, _log.args.totalamount, _log.args.quantity,
                _log.args.side, _log.args.type1, _log.args.status, _log.args.quantityfilled, _log.args.totalfee , _log,  pair.baseDecimals,  pair.quoteDecimals) ;
          orders.set(rOrder.id, rOrder);
        }
      }
    }
  }
return true;
}



async function makeOrder ( traderaddress, pair, id, price, totalamount, quantity, side, type1
  , status, quantityfilled, totalfee, tx, blocknbr, gasUsed, gasPrice, cumulativeGasUsed, baseDecimals, quoteDecimals) {

  return {id: id
    , traderaddress: traderaddress
    , quantity:new BigNumber(Utils.formatUnits(quantity.toString(), baseDecimals))
    , pair: Utils.toUtf8(pair)
    , tx: tx
    , price: new BigNumber(Utils.formatUnits(price.toString(), quoteDecimals))
    , side: parseInt(side)
    , type: parseInt(type1)
    , status: parseInt(status)
    , quantityfilled: new BigNumber(Utils.formatUnits(quantityfilled.toString(), baseDecimals))
    , totalamount: new BigNumber(Utils.formatUnits(totalamount.toString(), quoteDecimals))
    , totalfee: new BigNumber(parseInt(side) === 0 ? Utils.formatUnits(totalfee.toString(), baseDecimals) : Utils.formatUnits(totalfee.toString(), quoteDecimals))
    , blocknbr: blocknbr
    , gasUsed:  gasUsed
    , gasPrice: Utils.formatUnits(gasPrice, 9)
    , cumulativeGasUsed: cumulativeGasUsed
    };
  }


async function processOrders ( traderaddress, pair, id, price, totalamount, quantity, side, type1
  , status, quantityfilled, totalfee , event,  baseDecimals,  quoteDecimals) {
  try {

      //var tx = await event.getTransactionReceipt();

      var order = await makeOrder(traderaddress,
        pair,
        id,
        price,
        totalamount,
        quantity,
        side, type1, status,
        quantityfilled,
        totalfee,
        event.transactionHash,
        event.blockNumber,
        '225',
         '225',
         '225',
        baseDecimals,  quoteDecimals
        );

        return order;

  } catch (error) {
    console.log ("Error during  processOrders" , error)
  }
}


 function findOrder(owner, side, quantity, price, orders)  {
  for (let order of orders.values()){
    //this.logger.debug (`Order: ${order.side}  ${order.quantity.toString()}  ${order.price.toString()}`);
    if (order.traderaddress ===owner
        && order.side===side
          && order.quantity.eq(quantity)
            && order.price.eq(price) ){
      return order;
    }
  }
}

async function CancelReplaceOrder (tradePairC, order,  newpx, newqty, pair, orders) {

  const tx = await tradePairC.cancelReplaceOrder(Utils.fromUtf8(order.pair), order.id, Utils.parseUnits(newpx, pair.quoteDecimals),
  Utils.parseUnits(newqty, pair.baseDecimals),  options );

  const orderLog = await tx.wait();
  if (orderLog){
    for (let _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          var rOrder= await processOrders( _log.args.traderaddress, _log.args.pair, _log.args.id, _log.args.price, _log.args.totalamount, _log.args.quantity,
              _log.args.side, _log.args.type1, _log.args.status, _log.args.quantityfilled, _log.args.totalfee , _log,  pair.baseDecimals,  pair.quoteDecimals) ;
          orders.set(rOrder.id, rOrder);

        }
      }
    }
  }
  return true;
}

getBookwithLoop = async (tradePairsC, tradePair, side) => {

  const map1 = new Map();
  let price = BigNumberEthers.from(0);
  let lastOrderId = Utils.fromUtf8("");
  const pairId = Utils.fromUtf8(tradePair);
  let book;
  let i;
  let nPrice = 50;
  let nOrder = 50
  //console.log( `getBookwithLoop called ${tradePair} ${side}: `);
  let k =0;
  let total = BigNumberEthers.from(0);
  do {
    try {
    if (side === "BUY") {
      book = await tradePairsC.getNBuyBook(pairId, nPrice, nOrder, price.toString(), lastOrderId);
    } else {
      book = await tradePairsC.getNSellBook(pairId, nPrice, nOrder, price.toString(), lastOrderId);
    }
    } catch (error){
      console.log(`${tradePair} ,getBookwithLoop  ${side} pass :  ${k} `, error );
    }

    price = book[2];
    lastOrderId = book[3];
    k +=1;

    let currentRecord;
    for (i = 0; i < book[0].length; i++) {
      if (book[0][i].eq(0)) {
        //console.log (i);
        break;
      } else {
        const key = book[0][i].toString();
        if (map1.has(key)) {
          currentRecord = map1.get(key);
          if (currentRecord) {
            currentRecord.quantity = book[1][i].add(currentRecord.quantity);
          }
        } else {
          map1.set(key, {
            price: book[0][i],
            quantity: book[1][i],
            total
          });
        }
      }
    }
  } while (price.gt(0) || lastOrderId != Utils.fromUtf8(""));

  const orderbook= Array.from(map1.values());

  //Calc Totals orderbook.length>0 ? orderbook[0].quantity:

  for (i = 0; i < orderbook.length; i++) {
    total = total.add(orderbook[i].quantity);
    orderbook[i].total = total;
  }

  return orderbook;
};
