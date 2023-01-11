/**
 * The test runner for auction on Dexalot decentralized exchange
 */

import Utils from './utils';

import BN from 'bignumber.js';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  MockToken,
  MockToken__factory,
  ExchangeSub,
  PortfolioMain,
  PortfolioSub,
  TradePairs,
  OrderBooks,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Event } from "ethers";

let MockToken: MockToken__factory;

// using the first numberOfAccounts accounts
const numberOfAccounts = 10;

// initial state
// do transfers to Portfolio contract as follows before starting tests
const tokens: string[] = ["AVAX", "LFG", "SER"];

const decimalsMap: any = {"AVAX": 18, "LFG": 18, "SER": 18}

const native = "AVAX";

const tokenList: string[] = ["LFG", "SER"];

const tokenPairs: string[] = ["LFG/SER"];

const minTradeAmountMap: any = {"LFG/SER": 10}

const maxTradeAmountMap: any = {"LFG/SER": 10000}

const baseDisplayDecimalMap: any = {"LFG/SER": 2}

const quoteDisplayDecimalMap: any = {"LFG/SER": 2}

const initial_mints: any = {AVAX: 10000, LFG: 15000, SER: 50000};

const initial_portfolio_deposits: any = {AVAX: 9000, LFG: 14000, SER: 45000};

const startAuctionMode: any = 2;

// address (a multisig in production) that collects the fees
const feeSafe = '0x48a04b706548F7034DC50bafbF9990C6B4Bff177'

let wallets: Array<SignerWithAddress>;
let accounts: Array<string>;

let deploymentWallet: SignerWithAddress;
let deploymentAccount: string;

let auctionAdminWallet: SignerWithAddress;
let auctionAdminAccount: string;

let exchange: ExchangeSub
let portfolio: PortfolioSub
let portfolioMain: PortfolioMain
let tradePairs: TradePairs
let orderBooks: OrderBooks

let _tokenStr: string;
let _tokenDecimals: number;
let _tokenBytes32: string;
let _tokenAddr: string;
let _token: MockToken;

let pairs: any;

interface IOrder {
  id: string;
  tp: string;
  price: string;
  quantity: string;
  side: number;
  type1: number;
  type2: number;
}

const orders = new Map<string, any>()

const lfgBalances: Array<BigNumber> = [];

