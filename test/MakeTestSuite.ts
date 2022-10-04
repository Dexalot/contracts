import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { PromiseOrValue } from "../typechain-types/common";

import type {
    DexalotToken,
    OrderBooks,
    PortfolioBridge,
    PortfolioMain,
    PortfolioSub,
    TradePairs,
    MockToken,
    PortfolioMinterMock,
    GasStation,
    LZEndpointMock,
    ExchangeSub,
    OrderBooks__factory,
    PortfolioMain__factory,
    PortfolioSub__factory,
    PortfolioBridge__factory,
    PortfolioBridgeSub__factory,
    TradePairs__factory,
    PortfolioMinterMock__factory,
    GasStation__factory,
    ExchangeSub__factory,
    ExchangeMain,
    ExchangeMain__factory,
    Staking,
    Staking__factory,
    TokenVestingCloneFactory,
    TokenVestingCloneFactory__factory,
    PortfolioBridgeSub,
    PortfolioMinter,
    PortfolioMinter__factory,
} from '../typechain-types'

import { NativeMinterMock } from "../typechain-types/contracts/mocks";

import { NativeMinterMock__factory } from "../typechain-types/factories/contracts/mocks";

import { ethers, upgrades } from "hardhat";

interface Signers {
    owner: SignerWithAddress,
    admin: SignerWithAddress,
    auctionAdmin: SignerWithAddress,
    trader1: SignerWithAddress,
    trader2: SignerWithAddress,
    foundationSafe: SignerWithAddress,
    other1: SignerWithAddress,
    other2: SignerWithAddress
}

interface PortfolioContracts {
    portfolioMain: PortfolioMain,
    portfolioSub: PortfolioSub,
    gasStation: GasStation,
    portfolioMinter: PortfolioMinterMock,
    portfolioBridgeMain: PortfolioBridge,
    portfolioBridgeSub: PortfolioBridgeSub,
    lzEndpointMain: LZEndpointMock,
}

/*
    Dexalot global test deployments
    Please load this fixtures when necessary
    You should call fixtures in the same order as the test suite
*/

export const getAccounts = async (): Promise<Signers> => {
    const [owner, admin, auctionAdmin, trader1, trader2, foundationSafe, other1, other2] = await ethers.getSigners();
    return {owner, admin, auctionAdmin, trader1, trader2, foundationSafe, other1, other2}
}

export const deployDexalotToken = async (): Promise<DexalotToken> => {
    const DexalotToken = await ethers.getContractFactory("DexalotToken");
    const token: DexalotToken = await DexalotToken.deploy();
    return token;
}

export const deployMockToken = async (tokenStr: PromiseOrValue<string>, tokenDecimals: number): Promise<MockToken> => {
    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken: MockToken = await MockToken.deploy("Mock " + tokenStr + " Token", tokenStr, tokenDecimals);

    return mockToken;
}

export const deployLZEndpoint = async (sourceChainID: number): Promise<LZEndpointMock> => {
    const LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
    const lzEndpointMock: LZEndpointMock = await LZEndpointMock.deploy(
        sourceChainID
    );
    return lzEndpointMock;
}

export const deployOrderBooks = async (): Promise<OrderBooks> => {
    const OrderBooks = await ethers.getContractFactory("OrderBooks") as OrderBooks__factory;
    const orderBook: OrderBooks = await upgrades.deployProxy(OrderBooks) as OrderBooks
    return orderBook;
}


export const deployPortfolioMain = async (native: string,): Promise<PortfolioMain> => { // FIXME not complete !!!
    const srcChainId = 1;

    const PortfolioMain = await ethers.getContractFactory("PortfolioMain") as PortfolioMain__factory;
    const portfolioMain: PortfolioMain = await upgrades.deployProxy(PortfolioMain, [Utils.fromUtf8(native), srcChainId]) as PortfolioMain;

    return portfolioMain;
}

export const deployPortfolioSub = async (native: string): Promise<PortfolioSub> => { // FIXME not complete !!!
    const {foundationSafe} = await getAccounts();
    const srcChainId = 1;

    const PortfolioSub = await ethers.getContractFactory("PortfolioSub") as PortfolioSub__factory;
    const portfolioSub: PortfolioSub = await upgrades.deployProxy(PortfolioSub, [Utils.fromUtf8(native), srcChainId]) as PortfolioSub;
    await portfolioSub.setFeeAddress(foundationSafe.address);

    return portfolioSub;
}

