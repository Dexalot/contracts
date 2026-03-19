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
const numberOfAccounts = 3;

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

const startAuctionMode: any = 2; //OPEN

// address (a multisig in production) that collects the fees
const feeSafe = '0x48a04b706548F7034DC50bafbF9990C6B4Bff177'

let wallets: Array<SignerWithAddress>;
let accounts: Array<string>;

let deploymentWallet: SignerWithAddress;
let deploymentAccount: string;

let auctionAdminWallet: SignerWithAddress;
let auctionAdminAccount: string;


let trader1: SignerWithAddress;
let trader1Account: string;

let exchange: ExchangeSub
let portfolioSub: PortfolioSub
let portfolioMain: PortfolioMain
let tradePairs: TradePairs
let orderBooks: OrderBooks

let _tokenStr: string;
let _tokenDecimals: number;
let _tokenBytes32: string;
let _tokenAddr: string;
let _token: MockToken;

let pairs: any;
let pair: any;
let tp: string; // trading pair id needs to be bytes32

let buyOrder: any;
let sellOrder: any;
let buyOrderClient: any;
let sellOrderClient: any;

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

  MockToken = await ethers.getContractFactory("MockToken") as MockToken__factory;

  deploymentWallet = wallets[0];
  deploymentAccount = deploymentWallet.address;
  console.log("deploymentAccount =", deploymentAccount);

  //const auctionAdminWallet = new ethers.Wallet(nconf.get("AUCTION_ADMIN_KEY"), provider);
  auctionAdminWallet = wallets[1] // AUCTION Admin Account  HH
  auctionAdminAccount = accounts[1];
  console.log("Auction Admin Account:", auctionAdminAccount)


  trader1 = wallets[2];
  trader1Account  = accounts[2];

  const portfolioContracts = await f.deployCompletePortfolio(true);
  portfolioMain = portfolioContracts.portfolioMainnet;
  portfolioSub = portfolioContracts.portfolioSub;


  orderBooks = await f.deployOrderBooks();
  exchange = await f.deployExchangeSub(portfolioSub, orderBooks)
  tradePairs = await f.deployTradePairs(orderBooks, portfolioSub, exchange);


  // initialize address collecting fees
  console.log("=== Set Address Collecting the Fees ===");
  await portfolioSub.setFeeAddress(feeSafe);
  console.log("Called setFeeAddress on Portfolio ");

  console.log();
  console.log("=== Creating and Minting Mock Tokens ===");



  for (let j=0; j<tokenList.length; j++) {
      _tokenStr = tokenList[j];
      _tokenBytes32 = Utils.fromUtf8(_tokenStr);
      _tokenDecimals = decimalsMap[_tokenStr];
      _token = await f.deployMockToken(_tokenStr, _tokenDecimals);
      let _startAuctionMode: any = 2;
      if (_tokenStr === "SER") _startAuctionMode = 0;

      await f.addToken(portfolioMain, portfolioSub,_token, 0.1, _startAuctionMode);

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
      let _bal = await portfolioSub.getBalance(account, _nativeBytes32);
      Utils.printBalances(account, _bal, native, 18);
      if ((parseFloat(Utils.fromWei(_bal.total)) + parseFloat(Utils.fromWei(_bal.available))) < initial_portfolio_deposits[native]) {
        const _deposit_amount = initial_portfolio_deposits[native] - Utils.fromWei(_bal.total) - Utils.fromWei(_bal.available);
          await wallet.sendTransaction({to: portfolioMain.address,
                                        value: Utils.toWei(_deposit_amount.toString())});
          //console.log("Deposited for", account, _deposit_amount, native, "to portfolio.");
          _bal = await portfolioSub.getBalance(account, _nativeBytes32);
          Utils.printBalances(account, _bal, native, 18);
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
          _bal = await portfolioSub.getBalance(account, _tokenBytes32);
          Utils.printBalances(account, _bal, _tokenStr, _tokenDecimals);
          if ((parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) + parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals))) < initial_portfolio_deposits[_tokenStr]) {
            const _deposit_amount = initial_portfolio_deposits[_tokenStr] - parseFloat(Utils.formatUnits(_bal.total, _tokenDecimals)) - parseFloat(Utils.formatUnits(_bal.available, _tokenDecimals));
            const _deposit_amount_bn = Utils.parseUnits(_deposit_amount.toString(), _tokenDecimals);
              await _token.connect(wallet).approve(portfolioMain.address, _deposit_amount_bn);
              //console.log("Approve:", account, "to deposit ", _deposit_amount, _tokenStr, "to portfolio.");
              await portfolioMain.connect(wallet).depositToken(account, _tokenBytes32, _deposit_amount_bn, 0);
              //console.log("Deposit:", account, _deposit_amount, _tokenStr, "to portfolio.");
              _bal = await portfolioSub.getBalance(account, _tokenBytes32);
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
      // await tradePairs.addOrderType(tp, 0)  // 0 = MARKET, 1 = LIMIT
      // console.log(`MARKET order type added to ${pair.id} at ${tradePairs.address}.`)
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
          const res = await portfolioSub.getBalance(account, Utils.fromUtf8(token));
          Utils.printBalances(account, res, token, decimalsMap[token]);
      }
  }
  console.log();
});

  beforeEach(async function () {
  pair = pairs[0];
  tp = pair.pairIdAsBytes32;   // trading pair id needs to be bytes32

  await tradePairs.connect(deploymentWallet).setAuctionMode(tp, 2); // OPEN

  // buy and sell orders for auction admin
  buyOrder = {
      traderaddress: auctionAdminWallet.address
      , clientOrderId : await Utils.getClientOrderId(ethers.provider, auctionAdminWallet.address)
      , tradePairId: tp
      , price: Utils.parseUnits('0.9', pair.quoteDecimals)
      , quantity: Utils.parseUnits('100', pair.baseDecimals)
      , side :  0   // Buy
      , type1 : 1   // market orders not enabled
      , type2: 0   // GTC
      , stp : 0   // CancelTaker
  }

  sellOrder = {
      traderaddress: auctionAdminWallet.address
      , clientOrderId : await Utils.getClientOrderId(ethers.provider, auctionAdminWallet.address, 1)
      , tradePairId: tp
      , price: Utils.parseUnits('1.1', pair.quoteDecimals)
      , quantity: Utils.parseUnits('200', pair.baseDecimals)
      , side :  1   // Sell
      , type1 : 1   // market orders not enabled
      , type2: 0   // GTC
      , stp : 0   // CancelTaker
  }


  buyOrderClient= JSON.parse(JSON.stringify(buyOrder)) ; // deep copy
  buyOrderClient.traderaddress = trader1Account
  buyOrderClient.price = Utils.parseUnits('1.1', pair.quoteDecimals)
  buyOrderClient.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1Account)


  sellOrderClient=  JSON.parse(JSON.stringify(sellOrder)) ; // deep copy
  sellOrderClient.traderaddress = trader1Account
  sellOrderClient.quantity = Utils.parseUnits('100', pair.baseDecimals)
  sellOrderClient.price= Utils.parseUnits('0.9', pair.quoteDecimals)
  sellOrderClient.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1Account)


});

