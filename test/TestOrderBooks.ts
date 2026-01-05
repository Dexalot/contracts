/**
 * The test runner for Dexalot OrderBooks contract
 */

import Utils from './utils';

import { OrderBooks } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import * as f from "./MakeTestSuite";

import { expect } from "chai";

describe("OrderBooks", () => {

  let orderBooks: OrderBooks;
  let pair: string;
  let tradePairId: string;
  let buyBook: string;
  let sellBook: string;

  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let auctionAdmin: SignerWithAddress;
  let other1: SignerWithAddress;
  let other2: SignerWithAddress;

  const buyIDs: Array<string> = [];
  const buyPrices: Array<number> = [];
  const sellIDs: Array<string> = [];
  const sellPrices: Array<number> = [];

  before(async () => {
    const { owner: owner1, admin: admin1, auctionAdmin: admin2, other1: o1, other2: o2 } = await f.getAccounts();
    owner = owner1;
    admin = admin1;
    auctionAdmin = admin2;
    other1 = o1;
    other2 = o2;

    console.log("Owner", owner.address);
    console.log("Admin", admin.address );
    console.log("AuctionAdmin", auctionAdmin.address);
    console.log("Other1", other1.address);
    console.log("Other2", other2.address);

    orderBooks = await f.deployOrderBooks();
    await orderBooks.grantRole(await orderBooks.EXECUTOR_ROLE(), owner.address)

    pair = "ALOT/AVAX"
    buyBook = Utils.fromUtf8(`${pair}-BUYBOOK`)
    sellBook = Utils.fromUtf8(`${pair}-SELLBOOK`)

    tradePairId = Utils.fromUtf8(pair);

    orderBooks.addToOrderbooks(tradePairId);

    // reading orders from csv file and populate the a buy and a sell book
    const buyOrders = await Utils.loadOrders('./test/data/05_TestBuyOrderBook.csv');
    for (let i=0; i<buyOrders.length; i++) {
      buyIDs[i] = buyOrders[i]["orderid"];
      buyPrices[i] = parseFloat(buyOrders[i]["price"]);
      const priceStr = buyOrders[i]["price"];
      await orderBooks.addOrder(buyBook, Utils.fromUtf8(buyIDs[i]), Utils.toWei(priceStr));
    }

    const sellOrders = await Utils.loadOrders('./test/data/06_TestSellOrderBook.csv');
    for (let i=0; i<sellOrders.length; i++) {
      sellIDs[i] = sellOrders[i]["orderid"];
      sellPrices[i] = parseFloat(sellOrders[i]["price"]);
      const priceStr = sellOrders[i]["price"];
      await orderBooks.addOrder(sellBook, Utils.fromUtf8(sellIDs[i]), Utils.toWei(priceStr));
    }
  });

  it("Should not initialize again after deployment", async function () {
    await expect(orderBooks.initialize()).to.be.revertedWith("Initializable: contract is already initialized");
  });

  it("Should not allow matchTrade() from non-owners of OrderBooks", async () => {
    await expect(orderBooks.connect(other1).matchTrade(sellBook, Utils.toWei(`${sellPrices[0]}`), 1, 1))
      .to.be.revertedWith("AccessControl:");
  })

  it("Should not allow addOrder() from non-owners of OrderBooks", async () => {
    await expect(orderBooks.connect(other1).addOrder(sellBook, Utils.fromUtf8(sellIDs[0]), Utils.toWei(`${sellPrices[0]}`)))
      .to.be.revertedWith("AccessControl:");
  })

  it("Should not allow removeOrder() from non-owners of OrderBooks", async () => {
    await expect(orderBooks.connect(other1).removeOrder(sellBook, Utils.fromUtf8(sellIDs[0]), Utils.toWei(`${sellPrices[0]}`)))
      .to.be.revertedWith("AccessControl:");
  })

  it("Should not allow orderListExists() from non-owners of OrderBooks", async () => {
    await expect(orderBooks.connect(other1).orderListExists(sellBook, Utils.toWei(`${sellPrices[0]}`)))
      .to.be.revertedWith("AccessControl:");
  })

  it("Should not allow removeFirstOrder() from non-owners of OrderBooks", async () => {
    await expect(orderBooks.connect(other1).removeFirstOrder(sellBook, Utils.toWei(`${sellPrices[0]}`)))
      .to.be.revertedWith("AccessControl:");
  })

  it("Should return (0,0) from getNOrders() if n = 0 correctly", async () => {
    const n = 0;
    const res = await orderBooks.getNOrders(sellBook, n, n, Utils.toWei(`${sellPrices[2]}`), Utils.fromUtf8(sellIDs[2]));
    expect(res.prices.length).to.equal(1);
    expect(res.quantities.length).to.equal(1);
    expect(res.prices[0]).to.equal(0);
    expect(res.quantities[0]).to.equal(0);
  });

  it("Should return (0,0) from getNOrders() if lastPrice not in the order book", async () => {
    const n = 2;
    const res = await orderBooks.getNOrders(sellBook, n, n, Utils.toWei("2.12"), Utils.fromUtf8(sellIDs[2]));
    expect(res.prices.length).to.equal(1);
    expect(res.quantities.length).to.equal(1);
    expect(res.prices[0]).to.equal(0);
    expect(res.quantities[0]).to.equal(0);
  });

  it("Should return (0,0) from getNOrdersOld() for an empty order book correctly", async () => {
    const n = 2;
    const lowest = 0;
    const res = await orderBooks.getNOrdersOld(Utils.fromUtf8("NOBOOK"), n, lowest);
    expect(res[0].length).to.equal(1);
    expect(res[0].length).to.equal(1);
    expect(res[0][0]).to.equal(0);
    expect(res[0][0]).to.equal(0);
  });

  it("Should return (0,0) from getNOrdersOld() if n = 0 correctly", async () => {
    const n = 0;
    const lowest = 0;
    const highest = 1;
    const res1 = await orderBooks.getNOrdersOld(sellBook, n, lowest);
    expect(res1[0].toString()).to.be.equal('0');
    expect(res1[1].toString()).to.be.equal('0');
    const res2 = await orderBooks.getNOrdersOld(sellBook, n, highest);
    expect(res2[0].toString()).to.be.equal('0');
    expect(res2[1].toString()).to.be.equal('0');
  });

  it("Should get the correct top of sell book", async () => {
    const side = 1;
    const tob = await orderBooks.nextPrice(sellBook, side, 0)
    console.log(`Top of sell book: ${Utils.formatUnits(tob, 18)}`)
    expect(tob).to.equal(Utils.toWei(Math.min(...sellPrices).toString()));
  });

  it("Should get the correct top of buy book", async () => {
    const side = 0;
    const tob = await orderBooks.nextPrice(buyBook, side, 0);
    console.log(`Top of buy book: ${Utils.formatUnits(tob, 18)}`)
    expect(tob).to.equal(Utils.toWei(Math.max(...buyPrices).toString()));
  });

  it("Should traverse the sell book correctly", async () => {
    const side = 1;
    const tob = await orderBooks.nextPrice(sellBook, side, 0)
    let nextPrice = tob;
    while(nextPrice.gt(0)) {
      let orderid = await orderBooks.getHead(sellBook, nextPrice);
      const orders = [];
      while(orderid != "0x0000000000000000000000000000000000000000000000000000000000000000") {
        orders.push(Utils.toUtf8(orderid));
        orderid = await orderBooks.nextOrder(sellBook, nextPrice, orderid);
      }
      console.log(`Price: ${Utils.formatUnits(nextPrice, 18)}  ::  Order IDs: ${orders}`);
      nextPrice = await orderBooks.nextPrice(sellBook, side, nextPrice);
    }
  });

  it("Should get the getTopOfTheBook", async () => {
    const bestBid = await orderBooks.getTopOfTheBook(buyBook);
    const bestAsk = await orderBooks.getTopOfTheBook(sellBook);
    console.log(`Best Bid: ${Utils.formatUnits(bestBid.price, 18)}  ::  Best Ask : ${Utils.formatUnits(bestAsk.price, 18)}`);
    expect(bestBid.price).to.be.equal(Utils.toWei(Math.max(...buyPrices).toString()));
    expect(bestAsk.price).to.be.equal(Utils.toWei(Math.min(...sellPrices).toString()));
    expect(bestBid.orderId).to.be.equal("0x3130000000000000000000000000000000000000000000000000000000000000");
    expect(bestAsk.orderId).to.be.equal("0x3100000000000000000000000000000000000000000000000000000000000000");


  });


  it("Should traverse the buy book correctly", async () => {
    const side = 0;
    const tob = await orderBooks.nextPrice(buyBook, side, 0);
    let nextPrice = tob;
    while(nextPrice.gt(0)) {
      let orderid = await orderBooks.getHead(buyBook, nextPrice);
      const orders = [];
      while(orderid != "0x0000000000000000000000000000000000000000000000000000000000000000") {
        orders.push(Utils.toUtf8(orderid));
        orderid = await orderBooks.nextOrder(buyBook, nextPrice, orderid);
      }
      console.log(`Price: ${Utils.formatUnits(nextPrice, 18)}  ::  Order IDs: ${orders}`);
      nextPrice = await orderBooks.nextPrice(buyBook, side, nextPrice);
    }
  });

  it("Should get the Book Sizes", async () => {
    const buySize = await orderBooks.getBookSize(buyBook);
    const sellSize = await orderBooks.getBookSize(sellBook);
    console.log(`BuyBookSize: ${buySize}  ::  SellBookSize : ${sellSize}`);
    expect(buySize).to.be.equal(4);
    expect(sellSize).to.be.equal(4);
  });

  it("Should get bestPrice correctly", async () => {
    const bestBid = await orderBooks.bestPrice(buyBook);
    const bestAsk = await orderBooks.bestPrice(sellBook);
    console.log(`Best Bid: ${Utils.formatUnits(bestBid, 18)}  ::  Best Ask : ${Utils.formatUnits(bestAsk, 18)}`);
    expect(bestBid).to.be.equal(Utils.toWei(Math.max(...buyPrices).toString()));
    expect(bestAsk).to.be.equal(Utils.toWei(Math.min(...sellPrices).toString()));
  });

  it("Should check if a price exists correctly", async () => {
    const buyExists = await orderBooks.exists(buyBook, Utils.parseUnits('0.002', 18));
    const sellExists = await orderBooks.exists(sellBook, Utils.parseUnits('0.002', 18));
    const buyNotExists = await orderBooks.exists(buyBook, Utils.parseUnits('0.2', 18));
    const sellNotExists = await orderBooks.exists(sellBook, Utils.parseUnits('0.2', 18));
    console.log(`Buy Exists: ${buyExists}  ::  Sell Exists : ${sellExists}`);
    console.log(`Buy Not Exists: ${buyNotExists}  ::  Sell Not Exists : ${sellNotExists}`);
    expect(buyExists).to.be.true;
    expect(sellExists).to.be.true;
    expect(buyNotExists).to.be.false;
    expect(sellNotExists).to.be.false;


    expect(await orderBooks.orderListExists(buyBook, Utils.parseUnits('0.002', 18)))
    .to.be.true;
    expect(await orderBooks.orderListExists(sellBook, Utils.parseUnits('0.002', 18)))
    .to.be.true;


  });

  it("Should get Node correctly", async () => {
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
    expect(red).to.be.false;
    expect(head).to.be.equal('0x3700000000000000000000000000000000000000000000000000000000000000');
    expect(size).to.be.equal(3);
  });

  it("Should get Node with zeros if price does not exists", async () => {
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
    expect(red).to.be.false;
    expect(head).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000');
    expect(size).to.be.equal(0);
  });

  it("Should handle removeFirstOrder() for a non-existing book id", async () => {
    // fail with non-existent tree key
    await expect(orderBooks.removeFirstOrder(Utils.fromUtf8("NOBOOK"), Utils.parseUnits('0.2', 18))).to.be.revertedWith("R-KDNE-02");
  });

  it("Should use addToOrderbooks() correctly", async function () {
    // fail for non-owner
    await expect(orderBooks.connect(other1).addToOrderbooks(tradePairId)).to.be.revertedWith("AccessControl:");
    // succeed for owner
    await orderBooks.addToOrderbooks(tradePairId);

  });

  it("Should use setTradePairs() correctly", async function () {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    // fail for non-owner
    await expect(orderBooks.connect(other1).setTradePairs(other1.address)).to.be.revertedWith("AccessControl:");
    // succeed for owner
    await (expect(orderBooks.setTradePairs(other1.address)))
      .to.emit(orderBooks, "TradePairsSet")
      .withArgs(ZERO_ADDRESS, other1.address);
  });

  it("Should use getTradePairs correctly", async function () {
    await orderBooks.setTradePairs(other1.address);
    await orderBooks.setTradePairs(other2.address);
    expect(await orderBooks.getTradePairs()).to.be.equal(other2.address);
  });

  it("Should use isNotCrossedBook correctly", async function () {
    const bBook = Utils.fromUtf8(`LFG/SER-BUYBOOK`)
    const sBook = Utils.fromUtf8(`LFG/SER-SELLBOOK`)
    const tradePairId = Utils.fromUtf8(`LFG/SER`)
    await orderBooks.addToOrderbooks(tradePairId);


    // true - sBook = 0
    expect(await orderBooks.isNotCrossedBook(sBook, bBook)).to.be.true;

    // true - bBook = 0
    await orderBooks.addOrder(sBook, Utils.fromUtf8("101"), Utils.toWei("1.2"));
    expect(await orderBooks.isNotCrossedBook(sBook, bBook)).to.be.true;

    // false - bestPrice(_sellBookId) > bestPrice(_buyBookId)
    await orderBooks.addOrder(bBook, Utils.fromUtf8("102"), Utils.toWei("0.8"));
    expect(await orderBooks.isNotCrossedBook(sBook, bBook)).to.be.true;

    // true - bestPrice(_sellBookId) < bestPrice(_buyBookId)
    await orderBooks.addOrder(bBook, Utils.fromUtf8("103"), Utils.toWei("1.4"));
    expect(await orderBooks.isNotCrossedBook(sBook, bBook)).to.be.false;
  });
});