export const addToken = async (portfolio: PortfolioMain | PortfolioSub, token: MockToken, bridgeSwapAmount: number, srcChainId=1): Promise<void> => {

    const auctionMode: any = 0;

    await portfolio.addToken(Utils.fromUtf8(await token.symbol()), token.address, srcChainId, await token.decimals(), auctionMode);
    if (bridgeSwapAmount > 0) {
        await (portfolio as PortfolioSub).setBridgeSwapAmount(Utils.fromUtf8(await token.symbol()), Utils.parseUnits(bridgeSwapAmount.toString(), await token.decimals()));
    }
}

export const deployPortfolioBridge = async (remoteLZEndpoint: LZEndpointMock, portfolio: PortfolioMain | PortfolioSub, srcChainId=1): Promise<PortfolioBridge | PortfolioBridgeSub> => {
    const {admin} = await getAccounts();

    let PortfolioBridge: PortfolioBridge__factory;
    let portfolioBridge;

    if(await portfolio.native() === Utils.fromUtf8('ALOT')) {
        PortfolioBridge = await ethers.getContractFactory("PortfolioBridgeSub") as PortfolioBridgeSub__factory;
        portfolioBridge = await upgrades.deployProxy(
            PortfolioBridge, [remoteLZEndpoint.address]) as PortfolioBridgeSub;

    } else {
        PortfolioBridge = await ethers.getContractFactory("PortfolioBridge") as PortfolioBridge__factory;
        portfolioBridge = await upgrades.deployProxy(
            PortfolioBridge, [remoteLZEndpoint.address]) as PortfolioBridge;
    }

    await portfolioBridge.setDefaultTargetChain(srcChainId);
    await portfolioBridge.setPortfolio(portfolio.address)

    await admin.sendTransaction({
        to: portfolioBridge.address,
        value: ethers.utils.parseEther("100"),
    });

    await portfolio.setPortfolioBridge(portfolioBridge.address);

    return portfolioBridge;
}

export const setRemoteBridges = async (
    bridgeOne: PortfolioBridge, chainIDOne: number,
    bridgeTwo: PortfolioBridge, chainIDTwo: number,
    lzOne: LZEndpointMock, lzTwo: LZEndpointMock) => {
    await bridgeOne.setLZTrustedRemote(
        chainIDTwo,
        bridgeTwo.address
    )
    await lzOne.setDestLzEndpoint(
        bridgeTwo.address,
        lzTwo.address
    )

    await bridgeTwo.setLZTrustedRemote(
        chainIDOne,
        bridgeOne.address
    )
    await lzTwo.setDestLzEndpoint(
        bridgeOne.address,
        lzOne.address
    )
}

export const deployTradePairs = async (orderBooks: OrderBooks, portfolio: PortfolioSub, exchange: ExchangeSub): Promise<TradePairs> => {
    const TradePairs = await ethers.getContractFactory("TradePairs") as TradePairs__factory;
    const tradePairs: TradePairs = await upgrades.deployProxy(TradePairs, [orderBooks.address, portfolio.address]) as TradePairs;
    await tradePairs.grantRole(await tradePairs.DEFAULT_ADMIN_ROLE(), exchange.address);
    await portfolio.grantRole(await portfolio.EXECUTOR_ROLE(), tradePairs.address);

    await exchange.setTradePairs(tradePairs.address);
    await orderBooks.setTradePairs(tradePairs.address);

    return tradePairs;
}

export const deployPortfolioMinterMock = async (portfolio: PortfolioSub, nativeMinterAddress: string): Promise<PortfolioMinterMock> => {
    const {admin} = await getAccounts();

    const PortfolioMinterMock = await ethers.getContractFactory("PortfolioMinterMock") as PortfolioMinterMock__factory;
    const portfolioMinterMock: PortfolioMinterMock = await upgrades.deployProxy(PortfolioMinterMock, [portfolio.address, nativeMinterAddress]) as PortfolioMinterMock;

    await portfolio.setPortfolioMinter(portfolioMinterMock.address);

    await admin.sendTransaction({
        to: portfolioMinterMock.address,
        value: ethers.utils.parseEther("100"), // Sends exactly 100 ALOT
    });

    return portfolioMinterMock;
}

export const deployPortfolioMinterReal = async (portfolio: PortfolioSub): Promise<PortfolioMinter> => {
    const {admin} = await getAccounts();

    const PortfolioMinter = await ethers.getContractFactory("PortfolioMinter") as PortfolioMinter__factory;
    const NativeMinterMock = await ethers.getContractFactory("NativeMinterMock") as NativeMinterMock__factory;
    const nativeMinterMock: NativeMinterMock = await NativeMinterMock.deploy() as NativeMinterMock;
    const portfolioMinter: PortfolioMinterMock = await upgrades.deployProxy(PortfolioMinter, [portfolio.address, nativeMinterMock.address]) as PortfolioMinterMock;

    await portfolio.setPortfolioMinter(portfolioMinter.address);

    await admin.sendTransaction({
        to: nativeMinterMock.address,
        value: ethers.utils.parseEther("100"), // Sends exactly 100 ALOT
    });

    return portfolioMinter;
}