describe("Auction", () => {

before(async () => {

  wallets = await ethers.getSigners();
  accounts = [];
  for (let i=0; i<numberOfAccounts; i++) {
      accounts[i] = wallets[i].address;
  }
  console.log("=== Accounts ===");
  console.log(accounts);
  console.log();

  MockToken = await ethers.getContractFactory("MockToken");

  deploymentWallet = wallets[0];
  deploymentAccount = deploymentWallet.address;
  console.log("deploymentAccount =", deploymentAccount);

  //const auctionAdminWallet = new ethers.Wallet(nconf.get("AUCTION_ADMIN_KEY"), provider);
  auctionAdminWallet = wallets[1] // AUCTION Admin Account  HH
  auctionAdminAccount = accounts[1];
  console.log("Auction Admin Account:", auctionAdminAccount)

  const {portfolioMain: portfolioM, portfolioSub: portfolioS} = await f.deployCompletePortfolio();
  portfolioMain = portfolioM;
  portfolio = portfolioS;

  orderBooks = await f.deployOrderBooks();
  exchange = await f.deployExchangeSub(portfolio, orderBooks)
  tradePairs = await f.deployTradePairs(orderBooks, portfolio, exchange);


  // initialize address collecting fees
  console.log("=== Set Address Collecting the Fees ===");
  await portfolio.setFeeAddress(feeSafe);
  console.log("Called setFeeAddress on Portfolio ");

  console.log();
  console.log("=== Creating and Minting Mock Tokens ===");

  const srcChainId = 1;

  for (let j=0; j<tokenList.length; j++) {
      _tokenStr = tokenList[j];
      _tokenBytes32 = Utils.fromUtf8(_tokenStr);
      _tokenDecimals = decimalsMap[_tokenStr];
      _token = await f.deployMockToken(_tokenStr, _tokenDecimals);
      let _startAuctionMode: any = 2;
      if (_tokenStr === "SER") _startAuctionMode = 0;

      await f.addToken(portfolio, _token, 0.1, _startAuctionMode);
      await f.addToken(portfolioMain, _token, 0.1, _startAuctionMode);

      for (let i=0; i<numberOfAccounts; i++) {
          const account = wallets[i].address;
          //console.log("Account:", account, "before minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
          const _mint_amount = initial_mints[_tokenStr] - Utils.formatUnits((await _token.balanceOf(account)), await _token.decimals());
          if (_mint_amount>0) {
              await _token.mint(account, Utils.parseUnits(_mint_amount.toString(), await _token.decimals()));
              //console.log("Account:", account, "after minting", _tokenStr, Utils.formatUnits((await _token.balanceOf(account)), _tokenDecimals));
          }
      }
  }

  const tokenAddressMap: any = {};
  tokenAddressMap["AVAX"] = "0x0000000000000000000000000000000000000000";
  for (let j=0; j<tokenList.length; j++) {
      _tokenStr = tokenList[j];
      _tokenAddr = await portfolioMain.getToken(Utils.fromUtf8(_tokenStr));
      _token = MockToken.attach(_tokenAddr);
      tokenAddressMap[_tokenStr] = _token.address;
  }
  console.log(tokenAddressMap);

  console.log();
  console.log("=== Making Initial Portfolio Deposits ===");

  for (let i=0; i<numberOfAccounts; i++) {
    const wallet = wallets[i];
    const account = accounts[i];

      // deposit native coin for account to portfolio
      const _nativeBytes32 = Utils.fromUtf8(native);
      let _bal = await portfolio.getBalance(account, _nativeBytes32);
      Utils.printBalances(account, _bal, 18);
      if ((parseFloat(Utils.fromWei(_bal.total)) + parseFloat(Utils.fromWei(_bal.available))) < initial_portfolio_deposits[native]) {
        const _deposit_amount = initial_portfolio_deposits[native] - Utils.fromWei(_bal.total) - Utils.fromWei(_bal.available);
          await wallet.sendTransaction({to: portfolioMain.address,
                                        value: Utils.toWei(_deposit_amount.toString())});
          //console.log("Deposited for", account, _deposit_amount, native, "to portfolio.");
          _bal = await portfolio.getBalance(account, _nativeBytes32);
          Utils.printBalances(account, _bal, 18);
      }
      console.log();

      // deposit ERC20 token for account to portfolio
      for (let j=0; j<tokenList.length; j++) {
          _tokenStr = tokenList[j];
          _tokenBytes32 = Utils.fromUtf8(_tokenStr);
          _tokenAddr = await portfolioMain.getToken(_tokenBytes32);
          console.log(`${_tokenStr} @ ${_tokenAddr}`)
          _token = MockToken.attach(_tokenAddr);
          _tokenDecimals = await _token.decimals();
          _bal = await portfolio.getBalance(account, _tokenBytes32);
          Utils.printBalances(account, _bal, _tokenDecimals);
          if ((parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) + parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals))) < initial_portfolio_deposits[_tokenStr]) {
            const _deposit_amount = initial_portfolio_deposits[_tokenStr] - parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) - parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals));
            const _deposit_amount_bn = Utils.parseUnits(_deposit_amount.toString(), _tokenDecimals);
              await _token.connect(wallet).approve(portfolioMain.address, _deposit_amount_bn);
              //console.log("Approve:", account, "to deposit ", _deposit_amount, _tokenStr, "to portfolio.");
              await portfolioMain.connect(wallet).depositToken(account, _tokenBytes32, _deposit_amount_bn, 0);
              //console.log("Deposit:", account, _deposit_amount, _tokenStr, "to portfolio.");
              _bal = await portfolio.getBalance(account, _tokenBytes32);
              //Utils.printBalances(account, _bal, _tokenDecimals);
          }
          console.log();
      }
  }

  // initialize Exchange contract and create the TradePairs  "AVAX/USDT" "AVAX/BUSD" ....
  console.log("=== Initialize Exchange Contract ===");
  console.log("ExchangeSub contract deployed at: ", exchange.address)

  pairs = [];
  for (let j=0; j<tokenPairs.length; j++) {
    const pair = tokenPairs[j]
    const symbols = pair.split("/", 2);
    const baseSymbol = symbols[0];
    const quoteSymbol = symbols[1];
    const tokenAddr = await portfolioMain.getToken(Utils.fromUtf8(quoteSymbol));
    const token = MockToken.attach(tokenAddr);
      pairs.push({id: pair, pairIdAsBytes32: Utils.fromUtf8(pair), baseSymbol, quoteSymbol,
                  baseDecimals: 18, basePriceDecimal: baseDisplayDecimalMap[pair],
                  quoteDecimals: await token.decimals(), quotePriceDecimal: quoteDisplayDecimalMap[pair],
                  minTradeAmount: minTradeAmountMap[pair], maxTradeAmount:maxTradeAmountMap[pair]});
  }

  for (const pair of pairs)  {
      const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32
      await exchange.addTradePair(tp,
                                  Utils.fromUtf8(pair.baseSymbol), pair.basePriceDecimal,
                                  Utils.fromUtf8(pair.quoteSymbol),  pair.quotePriceDecimal,
                                  Utils.parseUnits((pair.minTradeAmount).toString(), pair.quoteDecimals),
                                  Utils.parseUnits((pair.maxTradeAmount).toString(), pair.quoteDecimals), startAuctionMode);
      console.log(`${pair.id} added to TradePairs at ${tradePairs.address} with min trade amount of ${pair.minTradeAmount}.`)
      await tradePairs.addOrderType(tp, 0)  // 0 = MARKET, 1 = LIMIT
      console.log(`MARKET order type added to ${pair.id} at ${tradePairs.address}.`)
      await tradePairs.updateRate(tp, 10, 0)
      console.log(`${pair.id} at ${tradePairs.address} has its MAKER fee rate updated to 10/10000.`)
      await tradePairs.updateRate(tp, 20, 1)
      console.log(`${pair.id} at ${tradePairs.address} has its TAKER fee rate updated to 20/10000.`)
  }

  await exchange.addAuctionAdmin(auctionAdminWallet.address);

  // get native list at system start-up
  console.log();
  console.log("=== Native Coin at Start-Up ===");
  const _native = await portfolioMain.native(); // return is bytes32[]
  console.log(Utils.toUtf8(_native));

  // get token list at system start-up
  console.log();
  console.log("=== ERC20 Token List at Start-Up ===");
  const _tokenList = await portfolioMain.getTokenList(); // return is bytes32[]
  for (let i=0; i < _tokenList.length; i++) {
      console.log(Utils.toUtf8(_tokenList[i]));
  }

  // check all balances at the start of orders processing
  console.log();
  console.log("=== Portfolio State Before Processing Orders ===");
  for (let i=0; i<numberOfAccounts; i++) {
      const account = wallets[i].address;
      for (let j=0; j<tokens.length; j++) {
          const token = tokens[j];
          const res = await portfolio.getBalance(account, Utils.fromUtf8(token));
          Utils.printBalances(account, res, decimalsMap[token]);
      }
  }
  console.log();
});