it("Should set up auction properly", async () => {
  // OFF = 0,
  // LIVETRADING = 1,
  // OPEN = 2,

  // The below are obsolete
  // CLOSING = 3,
  // PAUSED = 4,
  // MATCHING = 5
  // RESTRICTED = 6

  expect(await exchange.isAuctionAdmin(auctionAdminWallet.address) ).to.equal(true);
  expect(await exchange.hasRole(await exchange.AUCTION_ADMIN_ROLE(), auctionAdminWallet.address) ).to.equal(true);

  await expect(tradePairs.connect(trader1).setAuctionMode(tp, 2)).to.be.revertedWith("AccessControl:");
  await expect(exchange.connect(trader1).setAuctionMode(tp, 2)).to.be.revertedWith("AccessControl:");
  await expect(exchange.connect(trader1).setAuctionVaultAdress(tp, auctionAdminWallet.address)).to.be.revertedWith("AccessControl:");

  //Revert for any values above 2
  for (let i = 3; i < 6; i++) {
    await expect(exchange.connect(auctionAdminWallet).setAuctionMode(tp, i)).to.be.revertedWith("T-AUCT-03");
  }

  //Reject if AuctionVaultAddress is not set
  await addOrderAndVerify(auctionAdminWallet, buyOrder, 1, Utils.fromUtf8("T-AUCT-02"));  // status is REJECTED = 1

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 2)
  await exchange.connect(auctionAdminWallet).setAuctionVaultAdress(tp, auctionAdminWallet.address);
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(2);
  expect(await tradePairs.getAuctionVaultAdress(tp)).to.equal(auctionAdminWallet.address);

  const orderid= await addOrderAndVerify(auctionAdminWallet, buyOrder, 0);  // status is new = 0
  expect(await cancelOrder(auctionAdminWallet, orderid, pair, orders)).to.equal(true);
});


