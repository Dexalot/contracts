/**
 * The test runner for Dexalot OrderBooks contract
 */

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

  it("... should return (0,0) from getNOrdersOld() if n = 0 correctly", async () => {
    let n = 0;
    let lowest = 0;
    let highest = 1;
    let res1 = await orderBooks.getNOrdersOld(sellBook, n, lowest);
    expect(res1[0].toString()).to.be.equal('0');
    expect(res1[1].toString()).to.be.equal('0');
    let res2 = await orderBooks.getNOrdersOld(sellBook, n, highest);
    expect(res2[0].toString()).to.be.equal('0');
    expect(res2[1].toString()).to.be.equal('0');
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

  it("... should get the Book Sizes", async () => {
    const buySize = await orderBooks.getBookSize(buyBook);
    const sellSize = await orderBooks.getBookSize(sellBook);
    console.log(`BuyBookSize: ${buySize}  ::  SellBookSize : ${sellSize}`);
    expect(buySize).to.be.equal(4);
    expect(sellSize).to.be.equal(4);
  });

  it("... should get roots correctly", async () => {
    const buyRoot = await orderBooks.root(buyBook);
    const sellRoot = await orderBooks.root(sellBook);
    console.log(`Buy Root: ${Utils.formatUnits(buyRoot, 18)}  ::  Sell Root : ${Utils.formatUnits(sellRoot, 18)}`);
    expect(parseFloat(Utils.formatUnits(buyRoot, 18))).to.be.equal(0.0018);
    expect(parseFloat(Utils.formatUnits(sellRoot, 18))).to.be.equal(0.002);
  });

  it("... should get firsts correctly", async () => {
    const buyFirst = await orderBooks.first(buyBook);
    const sellFirst = await orderBooks.first(sellBook);
    console.log(`Buy First: ${Utils.formatUnits(buyFirst, 18)}  ::  Sell First : ${Utils.formatUnits(sellFirst, 18)}`);
    expect(parseFloat(Utils.formatUnits(buyFirst, 18))).to.be.equal(0.0016);
    expect(parseFloat(Utils.formatUnits(sellFirst, 18))).to.be.equal(0.0018);
  });

  it("... should get lasts correctly", async () => {
    const buyLast = await orderBooks.last(buyBook);
    const sellLast = await orderBooks.last(sellBook);
    console.log(`Buy Last: ${Utils.formatUnits(buyLast, 18)}  ::  Sell Last : ${Utils.formatUnits(sellLast, 18)}`);
    expect(parseFloat(Utils.formatUnits(buyLast, 18))).to.be.equal(0.0022);
    expect(parseFloat(Utils.formatUnits(sellLast, 18))).to.be.equal(0.0024);
  });

  it("... should get nexts correctly", async () => {
    const buyNext = await orderBooks.next(buyBook, Utils.parseUnits('0.002', 18));
    const sellNext = await orderBooks.next(sellBook, Utils.parseUnits('0.002', 18));
    console.log(`Buy Next: ${Utils.formatUnits(buyNext, 18)}  ::  Sell Next : ${Utils.formatUnits(sellNext, 18)}`);
    expect(parseFloat(Utils.formatUnits(buyNext, 18))).to.be.equal(0.0022);
    expect(parseFloat(Utils.formatUnits(sellNext, 18))).to.be.equal(0.0022);
  });

  it("... should get prevs correctly", async () => {
    const buyPrev = await orderBooks.prev(buyBook, Utils.parseUnits('0.002', 18));
    const sellPrev = await orderBooks.prev(sellBook, Utils.parseUnits('0.002', 18));
    console.log(`Buy Prev: ${Utils.formatUnits(buyPrev, 18)}  ::  Sell Prev : ${Utils.formatUnits(sellPrev, 18)}`);
    expect(parseFloat(Utils.formatUnits(buyPrev, 18))).to.be.equal(0.0018);
    expect(parseFloat(Utils.formatUnits(sellPrev, 18))).to.be.equal(0.0018);
  });

  it("... should check if a price exists correctly", async () => {
    const buyExists = await orderBooks.exists(buyBook, Utils.parseUnits('0.002', 18));
    const sellExists = await orderBooks.exists(sellBook, Utils.parseUnits('0.002', 18));
    const buyNotExists = await orderBooks.exists(buyBook, Utils.parseUnits('0.2', 18));
    const sellNotExists = await orderBooks.exists(sellBook, Utils.parseUnits('0.2', 18));
    console.log(`Buy Exists: ${buyExists}  ::  Sell Exists : ${sellExists}`);
    console.log(`Buy Not Exists: ${buyNotExists}  ::  Sell Not Exists : ${sellNotExists}`);
    expect(buyExists).to.be.equal(true);
    expect(sellExists).to.be.equal(true);
    expect(buyNotExists).to.be.equal(false);
    expect(sellNotExists).to.be.equal(false);
  });

  it("... should get Node correctly", async () => {
    const node = await orderBooks.getNode(buyBook, Utils.parseUnits('0.002', 18));
    const price = node[0];
    const parent = node[1];
    const left = node[2];
    const right = node[3];
    const red = node[4];
    const head = node[5];
    const size = node[6];
    console.log(`Price: ${price} :: Parent: ${parent} :: Left: ${left} :: Right: ${right} :: Red: ${red} :: Head: ${head} :: Size: ${size}`);
    expect(price).to.be.equal(Utils.parseUnits('0.002', 18));
    expect(parent).to.be.equal(Utils.parseUnits('0.0018', 18));
    expect(left).to.be.equal(0);
    expect(right).to.be.equal(Utils.parseUnits('0.0022', 18));
    expect(red).to.be.equal(false);
    expect(head).to.be.equal('0x3700000000000000000000000000000000000000000000000000000000000000');
    expect(size).to.be.equal(3);
  });

  it("... should get Node with zeros if price does not exists", async () => {
    const node = await orderBooks.getNode(buyBook, Utils.parseUnits('0.2', 18));
    const price = node[0];
    const parent = node[1];
    const left = node[2];
    const right = node[3];
    const red = node[4];
    const head = node[5];
    const size = node[6];
    console.log(`Price: ${price} :: Parent: ${parent} :: Left: ${left} :: Right: ${right} :: Red: ${red} :: Head: ${head} :: Size: ${size}`);
    expect(price).to.be.equal(0);
    expect(parent).to.be.equal(0);
    expect(left).to.be.equal(0);
    expect(right).to.be.equal(0);
    expect(red).to.be.equal(false);
    expect(head).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000');
    expect(size).to.be.equal(0);
  });

  it("... should handle removeFirstOrder() for a non-existing book id", async () => {
    // fail with non-existent tree key
    await expect(orderBooks.removeFirstOrder(Utils.fromUtf8("NOBOOK"), Utils.parseUnits('0.2', 18))).to.be.revertedWith("R-KDNE-02");
  });

});