beforeEach(async function () {
  // empty
});

it("Should set up auction properly", async () => {
  // OFF = 0,
  // LIVETRADING = 1,
  // OPEN = 2,
  // CLOSING = 3,
  // PAUSED = 4,
  // MATCHING = 5
  // RESTRICTED = 6

  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  expect(await exchange.isAuctionAdmin(auctionAdminWallet.address) ).to.equal(true);
  expect(await exchange.hasRole(await exchange.AUCTION_ADMIN_ROLE(), auctionAdminWallet.address) ).to.equal(true);

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 3)
  await exchange.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('0.03', pair.quoteDecimals));
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(3);
  expect(tradePairData.auctionPrice).to.equal(Utils.parseUnits('0.03', pair.quoteDecimals));
  //console.log (`${pair.id} Auction Mode ${tradePairData.auctionMode},  price ${tradePairData.auctionPrice.toString()}` )
});

it("Should not allow anyone to withdraw auction token when auction mode = 2 (OPEN)", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32
  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 2)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(2);
  for (let i=0; i<10; i++) {  // 2 sells at 0.01
    await expect(withdrawToken(wallets[i], 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals)).to.be.revertedWith("P-AUCT-01");
  }
});

it("Should be able to send orders properly", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;    // trading pair id needs to be bytes32

  let side = 1;//SELL
  const type1 = 1;//LIMIT
  const type2 = 0;//GTC
  const type2toBeReplaced = 3; //PO contract will replace it with GTC

  for (let i=0; i<2; i++) {  // 2 sells at 0.01
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "0.01", quantity: "1000", side, type1, type2:type2toBeReplaced};
    expect(await addOrder(wallets[i], order, pair, orders)).to.equal(true);
  }

  side = 0;//BUY
  for (let i=2; i<4; i++) {  // 2 buys  at 5000000
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "500000", quantity: "0.01", side, type1, type2};
    expect(await addOrder(wallets[i], order, pair, orders)).to.equal(true);
  }

  side = 0;//BUY
  for (let i=4; i<6; i++) {
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "50000", quantity: "0.01", side, type1, type2};
    if(i===5) {
      order.quantity="0.02"
    }
     expect(await addOrder (wallets[i], order, pair, orders)).to.equal(true);
  }

  side = 0;//BUY
  for (let i=6; i<8; i++) {
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "1", quantity: "5000", side, type1, type2};
    expect(await addOrder (wallets[i], order, pair, orders)).to.equal(true);
  }

  side = 1;//SELL
  for (let i=8; i<10; i++) {
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "0.02", quantity: "500", side, type1, type2};
    if(i===9) {
      order.quantity="501"
    }
     expect(await addOrder (wallets[i], order, pair, orders)).to.equal(true);
  }

  expect(orders.size).to.equal(10);
});