it("Should not allow the auction token withdrawal when mode = 1 (LIVETRADING)", async () => {

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)

  for (let i=0; i<3; i++) {
    await expect(withdrawToken(wallets[i], 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals)).to.be.revertedWith("P-AUCT-01");
  }
});

it("Should not allow the auction token withdrawal when mode = 2 (OPEN)", async () => {

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 2)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(2);
  for (let i=0; i<3; i++) {  // 2 sells at 0.01
    await expect(withdrawToken(wallets[i], 100, Utils.fromUtf8(pair.baseSymbol), pair.baseDecimals)).to.be.revertedWith("P-AUCT-01");
  }
});

it("Should not allow the auction token transfer when mode != 0 ", async () => {


  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)   // auction in mode = 1 (OPEN)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);
  expect((await portfolioSub.getTokenDetails(tradePairData.baseSymbol)).auctionMode).to.equal(1);

  await expect(portfolioSub.transferToken(deploymentWallet.address, Utils.fromUtf8(pair.baseSymbol), 100) ).to.be.revertedWith("P-DOTS-01");
  await expect(portfolioSub.connect(deploymentWallet).transferToken(accounts[1], Utils.fromUtf8(pair.baseSymbol), 10) ).to.be.revertedWith("P-AUCT-01");

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 2);
  expect((await portfolioSub.getTokenDetails(tradePairData.baseSymbol)).auctionMode).to.equal(2);
  await expect(portfolioSub.connect(wallets[1]).transferToken(accounts[2], Utils.fromUtf8(pair.baseSymbol), 10) ).to.be.revertedWith("P-AUCT-01");

});

it("Should allow OmniVault all order operations when auction mode = 1(LIVETRADING)", async () => {

  await tradePairs.connect(deploymentWallet).setAuctionMode(tp, 1); // OPEN
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);

  const id1 = await addOrderAndVerify(auctionAdminWallet, sellOrder, 0);  // status is NEW = 0
  expect(await cancelOrder(auctionAdminWallet, id1, pair, orders)).to.equal(true);

  });


it("Should allow OmniVault all order operations when auction mode = 2 (OPEN)", async () => {

  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(2);
  expect(await tradePairs.getAuctionVaultAdress(tp)).to.equal(auctionAdminWallet.address);


  const id1 = await addOrderAndVerify(auctionAdminWallet, sellOrder, 0);  // status is NEW = 0

  const fOrder1 = findOrder(id1, orders);

  let id2 = await CancelReplaceOrder(auctionAdminWallet, fOrder1, await Utils.getClientOrderId(ethers.provider, auctionAdminWallet.address, 2), "1.1", "210", pair, orders);
  expect(orders.size).to.equal(5);
  expect(await cancelOrder(auctionAdminWallet, id2, pair, orders)).to.equal(true);
  expect(orders.size).to.equal(5);

  sellOrder.quantity= Utils.parseUnits('100', pair.baseDecimals)
  sellOrder.clientOrderId = await Utils.getClientOrderId(ethers.provider, auctionAdminWallet.address, 3);

  await addOrderAndVerify(auctionAdminWallet, sellOrder, 0);

  await addOrderAndVerify(auctionAdminWallet, buyOrder, 0);

});


it("Should give the correct OrderBook state", async () => {

    const buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
    const sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

    expect(sellbook.length).to.equal(1);
    expect(buybook.length).to.equal(1);

    expect(Utils.formatUnits(sellbook[0].price, pair.quoteDecimals)).to.equal('1.1');
    expect(Utils.formatUnits(sellbook[0].quantity, pair.baseDecimals)).to.equal('100.0');
    expect(Utils.formatUnits(sellbook[0].total, pair.baseDecimals)).to.equal('100.0');

    expect(Utils.formatUnits(buybook[0].price, pair.quoteDecimals)).to.equal('0.9');
    expect(Utils.formatUnits(buybook[0].quantity, pair.baseDecimals)).to.equal('100.0');
    expect(Utils.formatUnits(buybook[0].total, pair.baseDecimals)).to.equal('100.0');

 });