export const deployGasStation = async (portfolio: PortfolioSub): Promise<GasStation> => {
    const {admin, foundationSafe} = await getAccounts();

    const GasStation = await ethers.getContractFactory("GasStation") as GasStation__factory;
    const gasStation: GasStation = await upgrades.deployProxy(GasStation, [portfolio.address, ethers.utils.parseEther("0.1")]) as GasStation;

    await portfolio.setGasStation(gasStation.address);

    await portfolio.setTreasury(foundationSafe.address);

    await admin.sendTransaction({
        to: gasStation.address,
        value: ethers.utils.parseEther("100"), // Sends exactly 100 ALOT
    });

    return gasStation;
}

export const deployExchangeSub = async (portfolio: PortfolioSub, orderBooks: OrderBooks): Promise<ExchangeSub> => {
    const {admin, foundationSafe} = await getAccounts();

    const ExchangeSub = await ethers.getContractFactory("ExchangeSub") as ExchangeSub__factory;
    const exchangeSub: ExchangeSub = await upgrades.deployProxy(ExchangeSub) as ExchangeSub;

    await portfolio.grantRole(await portfolio.DEFAULT_ADMIN_ROLE(), exchangeSub.address);

    await exchangeSub.setPortfolio(portfolio.address);

    exchangeSub.addAdmin(admin.address);
    exchangeSub.addAdmin(foundationSafe.address);

    await exchangeSub.addAuctionAdmin(foundationSafe.address);

    await exchangeSub.setPortfolio(portfolio.address);
    await exchangeSub.setOrderBooks(orderBooks.address);

    return exchangeSub;
}

export const deployExchangeMain = async (portfolio: PortfolioMain): Promise<ExchangeMain> => {
    const {admin, foundationSafe} = await getAccounts();

    const ExchangeMain = await ethers.getContractFactory("ExchangeMain") as ExchangeMain__factory;
    const exchangeMain: ExchangeMain = await upgrades.deployProxy(ExchangeMain) as ExchangeMain;

    await exchangeMain.setPortfolio(portfolio.address);
    await portfolio.grantRole(await portfolio.DEFAULT_ADMIN_ROLE(), exchangeMain.address);

    await exchangeMain.addAdmin(admin.address);
    await exchangeMain.addAdmin(foundationSafe.address);

    await exchangeMain.addAuctionAdmin(foundationSafe.address);

    return exchangeMain;
}

export const deployStaking = async (stakingToken: string, rewardToken: string, rewardRate: number, duration: number): Promise<Staking> => {
    const Staking = await ethers.getContractFactory("Staking") as Staking__factory;
    const staking: Staking = await upgrades.deployProxy(Staking, [stakingToken, rewardToken, rewardRate, duration]) as Staking;

    return staking;
}

export const deployTokenVestingCloneFactory = async (): Promise<TokenVestingCloneFactory> => {
    const TokenVestingCloneFactory = await ethers.getContractFactory("TokenVestingCloneFactory") as TokenVestingCloneFactory__factory;
    const tokenVestingCloneFactory: TokenVestingCloneFactory = await TokenVestingCloneFactory.deploy() as TokenVestingCloneFactory;

    return tokenVestingCloneFactory;
}

export const deployCompletePortfolio = async (addAlot=true): Promise<PortfolioContracts> => {
    const srcChainId = 1;
    const tokenDecimals = 18;
    const auctionMode: any = 0;

    const portfolioMain = await deployPortfolioMain("AVAX");
    const portfolioSub = await deployPortfolioSub("ALOT");

    const lzEndpointMain: LZEndpointMock = await deployLZEndpoint(1);
    //const lzEndpointSub: LZEndpointMock = await deployLZEndpoint(2);
    //using same endpoint for testing
    const portfolioBridgeMain = await deployPortfolioBridge(lzEndpointMain, portfolioMain) as PortfolioBridge;
    const portfolioBridgeSub = await deployPortfolioBridge(lzEndpointMain, portfolioSub, srcChainId) as PortfolioBridgeSub;

    await setRemoteBridges(portfolioBridgeMain, 1, portfolioBridgeSub, 1, lzEndpointMain, lzEndpointMain);
    await portfolioSub.addToken(Utils.fromUtf8("AVAX"), "0x0000000000000000000000000000000000000000", srcChainId, tokenDecimals, auctionMode);

    if (addAlot) { //Technically we should add alot with an address to portfolioMain & portfolioSub for completeness
        await portfolioSub.addToken(Utils.fromUtf8("ALOT"), "0x0000000000000000000000000000000000000000", srcChainId, tokenDecimals, auctionMode);
    }

    const gasStation = await deployGasStation(portfolioSub);
    const portfolioMinter = await deployPortfolioMinterMock(portfolioSub, "0x0000000000000000000000000000000000000000");

    return {
        portfolioMain,
        portfolioSub,
        gasStation,
        portfolioMinter,
        portfolioBridgeMain,
        portfolioBridgeSub,
        lzEndpointMain,
    }
}