it("Should get the Initial OrderBook correctly", async () => {
  const pair = pairs[0];

  const buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  const sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(buybook.length).to.equal(3);
  expect(sellbook.length).to.equal(2);
  console.log(Utils.formatUnits(buybook[0].price, pair.quoteDecimals));
  expect(Utils.formatUnits(buybook[0].price, pair.quoteDecimals)).to.equal('500000.0');
  expect(Utils.formatUnits(buybook[0].quantity, pair.baseDecimals)).to.equal('0.02');
  expect(Utils.formatUnits(buybook[0].total, pair.baseDecimals)).to.equal('0.02');

  console.log(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals));
  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('0.01');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('2000.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('2000.0');
});

it("Should allow all order operations when auction mode = 3 (CLOSING)", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 3)
  await exchange.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('0.03', pair.quoteDecimals));
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(3);
  expect(tradePairData.auctionPrice).to.equal(Utils.parseUnits('0.03', pair.quoteDecimals));

  const side = 1;//SELL
  const type1 = 1;//LIMIT
  const type2 = 0;//GTC

  const order: IOrder = {id: Utils.fromUtf8(`${1}`), tp, price: "0.03", quantity: "400", side, type1, type2};
  expect(await addOrder(wallets[3], order, pair, orders)).to.equal(true);
  expect(orders.size).to.equal(11);
  const fOrder1 = findOrder(accounts[3], side, "0.03", "400", orders);
  expect(await CancelReplaceOrder(wallets[3], fOrder1, Utils.fromUtf8(`${2}`), "0.03", "410", pair, orders)).to.equal(true);
  expect(orders.size).to.equal(12);
  const fOrder2 = findOrder(accounts[3], side, "0.03", "410", orders);
  expect(await cancelOrder(wallets[3], fOrder2, pair, orders)).to.equal(true);
  expect(orders.size).to.equal(12);
});

it("Should not allow anybody to withdraw auction token when mode = 3 (CLOSING)", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 3)

  for (let i=0; i<10; i++) {
    await expect(withdrawToken(wallets[i], 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals)).to.be.revertedWith("P-AUCT-01");
  }
});

it("Should not allow any order operation when mode = 5 (MATCHING)", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 2)   // auction in mode = 2 (OPEN)

  const side = 0;//BUY
  const type1 = 1;//LIMIT
  const type2 = 0;//GTC

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 5)   // auction in mode = 5 (MATCHING)
  const order = {id: Utils.fromUtf8(`${12}`), tp, price: "500000", quantity: "0.01", side, type1, type2};  // add one order
  await expect(addOrder(wallets[3], order, pair, orders)).to.be.revertedWith("T-PPAU-01");

  const fOrder1 = findOrder(accounts[3], side, "500000", "0.01", orders);
  await expect(cancelOrder(wallets[3], fOrder1, pair, orders)).to.be.revertedWith("T-PPAU-02");
  await expect(CancelReplaceOrder(wallets[3], fOrder1, Utils.fromUtf8(`${13}`), "410", "0.03", pair, orders)).to.be.revertedWith("T-PPAU-01");

  const orderids: Array<string> = []
  orderids[0]= fOrder1.id;
  await expect(cancelAllOrders(wallets[3], orderids, pair, orders)).to.be.revertedWith("T-PPAU-03");
});