it("Should auction participants send LIMIT IOC orders only when mode = 2 (OPEN)", async () => {
    // enum Type2 {
    //     GTC,
    //     FOK,
    //     IOC,
    //     PO
  // }


  //GTC
  await addOrderAndVerify(trader1, buyOrderClient, 1, Utils.fromUtf8("T-AUCT-02"));  // status is REJECTED = 1

  buyOrderClient.type2 = 1;
  await addOrderAndVerify(trader1, buyOrderClient, 1, Utils.fromUtf8("T-AUCT-02"));  // status is REJECTED = 1

  buyOrderClient.type2 = 3;
  await addOrderAndVerify(trader1, buyOrderClient, 1, Utils.fromUtf8("T-AUCT-02"));  // status is REJECTED = 1

  //Reject a market order
  await tradePairs.addOrderType(tp, 0) //Allow Market orders

  buyOrderClient.type2 = 0;
  buyOrderClient.type1 = 0;
  await addOrderAndVerify(trader1, buyOrderClient, 1, Utils.fromUtf8("T-AUCT-02"));  // status is REJECTED = 1


  buyOrderClient.type1 = 1;
  // IOC gets a no fill, but cancel
  buyOrderClient.type2 = 2;
  buyOrderClient.price = Utils.parseUnits('0.8', pair.quoteDecimals)
  await addOrderAndVerify(trader1, buyOrderClient, 4);  // status is CANCELED = 4

  // Gets a full fill with a IOC
  buyOrderClient.price = Utils.parseUnits('1.1', pair.quoteDecimals)
  let totalFee = BigNumber.from(buyOrderClient.quantity).div(10000).mul(20); // 20 bps , when buying total fee is from quantity, when selling from totalAmount
  let filledQty = Number(Utils.formatUnits(buyOrderClient.quantity, pair.baseDecimals))
  let totalAmount = BigNumber.from(filledQty).mul(buyOrderClient.price);
  await addOrderAndVerify(trader1, buyOrderClient, 3, ethers.constants.HashZero, totalAmount, buyOrderClient.quantity, totalFee);  // status is FILLED = 3

  // Can get a partial fill if not enough in the ob.
  sellOrderClient.type2 = 2;
  sellOrderClient.quantity = Utils.parseUnits('200', pair.baseDecimals)

  filledQty = 100 // based on the ob
  const filledQtyBN = Utils.parseUnits(filledQty.toString(), pair.baseDecimals);

  totalAmount = BigNumber.from(filledQty).mul(sellOrderClient.price);
  totalFee = totalAmount.div(10000).mul(20); // 20 bps , when buying total fee is from quantity, when selling from totalAmount
  await addOrderAndVerify(trader1, sellOrderClient, 4, ethers.constants.HashZero, totalAmount,filledQtyBN, totalFee);  // status is FILLED = 3

});

it("Should get the Initial OrderBook correctly", async () => {

  const buybook =  await Utils.getBookwithLoop(tradePairs, pair.id, "BUY");
  const sellbook = await Utils.getBookwithLoop(tradePairs, pair.id, "SELL");

  expect(buybook.length).to.equal(0);
  expect(sellbook.length).to.equal(0);

});

it("Should allow all order types from participants when mode = 1 (LIVETRADING)", async () => {

  await addOrderAndVerify(auctionAdminWallet, sellOrder, 0);  // status is NEW = 0
  await addOrderAndVerify(auctionAdminWallet, buyOrder, 0);


  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 1)  // auction mode = 1 (LIVETRADING)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(1);

  // allow a LIMIT GTC
  buyOrderClient.price = Utils.parseUnits('0.95', pair.quoteDecimals)
  let ordId = await addOrderAndVerify(trader1, buyOrderClient, 0);  // status is NEW = 0
  // let fOrder = findOrder(ordId, orders);
  expect(await cancelOrder(trader1, ordId, pair, orders)).to.equal(true);


  // Gets a partial fill and the remaining goes into the OB
  buyOrderClient.price = Utils.parseUnits('1.1', pair.quoteDecimals)
  buyOrderClient.quantity = Utils.parseUnits('300', pair.quoteDecimals);
  buyOrderClient.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1Account, 3)


  let filledQty = 200
  let filledQtyBN = Utils.parseUnits(filledQty.toString(), pair.baseDecimals);
  let totalFee = filledQtyBN.div(10000).mul(20); // 20 bps , when buying total fee is from quantity, when selling from totalAmount

  let totalAmount = BigNumber.from(filledQty).mul(buyOrderClient.price);
  ordId = await addOrderAndVerify(trader1, buyOrderClient, 2, ethers.constants.HashZero, totalAmount, filledQtyBN, totalFee);  // status is PARTIAL FILL = 2
  // cancel the outstating order so it is not caught by STP
  expect(await cancelOrder(trader1, ordId, pair, orders)).to.equal(true);


  // Market order, gets a fill
  sellOrderClient.type2 = 0;
  sellOrderClient.type1 = 0;
  filledQty = 100 // based on the ob
  filledQtyBN = Utils.parseUnits(filledQty.toString(), pair.baseDecimals);

  totalAmount = BigNumber.from(filledQty).mul(sellOrderClient.price);
  totalFee = totalAmount.div(10000).mul(20); // 20 bps , when buying total fee is from quantity, when selling from totalAmount
  await addOrderAndVerify(trader1, sellOrderClient, 3, ethers.constants.HashZero, totalAmount,filledQtyBN, totalFee);  // status is FILLED = 3

});