export const addBaseAndQuoteTokens = async (portfolioMain: PortfolioMain, portfolioSub: PortfolioSub, baseSymbol: string, baseAddr: string, baseDecimals: number, quoteSymbol: string, quoteAddr: string, quoteDecimals:number,  mode: number): Promise<void> => {
    const srcChainId = 1;
    const auctionMode: any = mode;

    // add token to portfolio subnet - don't add if it is the native ALOT or AVAX on subnet as they are already added
    if (baseSymbol != Utils.fromUtf8("ALOT") && baseSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding base to Sub" , baseSymbol);
        await portfolioSub.addToken(baseSymbol, baseAddr, srcChainId, baseDecimals, auctionMode);
    }
    if (quoteSymbol != Utils.fromUtf8("ALOT") && quoteSymbol != Utils.fromUtf8("AVAX")){
        //console.log ("Adding quote to Sub" , quoteSymbol);
        await portfolioSub.addToken(quoteSymbol, quoteAddr, srcChainId, quoteDecimals, auctionMode);
    }

    // add token to portfolio mainnet - don't add if it is the native AVAX on mainnet as they are already added
    if (baseSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding base to Main" , baseSymbol);
        await portfolioMain.addToken(baseSymbol, baseAddr, srcChainId, baseDecimals, auctionMode);
    }
    if (quoteSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding quote to Main" , quoteSymbol);
        await portfolioMain.addToken(quoteSymbol, quoteAddr, srcChainId, quoteDecimals, auctionMode);
    }

}

export const addTradePair = async (tradePairs: TradePairs, pair: any, pairSettings: any) => {
    const { owner } = await getAccounts()
    const { baseSymbol, baseDecimals, baseDisplayDecimals, quoteSymbol, quoteDisplayDecimals, quoteDecimals, tradePairId } = pair
    const { minTradeAmount, maxTradeAmount, mode } = pairSettings
    await tradePairs.connect(owner).addTradePair(tradePairId, baseSymbol, baseDecimals, baseDisplayDecimals,
        quoteSymbol, quoteDecimals, quoteDisplayDecimals,
        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);
}

export const depositNative = async (portfolio: PortfolioMain, from:SignerWithAddress, amount: string): Promise<any> => {
    return await from.sendTransaction({from: from.address, to: portfolio.address, value: Utils.toWei(amount)});

}

export const depositNativeWithContractCall = async (portfolio: PortfolioMain, from:SignerWithAddress, amount: string, bridgeProvider =0): Promise<any> => {
    //return await from.sendTransaction({from: from.address, to: portfolio.address, value: Utils.toWei(amount)});
    return await portfolio.connect(from).depositNative (from.address, bridgeProvider, { value: Utils.parseUnits(amount, 18)});
}


export const depositToken = async (portfolio: PortfolioMain, from:SignerWithAddress, token: MockToken, tokenDecimals: number, tokenSymbol: string, amount: string, bridgeProvider =0): Promise<any> => {
    await token.connect(from).approve(portfolio.address, Utils.parseUnits(amount, tokenDecimals), {
        gasPrice: ethers.utils.parseUnits("8", "gwei"),
    });

    return await portfolio.connect(from).depositToken(from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider, {
        gasPrice: ethers.utils.parseUnits("8", "gwei"),
    });
}

export const withdrawToken = async (portfolio: PortfolioSub, from:SignerWithAddress, tokenSymbol: string, tokenDecimals: number, amount: string, bridgeProvider =0): Promise<any> => {
    return await portfolio.connect(from).withdrawToken(from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider);
}

export const setBridgeSubSettings = async (portfolioBridge: PortfolioBridgeSub, settings: any) => {
    const {
        delayPeriod,
        epochLength,
        token,
        epochVolumeCap,
        delayThreshold
    } = settings;
    await portfolioBridge.setDelayPeriod(delayPeriod);
    await portfolioBridge.setEpochLength(epochLength);
    await portfolioBridge.setEpochVolumeCaps(
        [token],
        [epochVolumeCap]
    )
    await portfolioBridge.setDelayThresholds(
        [token],
        [delayThreshold]
    );
}

export const latestTime = async (): Promise<number> => {
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    const currentBlock = await ethers.provider.getBlock(currentBlockNumber);
    return currentBlock.timestamp;
}