it("Should not allow anyone to withdraw auction token when mode = 5 (MATCHING)", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 5)   // auction in mode = 5 (MATCHING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(5);

  for (let i=0; i<10; i++) {
    await expect(withdrawToken(wallets[i], 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals) ).to.be.revertedWith("P-AUCT-01");
  }
});

it("Should not allow anyone to transfer auction token when mode != 0 ", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 5)   // auction in mode = 5 (MATCHING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(5);

  await expect(portfolio.transferToken(deploymentWallet.address, Utils.fromUtf8(pair.baseSymbol), 100) ).to.be.revertedWith("P-DOTS-01");
  await expect(portfolio.connect(deploymentWallet).transferToken(accounts[1], Utils.fromUtf8(pair.baseSymbol), 10) ).to.be.revertedWith("P-AUCT-01");
  for (let mode=2; mode<=6; mode++) {
    await exchange.connect(auctionAdminWallet).setAuctionMode(tp, mode);
    await expect(portfolio.connect(wallets[1]).transferToken(accounts[2], Utils.fromUtf8(pair.baseSymbol), 10) ).to.be.revertedWith("P-AUCT-01");
  }
});


it("Should not allow to set the status to LIVETRADING or OFF when order book is crossed", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await expect(exchange.connect(auctionAdminWallet).setAuctionMode(tp, 0)).to.be.revertedWith("T-AUCT-05");  // auction mode = 0 (OFF)
  await expect(exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)).to.be.revertedWith("T-AUCT-05");  // auction mode = 1 (LIVETRADING)
});

it("Should fail matchAuctionOrder() for unprivileged accounts", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 4)
  await exchange.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('0', pair.quoteDecimals));

  // set auction mode to MATCHING
  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 5);  // auction is MATCHING
  // try from exchange
  await expect(exchange.connect(wallets[3]).matchAuctionOrders(tp, 8)).to.be.revertedWith("AccessControl:");
  // try from trade pairs directly
  await expect(tradePairs.connect(wallets[3]).matchAuctionOrder(tp, 8)).to.be.revertedWith("AccessControl:");
})

it("Should fail matchAuctionOrder() for incorrect mode", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 4)
  await exchange.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('0', pair.quoteDecimals));

  // fail to use matchAuctionOrders() while not in matching mode (5)
  await expect(exchange.connect(auctionAdminWallet).matchAuctionOrders(tp, 8)).to.be.revertedWith("T-AUCT-01");
  // set auction mode to MATCHING
  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 5);  // auction is MATCHING
  await expect(exchange.connect(auctionAdminWallet).matchAuctionOrders(tp, 8)).to.be.revertedWith("T-AUCT-03");
})

it("Should do the actual matching", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 5)
  await exchange.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('0.51', pair.quoteDecimals));
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(5);
  expect(Utils.formatUnits(tradePairData.auctionPrice, pair.quoteDecimals)).to.equal('0.51');

  for (let i=0; i<6; i++) {
    console.log(`${pair.id} **** Matching Orders  **** ${i}`)
    const tx = await exchange.connect(auctionAdminWallet).matchAuctionOrders(tp, 30);
    await tx.wait();
  }
});

it("Should get the OrderBook correctly", async () => {
  const pair = pairs[0];

  const buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  const sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(buybook.length).to.equal(1);
  expect(sellbook.length).to.equal(0);


  expect(Utils.formatUnits(buybook[0].price, pair.quoteDecimals)).to.equal('1.0');
  expect(Utils.formatUnits(buybook[0].quantity, pair.baseDecimals)).to.equal('6999.05');
  expect(Utils.formatUnits(buybook[0].total, pair.baseDecimals)).to.equal('6999.05');
});

it("Should allow to add new and C/R orders in Live Trading Mode", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)  // auction mode = 1 (LIVETRADING)
  const tradePairData= await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);

  const side = 1;//SELL
  const type1 = 1;//LIMIT
  const type2 = 0;//GTC

  const order1: IOrder = {id: Utils.fromUtf8(`${14}`), tp, price: "1.03", quantity: "100", side, type1, type2};  // add 1st order
  expect(await addOrder(wallets[3], order1, pair, orders)).to.be.true;

 const fOrder1 = findOrder(accounts[3], side, "1.03", "100", orders);
 expect(await CancelReplaceOrder(wallets[3], fOrder1, Utils.fromUtf8(`${13}`), "1.03", "200", pair, orders)).to.be.true;
});

