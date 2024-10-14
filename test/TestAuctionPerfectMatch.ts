/**
 * The test runner for auction on Dexalot decentralized exchangeSub
 */

import Utils from './utils';

import BN from 'bignumber.js';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  MockToken,
  ExchangeSub,
  PortfolioMain,
  PortfolioSub,
  TradePairs,
  OrderBooks,
} from "../typechain-types";

import * as f from "./MakeTestSuite";

import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, ContractFactory, Event } from "ethers";

let MockToken: ContractFactory;

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
const feeSafe = '0x48a04b706548F7034DC50bafbF9990C6B4Bff177'

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

  const MockToken = await ethers.getContractFactory("MockToken");

  deploymentWallet = wallets[0];
  deploymentAccount = deploymentWallet.address;
  console.log("deploymentAccount =", deploymentAccount);

  //const auctionAdminWallet = new ethers.Wallet(nconf.get("AUCTION_ADMIN_KEY"), provider);
  auctionAdminWallet = wallets[1] // AUCTION Admin Account  HH
  auctionAdminAccount = accounts[1];
  console.log("Auction Admin Account:", auctionAdminAccount)

  const portfolioContracts = await f.deployCompletePortfolio(true);
  portfolioMain = portfolioContracts.portfolioMainnet;
  portfolio = portfolioContracts.portfolioSub;

  orderBooks = await f.deployOrderBooks();
  exchangeSub = await f.deployExchangeSub(portfolio, orderBooks)
  tradePairs = await f.deployTradePairs(orderBooks, portfolio, exchangeSub);



    // initialize address collecting fees
  console.log("=== Set Address Collecting the Fees ===");
  await portfolio.setFeeAddress(feeSafe);
  console.log("Called setFeeAddress on Portfolio ");

  console.log();
  console.log("=== Creating and Minting Mock Tokens ===");



  for (const element of tokenList) {
      _tokenStr = element;
      _tokenBytes32 = Utils.fromUtf8(_tokenStr);
      _tokenDecimals = decimalsMap[_tokenStr];
      _token = await f.deployMockToken(_tokenStr, _tokenDecimals);
      let _startAuctionMode: any = 2;
      if (_tokenStr === "SER") _startAuctionMode = 0;

      await f.addToken(portfolioMain, portfolio, _token, 0.1, _startAuctionMode);

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
  for (const element of tokenList) {
      _tokenStr = element;
      _tokenAddr = await portfolioMain.getToken(Utils.fromUtf8(_tokenStr));
      _token = MockToken.attach(_tokenAddr) as MockToken;
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
      for (const element of tokenList) {
          _tokenStr = element;
          _tokenBytes32 = Utils.fromUtf8(_tokenStr);
          _tokenAddr = await portfolioMain.getToken(_tokenBytes32);
          console.log(`${_tokenStr} @ ${_tokenAddr}`)
          _token = MockToken.attach(_tokenAddr) as MockToken;
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
  for (const element of tokenPairs) {
    const pair = element
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
  for (const element of _tokenList) {
      console.log(Utils.toUtf8(element));
  }

  // check all balances at the start of orders processing
  console.log();
  console.log("=== Portfolio State Before Processing Orders ===");
  for (let i=0; i<numberOfAccounts; i++) {
      const account = wallets[i].address;
      for (const element of tokens) {
          const token = element;
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

  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, 3)
  await exchangeSub.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('0.03', pair.quoteDecimals));
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(3);
  expect(tradePairData.auctionPrice).to.equal(Utils.parseUnits('0.03', pair.quoteDecimals));
  //console.log (`${pair.id} Auction Mode ${tradePairData.auctionMode},  price ${tradePairData.auctionPrice.toString()}` )
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

  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, 5)
  await exchangeSub.connect(auctionAdminWallet).setAuctionPrice(tp, Utils.parseUnits('1.5', pair.quoteDecimals));
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(5);
  expect(Utils.formatUnits(tradePairData.auctionPrice, pair.quoteDecimals)).to.equal('1.5');


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
  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, 2)

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

  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, 5)

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
  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, 2)

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

  await exchangeSub.connect(auctionAdminWallet).setAuctionMode(tp, 5)

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


async function addOrder(wallet: SignerWithAddress, order: IOrder, pair: any, orders: Map<string, any>) {
  let orderLog: any = {};
  const  newOrder = {
    traderaddress: wallet.address
    , clientOrderId : order.id
    , tradePairId :order.tp
    , price: Utils. parseUnits(order.price, pair.quoteDecimals)
    , quantity:  Utils.parseUnits(order.quantity, pair.baseDecimals)
    , side :  order.side
    , type1 : order.type1   // market orders not enabled
    , type2 : order.type2   // GTC
}
  const tx = await tradePairs.connect(wallet).addNewOrder(newOrder);

  orderLog = await tx.wait();
  if (orderLog){
    for (const _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          const rOrder = await processOrders(_log.args.traderaddress, _log.args.pair, _log.args.order.id, _log.args.order.price, _log.args.order.totalAmount,
            _log.args.order.quantity,_log.args.order.side, _log.args.order.type1, _log.args.order.type2, _log.args.order.status,
            _log.args.order.quantityFilled, _log.args.order.totalFee, _log, pair.baseDecimals, pair.quoteDecimals);
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