it("Should allow all order types from participants when mode = 0 (OFF)", async () => {

    // enum Type2 {
    //     GTC,
    //     FOK,
    //     IOC,
    //     PO
  // }


  await addOrderAndVerify(auctionAdminWallet, sellOrder, 0);  // status is NEW = 0
  await addOrderAndVerify(auctionAdminWallet, buyOrder, 0);


  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 0)  // auction mode = 0 (OFF)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(0);

  // allow a LIMIT GTC
  buyOrderClient.price = Utils.parseUnits('0.95', pair.quoteDecimals)
  let ordId = await addOrderAndVerify(trader1, buyOrderClient, 0);  // status is NEW = 0
  expect(await cancelOrder(trader1, ordId, pair, orders)).to.equal(true);


  // Gets a partial fill and the remaining goes into the OB
  buyOrderClient.price = Utils.parseUnits('1.1', pair.quoteDecimals)
  buyOrderClient.quantity = Utils.parseUnits('300', pair.quoteDecimals);
  buyOrderClient.clientOrderId = await Utils.getClientOrderId(ethers.provider, trader1Account, 3)


  let filledQty = 200
  let filledQtyBN = Utils.parseUnits(filledQty.toString(), pair.baseDecimals);
  let totalFee = filledQtyBN.div(10000).mul(20); // 20 bps , when buying total fee is from quantity, when selling from totalAmount

  let totalAmount = BigNumber.from(filledQty).mul(buyOrderClient.price);
  ordId = await addOrderAndVerify(trader1, buyOrderClient, 2, ethers.constants.HashZero, totalAmount, filledQtyBN, totalFee);  // status is PARTIAL FILL = 2
  // cancel the outstating order so it is not caught by STP
  expect(await cancelOrder(trader1, ordId, pair, orders)).to.equal(true);


  // Market order, gets a fill
  sellOrderClient.type2 = 0;
  sellOrderClient.type1 = 0;
  filledQty = 100 // based on the ob
  filledQtyBN = Utils.parseUnits(filledQty.toString(), pair.baseDecimals);

  totalAmount = BigNumber.from(filledQty).mul(sellOrderClient.price);
  totalFee = totalAmount.div(10000).mul(20); // 20 bps , when buying total fee is from quantity, when selling from totalAmount
  await addOrderAndVerify(trader1, sellOrderClient, 3, ethers.constants.HashZero, totalAmount,filledQtyBN, totalFee);  // status is FILLED = 3

});