it("Should not allow anybody to withdraw auction token when mode = 1 (LIVE_TRADING)", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)  // auction mode = 1 (LIVETRADING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);

  for (let i=0; i<10; i++) {
    await expect(withdrawToken(wallets[i], 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals) ).to.be.revertedWith("P-AUCT-01");
  }
});

it("Should give the correct OrderBook state", async () => {
  const pair = pairs[0];

  const buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  const sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(sellbook.length).to.equal(1);
  expect(buybook.length).to.equal(1);

  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.03');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('200.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('200.0');
});

it("Should correctly make a partial fill", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)  // auction mode = 1 (LIVETRADING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);

  const side = 0;//BUY
  const type1 = 1;//LIMIT
  const type2 = 0;//GTC

  const order1: IOrder = {id: Utils.fromUtf8(`${15}`), tp, price: "1.03", quantity: "180", side, type1, type2};  // add 1st order
  expect(await addOrder(wallets[3], order1, pair, orders)).to.be.true;  // This will be fully filled
});

it("Should get the correct OrderBook state after the partial fill", async () => {
  const pair = pairs[0];

  const buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  const sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(sellbook.length).to.equal(1);
  expect(buybook.length).to.equal(1);

  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.03');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('20.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('20.0');
});

it("Should be able to cancel all outstanding buy orders", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)  // auction mode = 1 (LIVETRADING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);

    for (let i=6; i<8; i++) {
      const order = findOrder(accounts[i], 0, "1", "5000", orders);
      if (order) {
        expect(await cancelOrder(wallets[i], order, pair, orders)).to.be.true;
      }
    }
});

it("Should get the correct OrderBook state after canceling all buy orders", async () => {
  const pair = pairs[0];

  const buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  const sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(sellbook.length).to.equal(1);
  expect(buybook.length).to.equal(0);

  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.03');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('20.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('20.0');
});

it("Should be able to set the auction mode to 1 (LIVETRADING) when nothing in buybook", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)  // auction mode = 1 (LIVETRADING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);
});

it("Should be able to cancel all outstanding sell orders", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)  // auction mode = 1 (LIVETRADING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);

  const order = findOrder(accounts[3], 1 , "1.03", "200", orders);
  if (order) {
   expect(await cancelOrder(wallets[3], order,  pair, orders)).to.equal(true);
  }
});

it("Should get the correct OrderBook state after canceling all sell orders as well", async () => {
  const pair = pairs[0];

  const buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  const sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(sellbook.length).to.equal(0);
  expect(buybook.length).to.equal(0);
});

it("Should be able to set the auction mode to 1 (LIVETRADING) when both books are empty", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)  // auction mode = 1 (LIVETRADING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);
});

it("Should give correct Portfolio state after ALL OUTSTANDING ORDERS CANCELED! All Portfolio Totals Should be equal to available", async () => {
  for (let i=0; i<accounts.length; i++) {
      for (let j=0; j < tokens.length; j++) {
          const _token = tokens[j];
          const _bal = await portfolio.getBalance(accounts[i], Utils.fromUtf8(_token));
          if (!_bal.total.eq(_bal.available)) {
            console.log(accounts[i] , _token,  "Bal Total ", Utils.formatUnits(_bal.total, decimalsMap[_token]) , "Available", Utils.formatUnits(_bal.available, decimalsMap[_token]));
          }
          expect(_bal.total).to.equal(_bal.available);
      }
  }
});

it("Should handle the full trading. Turn Auction Mode OFF. Match 2 orders Live", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 0)  // auction mode = 0 (OFF)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(0);

  const order1: IOrder = {id: Utils.fromUtf8(`${16}`), tp, price: "0.03", quantity: "400", side: 0, type1: 1, type2: 0};  // add buy order
  expect(await addOrder(wallets[3], order1, pair, orders)).to.be.true;  // This will be fully filled

  let buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  let sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(buybook.length).to.equal(1);
  expect(sellbook.length).to.equal(0);

  const order2: IOrder = {id: Utils.fromUtf8(`${17}`), tp, price: "0.03", quantity: "400", side: 1, type1: 1, type2: 0};  // add sell order
  expect(await addOrder(wallets[4], order2, pair, orders)).to.be.true;  // This will be fully filled

  buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(buybook.length).to.equal(0);
  expect(sellbook.length).to.equal(0);
});

