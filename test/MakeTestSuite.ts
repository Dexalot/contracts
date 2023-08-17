import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { PromiseOrValue } from "../typechain-types/common";

import {
    DexalotToken,
    OrderBooks,
    PortfolioBridge,
    PortfolioMain,
    PortfolioSub,
    TradePairs,
    MockToken,
    BannedAccounts,
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
    MainnetRFQ,
} from '../typechain-types'

import { NativeMinterMock } from "../typechain-types/contracts/mocks";

import { NativeMinterMock__factory } from "../typechain-types/factories/contracts/mocks";

import { ethers, upgrades } from "hardhat";
import { Wallet } from 'ethers';
import { string } from 'hardhat/internal/core/params/argumentTypes';

interface Signers {
    owner: SignerWithAddress,
    admin: SignerWithAddress,
    auctionAdmin: SignerWithAddress,
    trader1: SignerWithAddress,
    trader2: SignerWithAddress,
    treasurySafe: SignerWithAddress,
    feeSafe: SignerWithAddress,
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
    const [owner, admin, auctionAdmin, trader1, trader2, treasurySafe, feeSafe, other1, other2] = await ethers.getSigners();
    return {owner, admin, auctionAdmin, trader1, trader2, treasurySafe, feeSafe, other1, other2}
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

export const deployBannedAccounts = async (): Promise<BannedAccounts> => {
    const { admin } = await getAccounts();
    const BannedAccounts = await ethers.getContractFactory("BannedAccounts");
    const bannedAccounts: BannedAccounts = await upgrades.deployProxy(BannedAccounts, [admin.address]) as BannedAccounts;

    return bannedAccounts;
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
    const bannedAccounts: BannedAccounts = await deployBannedAccounts();
    await portfolioMain.setBannedAccounts(bannedAccounts.address);

    return portfolioMain;
}

export const deployPortfolioSub = async (native: string): Promise<PortfolioSub> => { // FIXME not complete !!!
    const {feeSafe} = await getAccounts();
    const srcChainId = 1;

    const PortfolioSub = await ethers.getContractFactory("PortfolioSub") as PortfolioSub__factory;
    const portfolioSub: PortfolioSub = await upgrades.deployProxy(PortfolioSub, [Utils.fromUtf8(native), srcChainId]) as PortfolioSub;
    await portfolioSub.setFeeAddress(feeSafe.address);

    return portfolioSub;
}

export const addToken = async (portfolio: PortfolioMain | PortfolioSub, token: MockToken, gasSwapRatio: number, auctionMode = 0, usedForGasSwap=false): Promise<void> => {
    const srcChainId=1;
    const tokenDecimals = await token.decimals();
    const bridgeFee = '0'
    await portfolio.addToken(Utils.fromUtf8(await token.symbol()), token.address, srcChainId, tokenDecimals, auctionMode
            , Utils.parseUnits(bridgeFee,tokenDecimals), Utils.parseUnits(gasSwapRatio.toString(),tokenDecimals) );
    if(usedForGasSwap) {
        await portfolio.setBridgeParam(Utils.fromUtf8(await token.symbol()), Utils.parseUnits(bridgeFee,tokenDecimals),
                Utils.parseUnits(gasSwapRatio.toString(),tokenDecimals) , usedForGasSwap)
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

        await portfolioBridge.setDefaultTargetChain(srcChainId);

    } else {

        PortfolioBridge = await ethers.getContractFactory("PortfolioBridge") as PortfolioBridge__factory;
        portfolioBridge = await upgrades.deployProxy(
            PortfolioBridge, [remoteLZEndpoint.address]) as PortfolioBridge;

    }

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
    await bridgeOne.setLZTrustedRemoteAddress(
        chainIDTwo,
        bridgeTwo.address
    )
    await lzOne.setDestLzEndpoint(
        bridgeTwo.address,
        lzTwo.address
    )

    await bridgeTwo.setLZTrustedRemoteAddress(
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
    const {admin, treasurySafe} = await getAccounts();

    const GasStation = await ethers.getContractFactory("GasStation") as GasStation__factory;
    const gasStation: GasStation = await upgrades.deployProxy(GasStation, [portfolio.address]) as GasStation;

    await portfolio.setGasStation(gasStation.address);

    await portfolio.setTreasury(treasurySafe.address);

    await admin.sendTransaction({
        to: gasStation.address,
        value: ethers.utils.parseEther("100"), // Sends exactly 100 ALOT
    });

    return gasStation;
}

export const deployExchangeSub = async (portfolio: PortfolioSub, orderBooks: OrderBooks): Promise<ExchangeSub> => {
    const {admin, treasurySafe} = await getAccounts();

    const ExchangeSub = await ethers.getContractFactory("ExchangeSub") as ExchangeSub__factory;
    const exchangeSub: ExchangeSub = await upgrades.deployProxy(ExchangeSub) as ExchangeSub;

    await portfolio.grantRole(await portfolio.DEFAULT_ADMIN_ROLE(), exchangeSub.address);

    await exchangeSub.setPortfolio(portfolio.address);

    exchangeSub.addAdmin(admin.address);
    exchangeSub.addAdmin(treasurySafe.address);

    await exchangeSub.addAuctionAdmin(treasurySafe.address);

    await exchangeSub.setPortfolio(portfolio.address);
    await exchangeSub.setOrderBooks(orderBooks.address);

    return exchangeSub;
}

export const deployExchangeMain = async (portfolio: PortfolioMain): Promise<ExchangeMain> => {
    const {admin, treasurySafe} = await getAccounts();

    const ExchangeMain = await ethers.getContractFactory("ExchangeMain") as ExchangeMain__factory;
    const exchangeMain: ExchangeMain = await upgrades.deployProxy(ExchangeMain) as ExchangeMain;

    await exchangeMain.setPortfolio(portfolio.address);
    await portfolio.grantRole(await portfolio.DEFAULT_ADMIN_ROLE(), exchangeMain.address);

    await exchangeMain.addAdmin(admin.address);
    await exchangeMain.addAdmin(treasurySafe.address);

    await exchangeMain.addAuctionAdmin(treasurySafe.address);
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

export const deployCompletePortfolio = async (): Promise<PortfolioContracts> => {
    const srcChainId = 1;
    const tokenDecimals = 18;
    const auctionMode: any = 0;
    const gasSwapRatioAvax = 0.01;
    const bridgeFee = '0' ;
    const portfolioMain = await deployPortfolioMain("AVAX");
    const portfolioSub = await deployPortfolioSub("ALOT");

    const lzEndpointMain: LZEndpointMock = await deployLZEndpoint(1);
    //const lzEndpointSub: LZEndpointMock = await deployLZEndpoint(2);
    //using same endpoint for testing
    const portfolioBridgeMain = await deployPortfolioBridge(lzEndpointMain, portfolioMain) as PortfolioBridge;
    const portfolioBridgeSub = await deployPortfolioBridge(lzEndpointMain, portfolioSub, srcChainId) as PortfolioBridgeSub;

    await setRemoteBridges(portfolioBridgeMain, 1, portfolioBridgeSub, 1, lzEndpointMain, lzEndpointMain);
    // Set the swap Ratio for AVAX in main at deployment
    await portfolioMain.setBridgeParam(Utils.fromUtf8("AVAX"), Utils.parseUnits(bridgeFee,tokenDecimals), Utils.parseUnits(gasSwapRatioAvax.toString(), tokenDecimals ), true);
    // Add Avax to portfolioSub that also sets its gasSwapRatio
    await portfolioSub.addToken(Utils.fromUtf8("AVAX"), "0x0000000000000000000000000000000000000000", srcChainId, tokenDecimals, auctionMode
        , Utils.parseUnits(bridgeFee,tokenDecimals), Utils.parseUnits(gasSwapRatioAvax.toString(), tokenDecimals ));

    //ALOT is automatically added and its swap ratio set to 1 in the Portfoliosub contract initialization
    //ALOT needs to be added to PortfolioMain with the proper address which will also set its gasSwapRatio to 1

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
        await portfolioSub.addToken(baseSymbol, baseAddr, srcChainId, baseDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',baseDecimals));
    }
    if (quoteSymbol != Utils.fromUtf8("ALOT") && quoteSymbol != Utils.fromUtf8("AVAX")){
        //console.log ("Adding quote to Sub" , quoteSymbol);
        await portfolioSub.addToken(quoteSymbol, quoteAddr, srcChainId, quoteDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',quoteDecimals));
    }

    // add token to portfolio mainnet - don't add if it is the native AVAX on mainnet as they are already added
    if (baseSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding base to Main" , baseSymbol);
        await portfolioMain.addToken(baseSymbol, baseAddr, srcChainId, baseDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',baseDecimals));
    }
    if (quoteSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding quote to Main" , quoteSymbol);
        await portfolioMain.addToken(quoteSymbol, quoteAddr, srcChainId, quoteDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',quoteDecimals));
    }

}

//Using auctionadmin Account
export const addTradePairFromExchange = async (exchange: ExchangeSub, pair: any, pairSettings: any) => {
    const { auctionAdmin} = await getAccounts()
    const { baseSymbol, baseDecimals, quoteSymbol, quoteDecimals, tradePairId } = pair
    const { minTradeAmount, maxTradeAmount, mode } = pairSettings

    await exchange.connect(auctionAdmin).addTradePair(tradePairId, baseSymbol, baseDecimals,
            quoteSymbol, quoteDecimals, Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
            Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

}


export const addTradePair = async (tradePairs: TradePairs, pair: any, pairSettings: any) => {
    const { owner } = await getAccounts()
    const { baseSymbol,  baseDisplayDecimals, quoteSymbol, quoteDisplayDecimals, quoteDecimals, tradePairId } = pair
    const { minTradeAmount, maxTradeAmount, mode } = pairSettings

    await tradePairs.connect(owner).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
        quoteSymbol, quoteDisplayDecimals,
        Utils.parseUnits(minTradeAmount.toString(), quoteDecimals),
        Utils.parseUnits(maxTradeAmount.toString(), quoteDecimals), mode);

}

export const depositNative = async (portfolio: PortfolioMain, from:SignerWithAddress, amount: string): Promise<any> => {
    return await from.sendTransaction({to: portfolio.address, value: Utils.toWei(amount),
        gasLimit: 700000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei")});

}

export const depositNativeWithContractCall = async (portfolio: PortfolioMain, from:SignerWithAddress, amount: string, bridgeProvider =0): Promise<any> => {
    //return await from.sendTransaction({from: from.address, to: portfolio.address, value: Utils.toWei(amount)});
    return await portfolio.connect(from).depositNative (from.address, bridgeProvider, { value: Utils.parseUnits(amount, 18)});
}


export const depositToken = async (portfolio: PortfolioMain, from:SignerWithAddress, token: MockToken, tokenDecimals: number, tokenSymbol: string, amount: string, bridgeProvider =0): Promise<any> => {
    await token.connect(from).approve(portfolio.address, Utils.parseUnits(amount, tokenDecimals), {
        gasLimit: 700000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
    });

    return await portfolio.connect(from).depositToken(from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider, {
        gasLimit: 700000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
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

export const packQuote = (
    nonceAndMeta: string,
    expiry: number,
    makerAsset: string,
    takerAsset: string,
    maker: string,
    taker: string,
    makerAmount: string,
    takerAmount: string,
  ): any => {
    const rawArray = [
      nonceAndMeta,
      expiry,
      makerAsset.toLowerCase(),
      takerAsset.toLowerCase(),
      maker.toLowerCase(),
      taker.toLowerCase(),
      makerAmount,
      takerAmount,
    ];

    const packed = ethers.utils.solidityKeccak256(
      [
        "uint256",
        "uint256",
        "address",
        "address",
        "address",
        "address",
        "uint256",
        "uint256",
      ],
      rawArray
    );
    const rawObject: MainnetRFQ.QuoteStruct = {
      nonceAndMeta: rawArray[0],
      expiry: rawArray[1],
      makerAsset: rawArray[2],
      takerAsset: rawArray[3],
      maker: rawArray[4],
      taker: rawArray[5],
      makerAmount: rawArray[6],
      takerAmount: rawArray[7],
    };

    return {
      raw: rawObject,
      packed,
    };
  };

export const getMakerFromMnemonic = (index: number): Wallet => {
const wallet = ethers.Wallet.fromMnemonic(
    "test test test test test test test test test test test junk",
    `m/44'/60'/0'/0/${index}`
);
return wallet;
};

export const getLatestBlockTimestamp = async (): Promise<number> => {
return (await ethers.provider.getBlock("latest")).timestamp;
};

// export const getSignature = async (wallet: Wallet, data: string): Promise<string> => {
// const { v, r, s } = ecsign(hexToBuf(data), hexToBuf(wallet._signingKey().privateKey));
// const signature = concatRSV(r, s, v);
// return signature;
// };

export const getTime = (): number => {
    return Math.floor(Date.now() / 1000);
  };

export const hexToBuf = (value: any) => {
const padToEven = (a: any) => (a.length % 2 ? `0${a}` : a);
return Buffer.from(padToEven(stripHexPrefix(value)), "hex");
};

export const concatRSV = (r: any, s: any, v: any) => {
return (
    "0x" +
    stripHexPrefix("0x" + r.toString("hex")) +
    stripHexPrefix("0x" + s.toString("hex")) +
    stripHexPrefix(v.toString(16))
);
};

export const stripHexPrefix = (str: any) => {
return str.slice(0, 2) === "0x" ? str.slice(2) : str;
  };

export const latestTime = async (): Promise<number> => {
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    const currentBlock = await ethers.provider.getBlock(currentBlockNumber);
    return currentBlock.timestamp;
}
