/**
 * The test runner for Dexalot Portfolio contract
 */

// import Chai for its asserting functions
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const Utils = require('./utils.js');

let OrderBooks;
let orderBooks;
let pair;
let buyBook;
let sellBook;
let buyIDs = [];
let buyPrices = [];
let sellIDs = [];
let sellPrices = [];

describe("OrderBooks", accounts => {

  before(async () => {
    // deploy contracts
    OrderBooks = await ethers.getContractFactory("OrderBooks");

    pair = "ALOT/AVAX";
    buyBook = Utils.fromUtf8(`${pair}-BUYBOOK`)
    sellBook = Utils.fromUtf8(`${pair}-SELLBOOK`)

    // deploy OrderBooks
    orderBooks = await upgrades.deployProxy(OrderBooks);

    // reading orders from csv file and populate the a buy and a sell book
    const buyOrders = await Utils.loadOrders('./test/data/05_TestBuyOrderBook.csv');
    for (var i=0; i<buyOrders.length; i++) {
      buyIDs[i] = buyOrders[i]["orderid"];
      buyPrices[i] = parseFloat(buyOrders[i]["price"]);
      priceStr = buyOrders[i]["price"];
      await orderBooks.addOrder(buyBook, Utils.fromUtf8(buyIDs[i]), Utils.toWei(priceStr));
    }

    const sellOrders = await Utils.loadOrders('./test/data/06_TestSellOrderBook.csv');
    for (var i=0; i<sellOrders.length; i++) {
      sellIDs[i] = sellOrders[i]["orderid"];
      sellPrices[i] = parseFloat(sellOrders[i]["price"]);
      priceStr = sellOrders[i]["price"];
      await orderBooks.addOrder(sellBook, Utils.fromUtf8(sellIDs[i]), Utils.toWei(priceStr));
    }
  });

  it("... should get the correct top of sell book", async () => {
    let side = 1;
    const tob = await orderBooks.nextPrice(sellBook, side, 0)
    console.log(`Top of sell book: ${Utils.formatUnits(tob, 18)}`)
    expect(tob).to.equal(Utils.toWei(Math.min(...sellPrices).toString()));
  });

  it("... should get the correct top of buy book", async () => {
    let side = 0;
    const tob = await orderBooks.nextPrice(buyBook, side, 0);
    console.log(`Top of buy book: ${Utils.formatUnits(tob, 18)}`)
    expect(tob).to.equal(Utils.toWei(Math.max(...buyPrices).toString()));
  });

  it("... should traverse the sell book correctly", async () => {
    const side = 1;
    const tob = await orderBooks.nextPrice(sellBook, side, 0)
    let nextPrice = tob;
    while(nextPrice>0) {
      let orderid = await orderBooks.getHead(sellBook, nextPrice);
      let orders = [];
      while(orderid != "0x0000000000000000000000000000000000000000000000000000000000000000") {
        orders.push(Utils.toUtf8(orderid));
        orderid = await orderBooks.nextOrder(sellBook, nextPrice, orderid);
      }
      console.log(`Price: ${Utils.formatUnits(nextPrice, 18)}  ::  Order IDs: ${orders}`);
      nextPrice = await orderBooks.nextPrice(sellBook, side, nextPrice);
    }
  });

  it("... should traverse the buy book correctly", async () => {
    const side = 0;
    const tob = await orderBooks.nextPrice(buyBook, side, 0);
    let nextPrice = tob;
    while(nextPrice>0) {
      let orderid = await orderBooks.getHead(buyBook, nextPrice);
      let orders = [];
      while(orderid != "0x0000000000000000000000000000000000000000000000000000000000000000") {
        orders.push(Utils.toUtf8(orderid));
        orderid = await orderBooks.nextOrder(buyBook, nextPrice, orderid);
      }
      console.log(`Price: ${Utils.formatUnits(nextPrice, 18)}  ::  Order IDs: ${orders}`);
      nextPrice = await orderBooks.nextPrice(buyBook, side, nextPrice);
    }
  });


  it("... should get the Book Sizes ", async () => {

    const buysize = await orderBooks.getBookSize(buyBook);
    const sellsize = await orderBooks.getBookSize(sellBook);
    console.log(`BuyBookSize: ${buysize}  ::  SellBookSize : ${sellsize}`);
  });




});