it("Should give correct Portfolio state after All orders filled! All Portfolio Totals Should be equal to available ", async () => {
  for (let i=0; i<accounts.length; i++) {
      for (let j=0; j < tokens.length; j++) {
          const _token = tokens[j];
          const _bal = await portfolio.getBalance(accounts[i], Utils.fromUtf8(_token));
          if (!_bal.total.eq(_bal.available)) {
            console.log(accounts[i] , _token,  "Bal Total ", Utils.formatUnits(_bal.total, decimalsMap[_token]) , "Available", Utils.formatUnits(_bal.available, decimalsMap[_token]));
          }
          expect(_bal.total).to.equal(_bal.available);
      }
  }
});

it("Should allow withdrawal of Auction Token after auction mode = 0 (OFF)", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  //Auction mode already set to 0 in the previous test and auctionAdminWallet will not be able to change the auctionmode when it is already 0
  //await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 0)  // auction mode = 0 (OFF)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(0);

  // save LFG balances before withdrawal
  for (let i=0; i<accounts.length; i++) {
    const _token = tokens[i];
    if (_token==='LFG') {
      const _bal = await portfolio.getBalance(accounts[i], Utils.fromUtf8(_token));
      lfgBalances[i] = _bal.total;
    }
  }

  for (let i=0; i<10; i++) {
    const _token = tokens[i];
    expect(await withdrawToken(wallets[i], 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals) ).to.equal(true);
    if (_token==='LFG') {
      const _bal = await portfolio.getBalance(accounts[i], Utils.fromUtf8(_token));
      expect(_bal.total).to.equal(lfgBalances[i].sub(Utils.parseUnits('100', pair.baseDecimals)));
    }
 }
});

}).timeout(240000);

function findOrder(owner: string, side: number, price: string, quantity: string, orders: Map<string, any>)  {
  for (const order of orders.values()){
    //this.logger.debug (`Order: ${order.side}  ${order.quantity.toString()}  ${order.price.toString()}`);
    if (order.traderaddress === owner
        && order.side === side
          && order.quantity.eq(BN(quantity))
            && order.price.eq(BN(price))) {
      return order;
    }
  }
}

async function withdrawToken(wallet: SignerWithAddress, withdrawal_amount: number, symbolByte32: string , decimals: number) {
  const tx = await portfolio.connect(wallet).withdrawToken(wallet.address, symbolByte32, Utils.parseUnits(withdrawal_amount.toString(), decimals), 0);
  await tx.wait();
  return true;
}

async function addOrder(wallet: SignerWithAddress, order: IOrder, pair: any, orders: Map<string, any>) {
  let orderLog: any = {};

  const tx = await tradePairs.connect(wallet).addOrder(wallet.address,
                                                       order.id,
                                                       order.tp,
                                                       Utils.parseUnits(order.price, pair.quoteDecimals),
                                                       Utils.parseUnits(order.quantity, pair.baseDecimals),
                                                       order.side,
                                                       order.type1,
                                                       order.type2);

  orderLog = await tx.wait();
  if (orderLog){
    for (const _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          const rOrder = await processOrders(_log.args.traderaddress, _log.args.pair, _log.args.orderId, _log.args.price, _log.args.totalamount,
                                           _log.args.quantity,_log.args.side, _log.args.type1, _log.args.type2, _log.args.status,
                                           _log.args.quantityfilled, _log.args.totalfee, _log, pair.baseDecimals, pair.quoteDecimals);
          if (rOrder) {
            orders.set(rOrder.id, rOrder);
            return true;
          } else {
            return false;
          }
        }
      }
    }
  }
}

