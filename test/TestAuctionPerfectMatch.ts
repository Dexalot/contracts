/**
 * The test runner for auction on Dexalot decentralized exchangeSub
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
const numberOfAccounts = 5;

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
const foundationSafe = '0x48a04b706548F7034DC50bafbF9990C6B4Bff177'

let wallets: Array<SignerWithAddress>;
let accounts: Array<string>;

let deploymentWallet: SignerWithAddress;
let deploymentAccount: string;

let auctionAdminWallet: SignerWithAddress;
let auctionAdminAccount: string;

let exchangeSub: ExchangeSub
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

  const type1 = 1;//LIMIT
  const type2 = 0;//GTC

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
  exchangeSub = await f.deployExchangeSub(portfolio, orderBooks)
  tradePairs = await f.deployTradePairs(orderBooks, portfolio, exchangeSub);



    // initialize address collecting fees
  console.log("=== Set Address Collecting the Fees ===");
  await portfolio.setFeeAddress(foundationSafe);
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
          await wallet.sendTransaction({from: account,
                                        to: portfolioMain.address,
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

  // initialize exchangeSub contract and create the TradePairs  "AVAX/USDT" "AVAX/BUSD" ....
  console.log("=== Initialize exchangeSub Contract ===");
  console.log("ExchangeSub contract deployed at: ", exchangeSub.address)

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
      await exchangeSub.addTradePair(tp,
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

  await exchangeSub.addAuctionAdmin(auctionAdminWallet.address);

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

  expect(await exchangeSub.isAuctionAdmin(auctionAdminWallet.address) ).to.equal(true);
  expect(await exchangeSub.hasRole(await exchangeSub.AUCTION_ADMIN_ROLE(), auctionAdminWallet.address) ).to.equal(true);

  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, Utils.fromUtf8(pair.baseSymbol), 3)
  await exchangeSub.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('0.03', pair.quoteDecimals));
  const auctionData = await tradePairs.getAuctionData(tp);
  expect(auctionData.mode).to.equal(3);
  expect(auctionData.price).to.equal(Utils.parseUnits('0.03', pair.quoteDecimals));
  //console.log (`${pair.id} Auction Mode ${auctionData.mode},  price ${auctionData.price.toString()}` )
});



it("Should be able to send perfectly matching orders buy qty=sell qty", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;    // trading pair id needs to be bytes32

  let side = 1;//SELL

  const type2toBeReplaced = 3; //PO contract will replace it with GTC

  for (let i=0; i<3; i++) {  // 2 sells at 0.01
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "1.5", quantity: "10", side, type1, type2:type2toBeReplaced};
    expect(await addOrder(wallets[i], order, pair, orders)).to.equal(true);
  }

  side = 0;//BUY
  for (let i=3; i<5; i++) {  // 2 buys  at 5000000
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "1.5", quantity: "10", side, type1, type2};
    expect(await addOrder(wallets[i], order, pair, orders)).to.equal(true);
  }


  expect(orders.size).to.equal(5);
});

it("Should get the Initial OrderBook correctly", async () => {
  const pair = pairs[0];

  const buybook =  await getBookwithLoop(pair.id, "BUY");
  const sellbook = await getBookwithLoop(pair.id, "SELL");

  expect(buybook.length).to.equal(1);
  expect(sellbook.length).to.equal(1);
  console.log(Utils.formatUnits(buybook[0].price, pair.quoteDecimals));
  expect(Utils.formatUnits(buybook[0].price, pair.quoteDecimals)).to.equal('1.5');
  expect(Utils.formatUnits(buybook[0].quantity, pair.baseDecimals)).to.equal('20.0');
  expect(Utils.formatUnits(buybook[0].total, pair.baseDecimals)).to.equal('20.0');

  console.log(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals));
  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.5');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('30.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('30.0');
});


it("Should do the actual matching exact buys with sells", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, Utils.fromUtf8(pair.baseSymbol), 5)
  await exchangeSub.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('1.5', pair.quoteDecimals));
  const auctionData = await tradePairs.getAuctionData(tp);
  expect(auctionData.mode).to.equal(5);
  expect(Utils.formatUnits(auctionData.price, pair.quoteDecimals)).to.equal('1.5');


  await exchangeSub.connect(auctionAdminWallet).matchAuctionOrders(tp, 30);
  let buybook =  await getBookwithLoop(pair.id, "BUY");
  let sellbook = await getBookwithLoop(pair.id, "SELL");
  expect(buybook.length).to.equal(1);
  expect(sellbook.length).to.equal(1);

  await exchangeSub.connect(auctionAdminWallet).matchAuctionOrders(tp, 30);

  // Last Sell Order is left as is. no matches
  await expect(exchangeSub.connect(auctionAdminWallet).matchAuctionOrders(tp, 30))
  .to.emit(exchangeSub, "AuctionMatchFinished")
  .withArgs(tp);
  buybook =  await getBookwithLoop(pair.id, "BUY");
  sellbook = await getBookwithLoop(pair.id, "SELL");
  expect(buybook.length).to.equal(0);
  expect(sellbook.length).to.equal(1);

});

it("More buys than sells ", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32
  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, Utils.fromUtf8(pair.baseSymbol), 2)

  const side = 0;//BUY
  for (let i=3; i<5; i++) {  // 2 buys  at 5000000
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "1.5", quantity: "10", side, type1, type2};
    expect(await addOrder(wallets[i], order, pair, orders)).to.equal(true);
  }

  let buybook =  await getBookwithLoop(pair.id, "BUY");
  let sellbook = await getBookwithLoop(pair.id, "SELL");
  expect(buybook.length).to.equal(1);
  expect(sellbook.length).to.equal(1);
  expect(Utils.formatUnits(buybook[0].price, pair.quoteDecimals)).to.equal('1.5');
  expect(Utils.formatUnits(buybook[0].quantity, pair.baseDecimals)).to.equal('20.0');
  expect(Utils.formatUnits(buybook[0].total, pair.baseDecimals)).to.equal('20.0');

  console.log(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals));
  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.5');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('10.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('10.0');

  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, Utils.fromUtf8(pair.baseSymbol), 5)

  await exchangeSub.connect(auctionAdminWallet).matchAuctionOrders(tp, 30);
  await expect(exchangeSub.connect(auctionAdminWallet).matchAuctionOrders(tp, 30))
  .to.emit(exchangeSub, "AuctionMatchFinished")
  .withArgs(tp);
   buybook =  await getBookwithLoop(pair.id, "BUY");
   sellbook = await getBookwithLoop(pair.id, "SELL");
  expect(buybook.length).to.equal(1);
  expect(sellbook.length).to.equal(0);
});

it("More sells than buys ", async () => {
  const pair = pairs[0];
  const tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32
  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, Utils.fromUtf8(pair.baseSymbol), 2)

  const side = 1;//SELL
  for (let i=0; i<2; i++) {  // 2 buys  at 5000000
    const order: IOrder = {id: Utils.fromUtf8(`${i+1}`), tp, price: "1.5", quantity: "10", side, type1, type2};
    expect(await addOrder(wallets[i], order, pair, orders)).to.equal(true);
  }

  let buybook =  await getBookwithLoop(pair.id, "BUY");
  let sellbook = await getBookwithLoop(pair.id, "SELL");
  expect(buybook.length).to.equal(1);
  expect(sellbook.length).to.equal(1);
  expect(Utils.formatUnits(buybook[0].price, pair.quoteDecimals)).to.equal('1.5');
  expect(Utils.formatUnits(buybook[0].quantity, pair.baseDecimals)).to.equal('10.0');
  expect(Utils.formatUnits(buybook[0].total, pair.baseDecimals)).to.equal('10.0');

  console.log(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals));
  expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.5');
  expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('20.0');
  expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('20.0');

  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, Utils.fromUtf8(pair.baseSymbol), 5)

  await exchangeSub.connect(auctionAdminWallet).matchAuctionOrders(tp, 30);
  await expect(exchangeSub.connect(auctionAdminWallet).matchAuctionOrders(tp, 30))
  .to.emit(exchangeSub, "AuctionMatchFinished")
  .withArgs(tp);
   buybook =  await getBookwithLoop(pair.id, "BUY");
   sellbook = await getBookwithLoop(pair.id, "SELL");
  expect(buybook.length).to.equal(0);
  expect(sellbook.length).to.equal(1);
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

async function getBookwithLoop(tradePair: string, side: string) {
  const map1 = new Map();
  let price = BN(0);
  let lastOrderId = Utils.fromUtf8("");
  const tradePairId = Utils.fromUtf8(tradePair);
  let book: any;
  let i;
  const nPrice = 50;
  const nOrder = 50
  //console.log( `getBookwithLoop called ${tradePair} ${side}: `);
  let k =0;
  let total = BigNumber.from(0);
  do {
    try {
    book = await tradePairs.getNBook(tradePairId, side === "BUY" ? 0 : 1 , nPrice, nOrder, price.toString(), lastOrderId);
    } catch (error){
      console.log(`${tradePair}, getBookwithLoop ${side} pass : ${k} `, error);
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

  const orderbook = Array.from(map1.values());

  //Calc Totals orderbook.length>0 ? orderbook[0].quantity:

  for (i = 0; i < orderbook.length; i++) {
    total = total.add(orderbook[i].quantity);
    orderbook[i].total = total;
  }

  return orderbook;
}
