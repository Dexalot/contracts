/**
 * The test runner for Dexalot OneClick contract
 */

const { expect } = require("chai")
const { ethers, upgrades } = require("hardhat")

const Utils = require('./utils.js')

const ZEROADDR = "0x0000000000000000000000000000000000000000"

const testsToRun = [1, 2, 3, 4, 5, 6]
// const testsToRun = [0]

describe("OneClick", function () {
    let OneClick
    let oneClick
    let MockToken
    let baseToken
    let quoteToken

    let Exchange
    let exchange
    let Portfolio
    let portfolio
    let TradePairs
    let tradePairs
    let OrderBooks
    let orderBooks

    let owner
    let admin
    let auctionAdmin
    let trader1
    let trader2
    let foundationSafe

    before(async function () {
        MockToken = await ethers.getContractFactory("MockToken")
        Exchange = await ethers.getContractFactory("Exchange")
        Portfolio = await ethers.getContractFactory("Portfolio")
        TradePairs = await ethers.getContractFactory("TradePairs")
        OrderBooks = await ethers.getContractFactory("OrderBooks")
        OneClick = await ethers.getContractFactory("OneClick")
    })

    beforeEach(async function () {
        [owner, admin, auctionAdmin, trader1, trader2, foundationSafe] = await ethers.getSigners()

        exchange = await upgrades.deployProxy(Exchange)
        portfolio = await upgrades.deployProxy(Portfolio)
        orderBooks = await upgrades.deployProxy(OrderBooks)
        tradePairs = await upgrades.deployProxy(TradePairs, [orderBooks.address, portfolio.address])

        await portfolio.addAdmin(exchange.address)
        await portfolio.addAdmin(tradePairs.address)

        await portfolio.setNative(Utils.fromUtf8("AVAX"))

        oneClick = await upgrades.deployProxy(OneClick,
            [portfolio.address, tradePairs.address, await portfolio.getNative()])

        await exchange.setPortfolio(portfolio.address)
        await exchange.setTradePairs(tradePairs.address)

        await portfolio.setFeeAddress(foundationSafe.address)

        await orderBooks.transferOwnership(tradePairs.address)
        await tradePairs.transferOwnership(exchange.address)

        await exchange.addAdmin(admin.address)
        await exchange.addAuctionAdmin(auctionAdmin.address)

        await exchange.connect(admin).addInternalContract(oneClick.address, "OneClick")
    })

    describe("Configuration", function () {
        it("Should have the correct portfolio address", async function () {
            expect(await oneClick.portfolio()).to.be.equal(portfolio.address)
        })

        it("Should have the correct tradePairs address", async function () {
            expect(await oneClick.tradePairs()).to.be.equal(tradePairs.address)
        })

        it("Should have the correct native", async function () {
            expect(await oneClick.native()).to.be.equal(Utils.fromUtf8("AVAX"))
        })
    })

    describe("Receive and Fallback not accepted", function () {
        it("Should not accept via receive()", async function () {
            await expect(owner.sendTransaction({from: owner.address, to: oneClick.address, value: Utils.toWei("100")}))
                .to.be.revertedWith("OC-NREC-01")
        })

        it("Should not accept via fallback()", async function () {
            let ABI = ["function NOT_EXISTING_FUNCTION(address,uint256)"]
            let iface = new ethers.utils.Interface(ABI)
            let calldata = iface.encodeFunctionData("NOT_EXISTING_FUNCTION", [trader2.address, Utils.toWei('100')])
            await expect(owner.sendTransaction({to: oneClick.address, data: calldata}))
                .to.be.revertedWith("OC-NFUN-01")
        })
    })

    // there can be 3 types of pairs
    // 1. Base: NATIVE / Quote: TOKEN
    // 2. Base: TOKEN  / Quote: TOKEN
    // 3. Base: TOKEN  / Quote: NATIVE
    // both BUY and SELL side transactions for all three types of pairs are grouped in each describe

    describe("Tests for Deposit - Buy - Withdraw using OneClick", function () {

        if (testsToRun.includes(1)) {
            it("Should be able to Deposit Token - Buy Native - Withdraw Native for a NATIVE/TOKEN pair", async function () {
                let tx
                let receipt

                let baseSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let baseSymbol = await portfolio.getNative()
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseAssetAddr = ZEROADDR

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // save trader1 balances before orders are added
                const trader1BalBaseW1 = await ethers.provider.getBalance(trader1.address)                // wallet base token balance
                const trader1BalBaseA1 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT1 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW1 = await quoteToken.balanceOf(trader1.address)                     // wallet quote token  balance
                const trader1BalQuoteA1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances before orders are added
                const trader2BalBaseW1 = await ethers.provider.getBalance(trader2.address)                // wallet base token balance
                const trader2BalBaseA1 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT1 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW1 = await quoteToken.balanceOf(trader2.address)                     // wallet quote token  balance
                const trader2BalQuoteA1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("Before Orders")
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT1, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT1, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT1, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT1, quoteDecimals)}`)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 adds a sell order for 10 NATIVE at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 1, 1)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 1 for addOrder()
                let trader1Gas = receipt.cumulativeGasUsed
                let trader1Price = receipt.effectiveGasPrice
                let trader1GasPaid = trader1Gas.mul(trader1Price)

                // trader 2 approves a buy order for 10 NATIVE at 100 QT
                tx = await quoteToken.connect(trader2).approve(portfolio.address, quantity2)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 2 for approve()
                let trader2Gas = receipt.cumulativeGasUsed
                let trader2Price = receipt.effectiveGasPrice
                let trader2GasPaid = trader2Gas.mul(trader2Price)

                // trader 2 adds a buy order for 10 NATIVE at 100 QT
                tx = await oneClick.connect(trader2).depositBuyWithdraw(tradePairId, price, quantity2, 4)
                receipt = await tx.wait()

                // add and save NATIVE paid for gas by trader 2 for depositBuyWithdraw()
                trader2Gas = receipt.cumulativeGasUsed
                trader2Price = receipt.effectiveGasPrice
                trader2GasPaid = trader2GasPaid.add(trader2Gas.mul(trader2Price))

                // save trader1 balances after orders are added
                const trader1BalBaseW2 = await ethers.provider.getBalance(trader1.address)                // wallet base token balance
                const trader1BalBaseA2 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT2 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW2 = await quoteToken.balanceOf(trader1.address)                     // wallet quote token  balance
                const trader1BalQuoteA2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances after orders are added
                const trader2BalBaseW2 = await ethers.provider.getBalance(trader2.address)                // wallet base token balance
                const trader2BalBaseA2 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT2 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW2 = await quoteToken.balanceOf(trader2.address)                     // wallet quote token  balance
                const trader2BalQuoteA2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("After Orders")
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT2, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT2, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT2, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT2, quoteDecimals)}`)
                console.log()

                // capture gas used
                const gasUsed = parseInt(receipt.gasUsed.toString())
                console.log(`Gas used: ${gasUsed}`)

                // checks for Trader 1
                expect(trader1BalBaseW2.sub(trader1BalBaseW1).add(trader1GasPaid)).to.be.equal(0)                      // the difference should be gas
                expect(trader1BalBaseT1.sub(trader1BalBaseT2)).to.be.equal(Utils.parseUnits('10', baseDecimals))       // sold 10 native at 100 each
                expect(trader1BalBaseA1.sub(trader1BalBaseA2)).to.be.equal(Utils.parseUnits('10', baseDecimals))       // sold 10 native at 100 each
                expect(trader1BalQuoteW1.sub(trader1BalQuoteW2)).to.be.equal(0)                                        // no change in quote balance in the wallet
                expect(trader1BalQuoteT2.sub(trader1BalQuoteT1)).to.be.equal(Utils.parseUnits('999', quoteDecimals))   // sold 10 native at 100 each receiving 1000 - 1 (fee)
                expect(trader1BalQuoteA2.sub(trader1BalQuoteA1)).to.be.equal(Utils.parseUnits('999', quoteDecimals))   // sold 10 native at 100 each receiving 1000 - 1 (fee)

                // checks for Trader 2
                expect(trader2BalBaseW2.sub(trader2BalBaseW1).sub(Utils.parseUnits('9.98', baseDecimals)).add(trader2GasPaid)).to.be.equal(0) // the difference should be 10 - 0.02 (fee) - gas
                expect(trader2BalBaseT1.sub(trader2BalBaseT2)).to.be.equal(0)                                           // no change in base balance in the portfolio total
                expect(trader2BalBaseA1.sub(trader2BalBaseA2)).to.be.equal(0)                                           // no change in base balance in the portfolio available
                expect(trader2BalQuoteW1.sub(trader2BalQuoteW2)).to.be.equal(Utils.parseUnits('1000', quoteDecimals))   // bought 10 native at 100 each paying 1000
                expect(trader2BalQuoteT2.sub(trader2BalQuoteT1)).to.be.equal(0)                                         // no change in quote balance in the portfolio total
                expect(trader2BalQuoteA2.sub(trader2BalQuoteA1)).to.be.equal(0)                                         // no change in quote balance in the portfolio available
            })

            it("Should fail to Deposit Token - Buy Native - Withdraw Native for a NATIVE/TOKEN pair if not fully filled", async function () {
                let tx

                let baseSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let baseSymbol = await portfolio.getNative()
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseAssetAddr = ZEROADDR

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('9', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 adds a sell order for 10 NATIVE at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 1, 1)
                await tx.wait()

                // trader 2 approves a buy order for 10 NATIVE at 100 QT
                tx = await quoteToken.connect(trader2).approve(portfolio.address, quantity2)
                await tx.wait()

                // trader 2 adds a buy order for 10 NATIVE at 100 QT - fail for orders not fully filled
                await expect(oneClick.connect(trader2).depositBuyWithdraw(tradePairId, price, quantity2, 4))
                    .to.be.revertedWith("T-FOKF-01")
            })

            it("Should fail to Deposit Token - Buy Native - Withdraw Native for a NATIVE/TOKEN pair if value is sent", async function () {
                let tx

                let baseSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let baseSymbol = await portfolio.getNative()
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseAssetAddr = ZEROADDR

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 adds a sell order for 10 NATIVE at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 1, 1)
                await tx.wait()

                // trader 2 approves a buy order for 10 NATIVE at 100 QT
                tx = await quoteToken.connect(trader2).approve(portfolio.address, quantity2)
                await tx.wait()

                // trader 2 adds a buy order for 10 NATIVE at 100 QT - trigger OC-VSNZ-01 with non-zero value
                await expect(oneClick.connect(trader2).depositBuyWithdraw(tradePairId, price, quantity2, 1, {"value": Utils.toWei("1")}))
                    .to.be.revertedWith("OC-VSNZ-01")
            })
        }

        if (testsToRun.includes(2)) {
            it("Should be able to Deposit Token - Buy Token - Withdraw Token for a TOKEN/TOKEN pair", async function () {
                let tx
                let receipt

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // save trader1 balances before orders are added
                const trader1NativeW1 = await ethers.provider.getBalance(trader1.address)                 // wallet native balance
                const trader1BalBaseW1 = await baseToken.balanceOf(trader1.address)                       // wallet base token balance
                const trader1BalBaseA1 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT1 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW1 = await quoteToken.balanceOf(trader1.address)                     // wallet quote token  balance
                const trader1BalQuoteA1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances before orders are added
                const trader2NativeW1 = await ethers.provider.getBalance(trader2.address)                 // wallet native balance
                const trader2BalBaseW1 = await baseToken.balanceOf(trader2.address)                       // wallet base token balance
                const trader2BalBaseA1 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT1 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW1 = await quoteToken.balanceOf(trader2.address)                     // wallet quote token  balance
                const trader2BalQuoteA1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("Before Orders")
                console.log(`Trader 1 AVAX\t W:\t ${Utils.formatUnits(trader1NativeW1, 18)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT1, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT1, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 AVAX\t W:\t ${Utils.formatUnits(trader2NativeW1, 18)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT1, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT1, quoteDecimals)}`)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 adds a sell order for 10 BT at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 1, 1)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 1 for addOrder()
                let trader1Gas = receipt.cumulativeGasUsed
                let trader1Price = receipt.effectiveGasPrice
                let trader1GasPaid = trader1Gas.mul(trader1Price)

                // trader 2 approves a buy order for 10 BT at 100 QT
                tx = await quoteToken.connect(trader2).approve(portfolio.address, quantity2)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 2 for approve()
                let trader2Gas = receipt.cumulativeGasUsed
                let trader2Price = receipt.effectiveGasPrice
                let trader2GasPaid = trader2Gas.mul(trader2Price)

                tx = await oneClick.connect(trader2).depositBuyWithdraw(tradePairId, price, quantity2, 4)
                receipt = await tx.wait()

                // add and save NATIVE paid for gas by trader 2 for depositBuyWithdraw()
                trader2Gas = receipt.cumulativeGasUsed
                trader2Price = receipt.effectiveGasPrice
                trader2GasPaid = trader2GasPaid.add(trader2Gas.mul(trader2Price))

                // save trader1 balances after orders are added
                const trader1NativeW2 = await ethers.provider.getBalance(trader1.address)                 // wallet native balance
                const trader1BalBaseW2 = await baseToken.balanceOf(trader1.address)                       // wallet base token balance
                const trader1BalBaseA2 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT2 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW2 = await quoteToken.balanceOf(trader1.address)                     // wallet quote token  balance
                const trader1BalQuoteA2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances after orders are added
                const trader2NativeW2 = await ethers.provider.getBalance(trader2.address)                 // wallet native balance
                const trader2BalBaseW2 = await baseToken.balanceOf(trader2.address)                       // wallet base token balance
                const trader2BalBaseA2 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT2 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW2 = await quoteToken.balanceOf(trader2.address)                     // wallet quote token  balance
                const trader2BalQuoteA2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("After Orders")
                console.log(`Trader 1 AVAX\t W:\t ${Utils.formatUnits(trader1NativeW2, 18)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT2, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT2, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 AVAX\t W:\t ${Utils.formatUnits(trader2NativeW2, 18)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT2, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT2, quoteDecimals)}`)
                console.log()

                // capture gas used
                const gasUsed = parseInt(receipt.gasUsed.toString())
                console.log(`Gas used: ${gasUsed}`)

                // checks for Trader 1
                expect(trader1NativeW1.sub(trader1NativeW2)).to.be.equal(trader1GasPaid)                               // only gas is paid from the native balance
                expect(trader1BalBaseW1.sub(trader1BalBaseW2)).to.be.equal(0)                                          // no change in quote balance in the wallet
                expect(trader1BalBaseT1.sub(trader1BalBaseT2)).to.be.equal(Utils.parseUnits('10', baseDecimals))       // sold 10 BT @ 100 QT paying 10 BT
                expect(trader1BalBaseA1.sub(trader1BalBaseA2)).to.be.equal(Utils.parseUnits('10', baseDecimals))       // sold 10 BT @ 100 QT paying 10 BT
                expect(trader1BalQuoteW1.sub(trader1BalQuoteW2)).to.be.equal(0)                                        // no change in QT in the wallet
                expect(trader1BalQuoteT2.sub(trader1BalQuoteT1)).to.be.equal(Utils.parseUnits('999', quoteDecimals))   // sold 10 BT @ 100 QT receiving (1000 - 1 fee) QT
                expect(trader1BalQuoteA2.sub(trader1BalQuoteA1)).to.be.equal(Utils.parseUnits('999', quoteDecimals))   // sold 10 BT @ 100 QT receiving (1000 - 1 fee) QT

                // checks for Trader 2
                expect(trader2NativeW1.sub(trader2NativeW2)).to.be.equal(trader2GasPaid)                                // only gas is paid from the native balance
                expect(trader2BalBaseW2.sub(trader2BalBaseW1)).to.be.equal(Utils.parseUnits('9.98', baseDecimals))      // bought 10 BT @ 100 QT receiving (10 - 0.02 fee) BT
                expect(trader2BalBaseT1.sub(trader2BalBaseT2)).to.be.equal(0)                                           // no change in BT in the portfolio total
                expect(trader2BalBaseA1.sub(trader2BalBaseA2)).to.be.equal(0)                                           // no change in BT in the portfolio available
                expect(trader2BalQuoteW1.sub(trader2BalQuoteW2)).to.be.equal(Utils.parseUnits('1000', quoteDecimals))   // bought 10 BT @ 100 QT receiving 1000 QT
                expect(trader2BalQuoteT2.sub(trader2BalQuoteT1)).to.be.equal(0)                                         // no change in QT in the portfolio total
                expect(trader2BalQuoteA2.sub(trader2BalQuoteA1)).to.be.equal(0)                                         // no change in QT in the portfolio available
            })

            it("Should fail to Deposit Token - Buy Token - Withdraw Token for a TOKEN/TOKEN pair if not fully filled", async function () {
                let tx

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('9', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 adds a sell order for 10 BT at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 1, 1)
                await tx.wait()

                // trader 2 approves a buy order for 10 BT at 100 QT
                tx = await quoteToken.connect(trader2).approve(portfolio.address, quantity2)
                await tx.wait()

                await expect(oneClick.connect(trader2).depositBuyWithdraw(tradePairId, price, quantity2, 4)).to.be.revertedWith("T-FOKF-01")
            })
        }

        if (testsToRun.includes(3)) {
            it("Should be able to Deposit Native - Buy Token - Withdraw Native for a TOKEN/NATIVE pair", async function () {
                let tx
                let receipt

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let quoteSymbol = await portfolio.getNative()
                let quoteDecimals = 18
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteAssetAddr = ZEROADDR

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // save trader1 balances before orders are added
                const trader1BalBaseW1 = await baseToken.balanceOf(trader1.address)                       // wallet base token balance
                const trader1BalBaseA1 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT1 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW1 = await ethers.provider.getBalance(trader1.address)               // wallet quote token  balance
                const trader1BalQuoteA1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances before orders are added
                const trader2BalBaseW1 = await baseToken.balanceOf(trader2.address)                       // wallet base token balance
                const trader2BalBaseA1 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT1 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW1 = await ethers.provider.getBalance(trader2.address)               // wallet quote token  balance
                const trader2BalQuoteA1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                console.log()
                console.log("Before Orders")
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT1, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT1, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT1, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT1, quoteDecimals)}`)

                // trader 1 enters a sell order for 100 BT at 10 NATIVE
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 1, 1)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 1 for addOrder()
                let trader1Gas = receipt.cumulativeGasUsed
                let trader1Price = receipt.effectiveGasPrice
                let trader1GasPaid = trader1Gas.mul(trader1Price)

                // trader 2 enters a buy order for 100 BT at 10 QT
                tx = await oneClick.connect(trader2).depositBuyWithdraw(tradePairId, price, quantity2, 4, {"value": Utils.parseUnits("1000", quoteDecimals)})
                receipt = await tx.wait()

                // add and save NATIVE paid for gas by trader 2 for depositBuyWithdraw()
                trader2Gas = receipt.cumulativeGasUsed
                trader2Price = receipt.effectiveGasPrice
                trader2GasPaid = trader2Gas.mul(trader2Price)

                // save trader1 balances after orders are added
                const trader1BalBaseW2 = await baseToken.balanceOf(trader1.address)                       // wallet base token balance
                const trader1BalBaseA2 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT2 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW2 = await ethers.provider.getBalance(trader1.address)               // wallet quote token  balance
                const trader1BalQuoteA2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances after orders are added
                const trader2BalBaseW2 = await baseToken.balanceOf(trader2.address)                       // wallet base token balance
                const trader2BalBaseA2 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT2 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW2 = await ethers.provider.getBalance(trader2.address)               // wallet quote token  balance
                const trader2BalQuoteA2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("After Orders")
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT2, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT2, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT2, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT2, quoteDecimals)}`)
                console.log()

                // capture gas used
                const gasUsed = parseInt(receipt.gasUsed.toString())
                console.log(`Gas used: ${gasUsed}`)

                // checks for Trader 1
                expect(trader1BalBaseW2.sub(trader1BalBaseW1)).to.be.equal(0)                                         // the difference should be gas
                expect(trader1BalBaseT1.sub(trader1BalBaseT2)).to.be.equal(Utils.parseUnits('10', baseDecimals))      // sold 10 BT at 100 Native each
                expect(trader1BalBaseA1.sub(trader1BalBaseA2)).to.be.equal(Utils.parseUnits('10', baseDecimals))      // sold 10 BT at 100 Native each
                expect(trader1BalQuoteW1.sub(trader1BalQuoteW2).sub(trader1GasPaid)).to.be.equal(0)                   // no change in quote balance in the wallet
                expect(trader1BalQuoteT2.sub(trader1BalQuoteT1)).to.be.equal(Utils.parseUnits('999', quoteDecimals))  // sold 10 BT at 100 Native each receiving 1000 - 1 (fee)
                expect(trader1BalQuoteA2.sub(trader1BalQuoteA1)).to.be.equal(Utils.parseUnits('999', quoteDecimals))  // sold 10 BT at 100 Native each receiving 1000 - 1 (fee)

                // checks for Trader 2
                expect(trader2BalBaseW2.sub(trader2BalBaseW1)).to.be.equal(Utils.parseUnits('9.98', baseDecimals))    // bought 10 - 0.02 (fee) BT
                expect(trader2BalBaseT1.sub(trader2BalBaseT2)).to.be.equal(0)                                         // no change in base balance in the portfolio total
                expect(trader2BalBaseA1.sub(trader2BalBaseA2)).to.be.equal(0)                                         // no change in base balance in the portfolio available
                expect(trader2BalQuoteW1.sub(trader2BalQuoteW2).sub(trader2GasPaid)).to.be.equal(Utils.parseUnits('1000', quoteDecimals)) // bought 10 BT at 100 each paying 1000 Native
                expect(trader2BalQuoteT2.sub(trader2BalQuoteT1)).to.be.equal(0)                                       // no change in quote balance in the portfolio total
                expect(trader2BalQuoteA2.sub(trader2BalQuoteA1)).to.be.equal(0)                                       // no change in quote balance in the portfolio available
            })

            it("Should fail to Deposit Native - Buy Token - Withdraw Native for a TOKEN/NATIVE pair if not fully filled", async function () {
                let tx

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let quoteSymbol = await portfolio.getNative()
                let quoteDecimals = 18
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteAssetAddr = ZEROADDR

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('9', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 enters a sell order for 100 BT at 10 NATIVE
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 1, 1)
                await tx.wait()

                // trader 2 enters a buy order for 100 BT at 10 QT
                await expect(oneClick.connect(trader2).depositBuyWithdraw(tradePairId, price, quantity2, 4, {
                        "value": Utils.parseUnits("1000", quoteDecimals)
                    })).to.be.revertedWith("T-FOKF-01")
            })

            it("Should fail to Deposit Native - Buy Token - Withdraw Native for a TOKEN/NATIVE pair if value is sent", async function () {
                let tx

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let quoteSymbol = await portfolio.getNative()
                let quoteDecimals = 18
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteAssetAddr = ZEROADDR

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 enters a sell order for 100 BT at 10 NATIVE
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 1, 1)
                await tx.wait()

                // trader 2 adds a buy order for 100 BT at 10 QT - trigger OC-VSNE-01 with non-exact value
                await expect(oneClick.connect(trader2).depositBuyWithdraw(tradePairId, price, quantity2, 1, {
                        "value": Utils.parseUnits("999", quoteDecimals)
                    })).to.be.revertedWith("OC-VSNE-01")
            })
        }
    })

    describe("Tests for Deposit - Sell - Withdraw using OneClick", function () {

        if (testsToRun.includes(4)) {
            it("Should be able to Deposit Native - Sell Native - Withdraw Token for a NATIVE/TOKEN pair", async function () {
                let tx
                let receipt

                let baseTokenStr = Utils.toUtf8(await portfolio.getNative())
                let baseSymbolStr = baseTokenStr
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseAssetAddr = ZEROADDR

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // save trader1 balances before orders are added
                const trader1BalBaseW1 = await ethers.provider.getBalance(trader1.address)                // wallet base token balance
                const trader1BalBaseA1 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT1 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW1 = await quoteToken.balanceOf(trader1.address)                     // wallet quote token  balance
                const trader1BalQuoteA1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances before orders are added
                const trader2BalBaseW1 = await ethers.provider.getBalance(trader2.address)                // wallet base token balance
                const trader2BalBaseA1 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT1 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW1 = await quoteToken.balanceOf(trader2.address)                     // wallet quote token  balance
                const trader2BalQuoteA1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                console.log()
                console.log("Before Orders")
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT1, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT1, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT1, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT1, quoteDecimals)}`)

                // trader 1 enters a buy order for 100 BT at 10 NATIVE
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 0, 1)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 1 for addOrder()
                let trader1Gas = receipt.cumulativeGasUsed
                let trader1Price = receipt.effectiveGasPrice
                let trader1GasPaid = trader1Gas.mul(trader1Price)

                // trader 2 enters a sell order for 100 BT at 10 QT
                tx = await oneClick.connect(trader2).depositSellWithdraw(tradePairId, price, quantity2, 4, {
                        "value": Utils.parseUnits("10", baseDecimals)
                    })
                receipt = await tx.wait()

                // add and save NATIVE paid for gas by trader 2 for depositBuyWithdraw()
                trader2Gas = receipt.cumulativeGasUsed
                trader2Price = receipt.effectiveGasPrice
                trader2GasPaid = trader2Gas.mul(trader2Price)

                // save trader1 balances after orders are added
                const trader1BalBaseW2 = await ethers.provider.getBalance(trader1.address)                // wallet base token balance
                const trader1BalBaseA2 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT2 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW2 = await quoteToken.balanceOf(trader1.address)                     // wallet quote token  balance
                const trader1BalQuoteA2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances after orders are added
                const trader2BalBaseW2 = await ethers.provider.getBalance(trader2.address)                // wallet base token balance
                const trader2BalBaseA2 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT2 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW2 = await quoteToken.balanceOf(trader2.address)                     // wallet quote token  balance
                const trader2BalQuoteA2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("After Orders")
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT2, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT2, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT2, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT2, quoteDecimals)}`)
                console.log()

                // capture gas used
                const gasUsed = parseInt(receipt.gasUsed.toString())
                console.log(`Gas used: ${gasUsed}`)

                // checks for Trader 1
                expect(trader1BalBaseW1.sub(trader1BalBaseW2)).to.be.equal(trader1GasPaid)                             // the difference should be gas
                expect(trader1BalBaseT2.sub(trader1BalBaseT1)).to.be.equal(Utils.parseUnits('9.99', baseDecimals))     // sold 10 BT at 100 Native each
                expect(trader1BalBaseA2.sub(trader1BalBaseA1)).to.be.equal(Utils.parseUnits('9.99', baseDecimals))     // sold 10 BT at 100 Native each
                expect(trader1BalQuoteW1.sub(trader1BalQuoteW2)).to.be.equal(0)                                        // no change in quote balance in the wallet
                expect(trader1BalQuoteT1.sub(trader1BalQuoteT2)).to.be.equal(Utils.parseUnits('1000', quoteDecimals))  // sold 10 BT at 100 Native each receiving 1000 - 1 (fee)
                expect(trader1BalQuoteA1.sub(trader1BalQuoteA2)).to.be.equal(Utils.parseUnits('1000', quoteDecimals))  // sold 10 BT at 100 Native each receiving 1000 - 1 (fee)

                // checks for Trader 2
                expect(trader2BalBaseW1.sub(trader2BalBaseW2)).to.be.equal(trader2GasPaid.add(Utils.parseUnits('10', baseDecimals)))  // bought 10 - 0.02 (fee) BT
                expect(trader2BalBaseT1.sub(trader2BalBaseT2)).to.be.equal(0)                                          // no change in base balance in the portfolio total
                expect(trader2BalBaseA1.sub(trader2BalBaseA2)).to.be.equal(0)                                          // no change in base balance in the portfolio available
                expect(trader2BalQuoteW2.sub(trader2BalQuoteW1)).to.be.equal(Utils.parseUnits('998', quoteDecimals))   // bought 10 BT at 100 each paying 1000 Native
                expect(trader2BalQuoteT2.sub(trader2BalQuoteT1)).to.be.equal(0)                                        // no change in quote balance in the portfolio total
                expect(trader2BalQuoteA2.sub(trader2BalQuoteA1)).to.be.equal(0)                                        // no change in quote balance in the portfolio available
            })

            it("Should fail to Deposit Native - Sell Native - Withdraw Token for a NATIVE/TOKEN pair if not fully filled", async function () {
                let tx

                let baseTokenStr = Utils.toUtf8(await portfolio.getNative())
                let baseSymbolStr = baseTokenStr
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseAssetAddr = ZEROADDR

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('11', baseDecimals)

                // trader 1 enters a buy order for 100 BT at 10 NATIVE
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 0, 1)

                // trader 2 enters a sell order for 100 BT at 10 QT
                await expect(oneClick.connect(trader2).depositSellWithdraw(tradePairId, price, quantity2, 4, {
                        "value": quantity2
                    })).to.be.revertedWith("T-FOKF-01")
            })

            it("Should fail to Deposit Native - Sell Native - Withdraw Token for a NATIVE/TOKEN pair if value is sent", async function () {
                let tx

                let baseTokenStr = Utils.toUtf8(await portfolio.getNative())
                let baseSymbolStr = baseTokenStr
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseAssetAddr = ZEROADDR

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 enters a buy order for 100 BT at 10 NATIVE
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 0, 1)
                receipt = await tx.wait()

                // trader 2 enters a sell order for 100 BT at 10 QT - trigger OC-VSNE-02 with non-exact value
                await expect(oneClick.connect(trader2).depositSellWithdraw(tradePairId, price, quantity2, 4, {
                        "value": Utils.parseUnits("9", baseDecimals)
                    })).to.be.revertedWith("OC-VSNE-02")
            })
        }

        if (testsToRun.includes(5)) {
            it("Should be able to Deposit Token - Sell Token - Withdraw Token for a TOKEN/TOKEN pair", async function () {
                let tx
                let receipt

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // save trader1 balances before orders are added
                const trader1NativeW1 = await ethers.provider.getBalance(trader1.address)                 // wallet native balance
                const trader1BalBaseW1 = await baseToken.balanceOf(trader1.address)                       // wallet base token balance
                const trader1BalBaseA1 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT1 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW1 = await quoteToken.balanceOf(trader1.address)                     // wallet quote token  balance
                const trader1BalQuoteA1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances before orders are added
                const trader2NativeW1 = await ethers.provider.getBalance(trader2.address)                 // wallet native balance
                const trader2BalBaseW1 = await baseToken.balanceOf(trader2.address)                       // wallet base token balance
                const trader2BalBaseA1 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT1 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW1 = await quoteToken.balanceOf(trader2.address)                     // wallet quote token  balance
                const trader2BalQuoteA1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("Before Orders")
                console.log(`Trader 1 AVAX\t W:\t ${Utils.formatUnits(trader1NativeW1, 18)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT1, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT1, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 AVAX\t W:\t ${Utils.formatUnits(trader2NativeW1, 18)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT1, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT1, quoteDecimals)}`)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 adds a buy order for 10 BT at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 0, 1)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 1 for addOrder()
                let trader1Gas = receipt.cumulativeGasUsed
                let trader1Price = receipt.effectiveGasPrice
                let trader1GasPaid = trader1Gas.mul(trader1Price)

                // trader 2 approves a sell order for 10 BT at 100 QT
                tx = await baseToken.connect(trader2).approve(portfolio.address, quantity2)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 2 for approve()
                let trader2Gas = receipt.cumulativeGasUsed
                let trader2Price = receipt.effectiveGasPrice
                let trader2GasPaid = trader2Gas.mul(trader2Price)

                tx = await oneClick.connect(trader2).depositSellWithdraw(tradePairId, price, quantity2, 4)
                receipt = await tx.wait()

                // add and save NATIVE paid for gas by trader 2 for depositBuyWithdraw()
                trader2Gas = receipt.cumulativeGasUsed
                trader2Price = receipt.effectiveGasPrice
                trader2GasPaid = trader2GasPaid.add(trader2Gas.mul(trader2Price))

                // save trader1 balances after orders are added
                const trader1NativeW2 = await ethers.provider.getBalance(trader1.address)                 // wallet native balance
                const trader1BalBaseW2 = await baseToken.balanceOf(trader1.address)                       // wallet base token balance
                const trader1BalBaseA2 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT2 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW2 = await quoteToken.balanceOf(trader1.address)                     // wallet quote token  balance
                const trader1BalQuoteA2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances after orders are added
                const trader2NativeW2 = await ethers.provider.getBalance(trader2.address)                 // wallet native balance
                const trader2BalBaseW2 = await baseToken.balanceOf(trader2.address)                       // wallet base token balance
                const trader2BalBaseA2 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT2 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW2 = await quoteToken.balanceOf(trader2.address)                     // wallet quote token  balance
                const trader2BalQuoteA2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("After Orders")
                console.log(`Trader 1 AVAX\t W:\t ${Utils.formatUnits(trader1NativeW2, 18)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT2, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT2, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 AVAX\t W:\t ${Utils.formatUnits(trader2NativeW2, 18)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT2, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT2, quoteDecimals)}`)
                console.log()

                // capture gas used
                const gasUsed = parseInt(receipt.gasUsed.toString())
                console.log(`Gas used: ${gasUsed}`)

                // checks for Trader 1
                expect(trader1NativeW1.sub(trader1NativeW2)).to.be.equal(trader1GasPaid)                                // only gas is paid from the native balance
                expect(trader1BalBaseW1.sub(trader1BalBaseW2)).to.be.equal(0)                                           // no change in quote balance in the wallet
                expect(trader1BalBaseT2.sub(trader1BalBaseT1)).to.be.equal(Utils.parseUnits('9.99', baseDecimals))      // bought 10 BT @ 100 QT receiving (10 - 0.01 fee) BT
                expect(trader1BalBaseA2.sub(trader1BalBaseA1)).to.be.equal(Utils.parseUnits('9.99', baseDecimals))      // bought 10 BT @ 100 QT receiving (10 - 0.01 fee) BT
                expect(trader1BalQuoteW1.sub(trader1BalQuoteW2)).to.be.equal(0)                                         // no change in QT in the wallet
                expect(trader1BalQuoteT1.sub(trader1BalQuoteT2)).to.be.equal(Utils.parseUnits('1000', quoteDecimals))   // bought 10 BT @ 100 QT paying 1000 QT
                expect(trader1BalQuoteA1.sub(trader1BalQuoteA2)).to.be.equal(Utils.parseUnits('1000', quoteDecimals))   // bought 10 BT @ 100 QT paying 1000 QT

                // checks for Trader 2
                expect(trader2NativeW1.sub(trader2NativeW2)).to.be.equal(trader2GasPaid)                                // only gas is paid from the native balance
                expect(trader2BalBaseW1.sub(trader2BalBaseW2)).to.be.equal(Utils.parseUnits('10', baseDecimals))        // sold 10 BT @ 100 QT
                expect(trader2BalBaseT2.sub(trader2BalBaseT1)).to.be.equal(0)                                           // no change in BT in the portfolio total
                expect(trader2BalBaseA2.sub(trader2BalBaseA1)).to.be.equal(0)                                           // no change in BT in the portfolio available
                expect(trader2BalQuoteW2.sub(trader2BalQuoteW1)).to.be.equal(Utils.parseUnits('998', quoteDecimals))    // sold 10 BT @ 100 QT receiving 998 QT
                expect(trader2BalQuoteT2.sub(trader2BalQuoteT1)).to.be.equal(0)                                         // no change in QT in the portfolio total
                expect(trader2BalQuoteA2.sub(trader2BalQuoteA1)).to.be.equal(0)                                         // no change in QT in the portfolio available
            })

            it("Should fail to Deposit Token - Sell Token - Withdraw Token for a TOKEN/TOKEN pair if not fully filled", async function () {
                let tx

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteTokenStr = "Quote Token"
                let quoteSymbolStr = "QT"
                let quoteSymbol = Utils.fromUtf8(quoteSymbolStr)
                let quoteDecimals = 6
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteToken = await MockToken.deploy(quoteTokenStr, quoteSymbolStr, quoteDecimals)
                quoteAssetAddr = quoteToken.address

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))
                await quoteToken.mint(trader1.address, Utils.parseUnits('10000', quoteDecimals))
                await quoteToken.mint(trader2.address, Utils.parseUnits('10000', quoteDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))
                await quoteToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', quoteDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, quoteSymbol, Utils.parseUnits('5000', quoteDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('11', baseDecimals)

                // trader 1 adds a buy order for 10 BT at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 0, 1)
                await tx.wait()

                // trader 2 approves a sell order for 11 BT at 100 QT
                tx = await baseToken.connect(trader2).approve(portfolio.address, quantity2)
                await tx.wait()

                await expect(oneClick.connect(trader2).depositSellWithdraw(tradePairId, price, quantity2, 4))
                    .to.be.revertedWith("T-FOKF-01")
            })
        }

        if (testsToRun.includes(6)) {
            it("Should be able to Deposit Token - Sell Token - Withdraw Native for a NATIVE/TOKEN pair", async function () {
                let tx
                let receipt

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let quoteSymbol = await portfolio.getNative()
                let quoteDecimals = 18
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteAssetAddr = ZEROADDR

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // save trader1 balances before orders are added
                const trader1BalBaseW1 = await baseToken.balanceOf(trader1.address)                       // wallet base token balance
                const trader1BalBaseA1 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT1 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW1 = await ethers.provider.getBalance(trader1.address)               // wallet quote token  balance
                const trader1BalQuoteA1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT1 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances before orders are added
                const trader2BalBaseW1 = await baseToken.balanceOf(trader2.address)                       // wallet base token balance
                const trader2BalBaseA1 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT1 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW1 = await ethers.provider.getBalance(trader2.address)               // wallet quote token  balance
                const trader2BalQuoteA1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT1 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("Before Orders")
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA1, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT1, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT1, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA1, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT1, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA1, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT1, quoteDecimals)}`)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 adds a buy order for 10 NATIVE at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 0, 1)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 1 for addOrder()
                let trader1Gas = receipt.cumulativeGasUsed
                let trader1Price = receipt.effectiveGasPrice
                let trader1GasPaid = trader1Gas.mul(trader1Price)

                // trader 2 approves a sell order for 10 NATIVE at 100 QT
                tx = await baseToken.connect(trader2).approve(portfolio.address, quantity2)
                receipt = await tx.wait()

                // save NATIVE paid for gas by trader 2 for approve()
                let trader2Gas = receipt.cumulativeGasUsed
                let trader2Price = receipt.effectiveGasPrice
                let trader2GasPaid = trader2Gas.mul(trader2Price)

                // trader 2 adds a sell order for 10 NATIVE at 100 QT
                tx = await oneClick.connect(trader2).depositSellWithdraw(tradePairId, price, quantity2, 4)
                receipt = await tx.wait()

                // add and save NATIVE paid for gas by trader 2 for depositSellWithdraw()
                trader2Gas = receipt.cumulativeGasUsed
                trader2Price = receipt.effectiveGasPrice
                trader2GasPaid = trader2GasPaid.add(trader2Gas.mul(trader2Price))

                // save trader1 balances after orders are added
                const trader1BalBaseW2 = await baseToken.balanceOf(trader1.address)                      // wallet base token balance
                const trader1BalBaseA2 = (await portfolio.getBalance(trader1.address, baseSymbol))[0]     // portfolio base token available balance
                const trader1BalBaseT2 = (await portfolio.getBalance(trader1.address, baseSymbol))[1]     // portfolio base token total balance
                const trader1BalQuoteW2 = await ethers.provider.getBalance(trader1.address)               // wallet quote token  balance
                const trader1BalQuoteA2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader1BalQuoteT2 = (await portfolio.getBalance(trader1.address, quoteSymbol))[1]   // portfolio quote token total balance

                // save trader2 balances after orders are added
                const trader2BalBaseW2 = await baseToken.balanceOf(trader2.address)                      // wallet base token balance
                const trader2BalBaseA2 = (await portfolio.getBalance(trader2.address, baseSymbol))[0]     // portfolio base token available balance
                const trader2BalBaseT2 = (await portfolio.getBalance(trader2.address, baseSymbol))[1]     // portfolio base token total balance
                const trader2BalQuoteW2 = await ethers.provider.getBalance(trader2.address)               // wallet quote token  balance
                const trader2BalQuoteA2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[0]   // portfolio quote token available balance
                const trader2BalQuoteT2 = (await portfolio.getBalance(trader2.address, quoteSymbol))[1]   // portfolio quote token total balance

                console.log()
                console.log("After Orders")
                console.log(`Trader 1 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalBaseW2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalBaseA2, baseDecimals)}`)
                console.log(`Trader 1 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalBaseT2, baseDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader1BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader1BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 1 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader1BalQuoteT2, quoteDecimals)}`)
                console.log('----------')
                console.log(`Trader 2 ${baseSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalBaseW2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalBaseA2, baseDecimals)}`)
                console.log(`Trader 2 ${baseSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalBaseT2, baseDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t W:\t ${Utils.formatUnits(trader2BalQuoteW2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t T:\t ${Utils.formatUnits(trader2BalQuoteA2, quoteDecimals)}`)
                console.log(`Trader 2 ${quoteSymbolStr}\t A:\t ${Utils.formatUnits(trader2BalQuoteT2, quoteDecimals)}`)
                console.log()

                // capture gas used
                const gasUsed = parseInt(receipt.gasUsed.toString())
                console.log(`Gas used: ${gasUsed}`)

                // checks for Trader 1
                expect(trader1BalBaseW2.sub(trader1BalBaseW1)).to.be.equal(0)                                             // no change in base balance in the wallet
                expect(trader1BalBaseT2.sub(trader1BalBaseT1)).to.be.equal(Utils.parseUnits('9.99', baseDecimals))        // bought 10 BT at 100 AVAX each receiving (10 - 0.01 fee) BT
                expect(trader1BalBaseA2.sub(trader1BalBaseA1)).to.be.equal(Utils.parseUnits('9.99', baseDecimals))        // bought 10 BT at 100 AVAX each receiving (10 - 0.01 fee) BT
                expect(trader1BalQuoteW1.sub(trader1BalQuoteW2)).to.be.equal(trader1GasPaid)                              // no change in quote balance in the wallet
                expect(trader1BalQuoteT1.sub(trader1BalQuoteT2)).to.be.equal(Utils.parseUnits('1000', quoteDecimals))     // bought 10 BT at 100 AVAX each paying 1000 AVAX
                expect(trader1BalQuoteA1.sub(trader1BalQuoteA2)).to.be.equal(Utils.parseUnits('1000', quoteDecimals))     // bought 10 BT at 100 AVAX each paying 1000 AVAX

                // checks for Trader 2
                expect(trader2BalBaseW1.sub(trader2BalBaseW2)).to.be.equal(Utils.parseUnits('10', baseDecimals))          // sold 10 BT at 100 AVAX each
                expect(trader2BalBaseT1.sub(trader2BalBaseT2)).to.be.equal(0)                                             // no change in base balance in the portfolio total
                expect(trader2BalBaseA1.sub(trader2BalBaseA2)).to.be.equal(0)                                             // no change in base balance in the portfolio available
                expect(trader2BalQuoteW2.sub(trader2BalQuoteW1)).to.be.equal((Utils.parseUnits('998', quoteDecimals)).sub(trader2GasPaid))  // sold 10 BT at 100 AVAX each receiving (1000 - 2 fee) AVAX
                expect(trader2BalQuoteT2.sub(trader2BalQuoteT1)).to.be.equal(0)                                           // no change in quote balance in the portfolio total
                expect(trader2BalQuoteA2.sub(trader2BalQuoteA1)).to.be.equal(0)                                           // no change in quote balance in the portfolio available
            })

            it("Should fail to Deposit Token - Sell Token - Withdraw Native for a NATIVE/TOKEN pair if not fully filled", async function () {
                let tx

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let quoteSymbol = await portfolio.getNative()
                let quoteDecimals = 18
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteAssetAddr = ZEROADDR

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('11', baseDecimals)

                // trader 1 adds a buy order for 10 NATIVE at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 0, 1)
                await tx.wait()

                // trader 2 approves a sell order for 11 NATIVE at 100 QT
                tx = await baseToken.connect(trader2).approve(portfolio.address, quantity2)
                await tx.wait()

                // trader 2 adds a sell order for 11 NATIVE at 100 QT
                await expect(oneClick.connect(trader2).depositSellWithdraw(tradePairId, price, quantity2, 4))
                    .to.be.revertedWith("T-FOKF-01")
            })

            it("Should fail to Deposit Token - Sell Token - Withdraw Native for a NATIVE/TOKEN pair if value is sent", async function () {
                let tx

                let baseTokenStr = "Base Token"
                let baseSymbolStr = "BT"
                let baseSymbol = Utils.fromUtf8(baseSymbolStr)
                let baseDecimals = 18
                let baseDisplayDecimals = 3

                let quoteSymbolStr = Utils.toUtf8(await portfolio.getNative())
                let quoteSymbol = await portfolio.getNative()
                let quoteDecimals = 18
                let quoteDisplayDecimals = 3

                let tradePairStr = `${baseSymbolStr}/${quoteSymbolStr}`
                let tradePairId = Utils.fromUtf8(tradePairStr)

                let minTradeAmount = 10
                let maxTradeAmount = 100000
                let mode = 0  // auction off

                // address of base asset, zero address for native
                baseToken = await MockToken.deploy(baseTokenStr, baseSymbolStr, baseDecimals)
                baseAssetAddr = baseToken.address

                // address of quote asset, zero address for native
                quoteAssetAddr = ZEROADDR

                // mint tokens for trader1 and trader2
                await baseToken.mint(trader1.address, Utils.parseUnits('10000', baseDecimals))
                await baseToken.mint(trader2.address, Utils.parseUnits('10000', baseDecimals))

                // add tokens to portfolio
                await portfolio.addToken(baseSymbol, baseAssetAddr, mode)
                await portfolio.addToken(quoteSymbol, quoteAssetAddr, mode)

                // deposit some native to portfolio for trader1 and trader2
                await trader1.sendTransaction({from: trader1.address, to: portfolio.address, value: Utils.toWei('5000')})

                // deposit some tokens to portfolio for trader1 and trader2
                await baseToken.connect(trader1).approve(portfolio.address, Utils.parseUnits('5000', baseDecimals))
                await portfolio.connect(trader1).depositToken(trader1.address, baseSymbol, Utils.parseUnits('5000', baseDecimals))

                // add trade pair
                await exchange.connect(admin).addTradePair(tradePairId,
                    baseAssetAddr, baseDisplayDecimals, quoteAssetAddr, quoteDisplayDecimals,
                    Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
                    Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode)

                // price and quantity for the matching trade
                const price = Utils.parseUnits('100', quoteDecimals)
                const quantity1 = Utils.parseUnits('10', baseDecimals)
                const quantity2 = Utils.parseUnits('10', baseDecimals)

                // trader 1 adds a buy order for 10 NATIVE at 100 QT
                tx = await tradePairs.connect(trader1).addOrder(tradePairId, price, quantity1, 0, 1)
                receipt = await tx.wait()

                // trader 2 approves a sell order for 10 NATIVE at 100 QT
                tx = await baseToken.connect(trader2).approve(portfolio.address, quantity2)
                receipt = await tx.wait()

                // trader 2 enters a sell order for 10 NATIVE at 100 QT - trigger OC-VSNZ-02 with non-zero value
                await expect(oneClick.connect(trader2).depositSellWithdraw(tradePairId, price, quantity2, 1, {
                        "value": Utils.parseUnits("1", baseDecimals)
                    })).to.be.revertedWith("OC-VSNZ-02")
            })
        }
    })

})