async function makeOrder(traderaddress: string, pair: string, id: string, price: BigNumber, totalamount: BigNumber, quantity: BigNumber, side: string,
                         type1: string, type2: string, status: string, quantityfilled: BigNumber, totalfee: BigNumber, tx: string, blocknbr: number,
                         gasUsed: string, gasPrice: string, cumulativeGasUsed: string, baseDecimals: number, quoteDecimals: number) {

  return {id: id,
          traderaddress,
          quantity: BN(Utils.formatUnits(quantity.toString(), baseDecimals)),
          pair: Utils.toUtf8(pair),
          tx,
          price: BN(Utils.formatUnits(price.toString(), quoteDecimals)),
          side: parseInt(side),
          type1: parseInt(type1),
          type2: parseInt(type2),
          status: parseInt(status),
          quantityfilled: BN(Utils.formatUnits(quantityfilled.toString(), baseDecimals)),
          totalamount: BN(Utils.formatUnits(totalamount.toString(), quoteDecimals)),
          totalfee: BN(parseInt(side) === 0 ? Utils.formatUnits(totalfee.toString(), baseDecimals) : Utils.formatUnits(totalfee.toString(), quoteDecimals)),
          blocknbr,
          gasUsed,
          gasPrice: Utils.formatUnits(gasPrice, 9),
          cumulativeGasUsed};
  }

async function processOrders(traderaddress: string, pair: string, id: string, price: BigNumber, totalamount: BigNumber, quantity: BigNumber, side: string,
                             type1: string, type2: string, status: string, quantityfilled: BigNumber, totalfee: BigNumber, event: Event, baseDecimals: number,
                             quoteDecimals: number) {
  try {
      const order = await makeOrder(traderaddress,
                                  pair,
                                  id,
                                  price,
                                  totalamount,
                                  quantity,
                                  side,
                                  type1,
                                  type2,
                                  status,
                                  quantityfilled,
                                  totalfee,
                                  event.transactionHash,
                                  event.blockNumber,
                                  '225',
                                  '225',
                                  '225',
                                  baseDecimals,
                                  quoteDecimals);

        return order;

  } catch (error) {
    console.log ("Error during  processOrders" , error)
  }
}

async function cancelOrder(wallet: SignerWithAddress, order: IOrder, pair: any, orders: Map<string, any>) {
  let orderLog: any = {};

  const tx = await tradePairs.connect(wallet).cancelOrder(order.id);
  orderLog = await tx.wait();

  if (orderLog){
    for (const _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          const rOrder = await processOrders(_log.args.traderaddress, _log.args.pair, _log.args.orderId, _log.args.price, _log.args.totalamount,
                                           _log.args.quantity,_log.args.side, _log.args.type1, _log.args.type2, _log.args.status,
                                           _log.args.quantityfilled, _log.args.totalfee, _log, pair.baseDecimals, pair.quoteDecimals);
          if (rOrder) orders.set(rOrder.id, rOrder);
        }
      }
    }
  }

  return true;
}

async function cancelAllOrders(wallet: SignerWithAddress, orderIds: string[], pair: any, orders: Map<string, any>) {
  let orderLog: any = {};

  const tx = await tradePairs.connect(wallet).cancelAllOrders(orderIds);
  orderLog = await tx.wait();

  if (orderLog){
    for (const _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          const rOrder = await processOrders(_log.args.traderaddress, _log.args.pair, _log.args.orderId, _log.args.price, _log.args.totalamount,
                                           _log.args.quantity,_log.args.side, _log.args.type1, _log.args.type2, _log.args.status,
                                           _log.args.quantityfilled, _log.args.totalfee, _log, pair.baseDecimals, pair.quoteDecimals);
          if (rOrder) orders.set(rOrder.id, rOrder);
        }
      }
    }
  }

  return true;
}

async function CancelReplaceOrder(wallet: SignerWithAddress, order: any, clientOrderId: string, newpx: string, newqty: string, pair: any, orders: Map<string, any>) {
  let orderLog: any = {};

  const tx = await tradePairs.connect(wallet).cancelReplaceOrder(order.id,
                                                                 clientOrderId,
                                                                 Utils.parseUnits(newpx, pair.quoteDecimals),
                                                                 Utils.parseUnits(newqty, pair.baseDecimals));

  orderLog = await tx.wait();
  if (orderLog){
    for (const _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          const rOrder = await processOrders(_log.args.traderaddress, _log.args.pair, _log.args.orderId, _log.args.price, _log.args.totalamount,
                                           _log.args.quantity,_log.args.side, _log.args.type1, _log.args.type2, _log.args.status,
                                           _log.args.quantityfilled, _log.args.totalfee, _log, pair.baseDecimals, pair.quoteDecimals);
          if (rOrder) orders.set(rOrder.id, rOrder);
        }
      }
    }
  }

  return true;
}