it("Should allow both withdraw and transfer when auction mode is OFF", async () => {

  const lfgBalancesNew: Array<BigNumber> = [];

  await exchange.connect(auctionAdminWallet).setAuctionMode(tp, 0)  // auction mode = 0 (OFF)
  const tradePairData = await tradePairs.getTradePair(tp);
  expect(tradePairData.auctionMode).to.equal(0);

  //Auction mode already set to 0 in the previous test and auctionAdminWallet will not be able to change the auctionmode when it is already 0
  await expect(exchange.connect(auctionAdminWallet).setAuctionMode(tp, 2)).to.be.revertedWith("E-OACC-04");

  const _token = Utils.fromUtf8("LFG"); //LFG
  // save LFG balances before withdrawal/transfers
  for (let i=0; i<accounts.length; i++) {
      const _bal = await portfolioSub.getBalance(accounts[i], _token);
      lfgBalances[i] = _bal.total;
  }

  //console.log(lfgBalances)

  //do a transfer
  await portfolioSub.connect(auctionAdminWallet).transferToken(accounts[2], Utils.fromUtf8(pair.baseSymbol), Utils.parseUnits('2', pair.baseDecimals));

  for (let i=0; i<accounts.length; i++) {
      const _bal = await portfolioSub.getBalance(accounts[i], _token);
      lfgBalancesNew[i] = _bal.total;
  }
  //console.log (lfgBalancesNew)
  expect(lfgBalancesNew[1]).to.equal(lfgBalances[1].sub(Utils.parseUnits('2', pair.baseDecimals)));
  expect(lfgBalancesNew[2]).to.equal(lfgBalances[2].add(Utils.parseUnits('2', pair.baseDecimals)));


  for (let i = 0; i < accounts.length; i++) {
    //do withdrawals from all accounts
    expect(await withdrawToken(wallets[i], 5, _token, pair.baseDecimals) ).to.equal(true);
    const _bal = await portfolioSub.getBalance(accounts[i], _token);
    expect(_bal.total).to.equal(lfgBalancesNew[i].sub(Utils.parseUnits('5', pair.baseDecimals)));
 }


})
;

});

function findOrder(id: string, orders: Map<string, any>)  {
  for (const order of orders.values()){
    //this.logger.debug (`Order: ${order.side}  ${order.quantity.toString()}  ${order.price.toString()}`);
    if (order.id === id) {
      return order;
    }
  }
}

async function withdrawToken(wallet: SignerWithAddress, withdrawal_amount: number, symbolByte32: string, decimals: number) {
  const tx =await f.withdrawToken(portfolioSub, wallet, symbolByte32, decimals, withdrawal_amount.toString())
  await tx.wait();
  return true;
}

async function  addOrderAndVerify(trader: SignerWithAddress, order: any, expectedStatus: number
    , expectedCode: string = ethers.constants.HashZero
    , expectedTotalAmount = BigNumber.from(0), expectedQuantityFilled = BigNumber.from(0), expectedTotalFee = BigNumber.from(0)
    ): Promise<string | any>{

    const tx = await tradePairs.connect(trader).addNewOrder(order);
    const res: any  = await tx.wait();

  for (const e of res.events) {

        if (e.event === "OrderStatusChanged" && e.args.traderaddress === trader.address && e.args.order.clientOrderId == order.clientOrderId) {
            //console.log("code:", Utils.toUtf8(e.args.code) , "order:", e.args.order);
            //expect(e.event).to.be.equal('OrderStatusChanged');
            //expect(e.args.traderaddress).to.be.equal(order.traderaddress);
            // console.log (expectedTotalAmount, expectedQuantityFilled, expectedTotalFee)
            const rOrder = processOrders(e.args.traderaddress, e.args.pair, e.args.order.id, e.args.order.price, e.args.order.totalAmount,
                                            e.args.order.quantity,e.args.order.side, e.args.order.type1, e.args.order.type2, e.args.order.status,
                                            e.args.order.quantityFilled, e.args.order.totalFee, e, pair.baseDecimals, pair.quoteDecimals);
            if (rOrder) {
              orders.set(rOrder.id, rOrder);
            }


            if (e.args.order.status ==1 && e.args.order.status != expectedStatus &&  e.args.code != expectedCode) {
            console.log("Order Rejected unexpectedly", Utils.toUtf8(e.args.code));
            }
            expect(e.args.pair).to.be.equal(order.tradePairId);

            expect(e.args.order.traderaddress).to.be.equal(order.traderaddress);
            expect(e.args.order.tradePairId).to.be.equal(order.tradePairId);
            expect(e.args.order.clientOrderId).to.be.equal(order.clientOrderId);

            if (!e.args.order.totalAmount.eq(expectedTotalAmount) || e.args.order.status != expectedStatus ) {
                console.log("expectedStatus:", expectedStatus , "expectedTotalAmount:", expectedTotalAmount, "code:", Utils.toUtf8(e.args.code) , "Order:", e.args.order);
            }

            expect(e.args.order.totalAmount).to.be.equal(expectedTotalAmount);      // not executed, yet, so totalamount is 0
            expect(e.args.order.quantity).to.be.equal(order.quantity);
            expect(e.args.order.side).to.be.equal(order.side);             // side is BUY=0
            expect(e.args.order.type1).to.be.equal(order.type1);            // type1 is LIMIT=1
            expect(e.args.order.type2).to.be.equal(order.type2);            // type2 is GTC=0
            expect(e.args.order.status).to.be.equal(expectedStatus);           // status is NEW = 0
            expect(e.args.order.quantityFilled).to.be.equal(expectedQuantityFilled);   // not executed, yet, so quantityfilled is 0
            expect(e.args.order.totalFee).to.be.equal(expectedTotalFee);         // not executed, yet, so free is 0
            expect(e.args.order.updateBlock).to.be.equal(res.blockNumber);
            expect(e.args.order.createBlock).to.be.equal(res.blockNumber);
            expect(e.args.code).to.be.equal(expectedCode);         // error code
            return e.args.order.id;
        }
    }
}

function makeOrder(traderaddress: string, pair: string, id: string, price: BigNumber, totalamount: BigNumber, quantity: BigNumber, side: string,
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

function processOrders(traderaddress: string, pair: string, id: string, price: BigNumber, totalamount: BigNumber, quantity: BigNumber, side: string,
                             type1: string, type2: string, status: string, quantityfilled: BigNumber, totalfee: BigNumber, event: Event, baseDecimals: number,
                             quoteDecimals: number) {
  try {
      const order = makeOrder(traderaddress,
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

async function cancelOrder(wallet: SignerWithAddress, orderId: string, pair: any, orders: Map<string, any>) {
  let orderLog: any = {};

  const tx = await tradePairs.connect(wallet).cancelOrder(orderId);
  orderLog = await tx.wait();

  if (orderLog){
    for (const _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          const rOrder = processOrders(_log.args.traderaddress, _log.args.pair, _log.args.order.id, _log.args.order.price, _log.args.order.totalAmount,
                                           _log.args.order.quantity,_log.args.order.side, _log.args.order.type1, _log.args.order.type2, _log.args.order.status,
                                           _log.args.order.quantityFilled, _log.args.order.totalFee, _log, pair.baseDecimals, pair.quoteDecimals);
          if (rOrder) orders.set(rOrder.id, rOrder);
        }
      }
    }
  }

  return true;
}

async function cancelOrderList(wallet: SignerWithAddress, orderIds: string[], pair: any, orders: Map<string, any>) {
  let orderLog: any = {};

  const tx = await tradePairs.connect(wallet).cancelOrderList(orderIds);
  orderLog = await tx.wait();

  if (orderLog){
    for (const _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          const rOrder = processOrders(_log.args.traderaddress, _log.args.pair, _log.args.order.id, _log.args.order.price, _log.args.order.totalAmount,
                                           _log.args.order.quantity,_log.args.order.side, _log.args.order.type1, _log.args.order.type2, _log.args.order.status,
                                           _log.args.order.quantityFilled, _log.args.order.totalFee, _log, pair.baseDecimals, pair.quoteDecimals);
          if (rOrder) orders.set(rOrder.id, rOrder);
        }
      }
    }
  }

  return true;
}

async function CancelReplaceOrder(wallet: SignerWithAddress, order: any, clientOrderId: string, newpx: string, newqty: string, pair: any, orders: Map<string, any>) {
  let orderLog: any = {};

  let orderId: string="";

  const tx = await tradePairs.connect(wallet).cancelReplaceOrder(order.id,
                                                                 clientOrderId,
                                                                 Utils.parseUnits(newpx, pair.quoteDecimals),
                                                                 Utils.parseUnits(newqty, pair.baseDecimals));

  orderLog = await tx.wait();
  if (orderLog){
    for (const _log of orderLog.events) {
      if (_log.event) {
        if (_log.event === 'OrderStatusChanged') {
          const rOrder = processOrders(_log.args.traderaddress, _log.args.pair, _log.args.order.id, _log.args.order.price, _log.args.order.totalAmount,
                                           _log.args.order.quantity,_log.args.order.side, _log.args.order.type1, _log.args.order.type2, _log.args.order.status,
                                           _log.args.order.quantityFilled, _log.args.order.totalFee, _log, pair.baseDecimals, pair.quoteDecimals);
          if (rOrder) {
            orders.set(rOrder.id, rOrder);
            orderId= rOrder.id;
          }
        }
      }
    }
  }

  return orderId;

}
