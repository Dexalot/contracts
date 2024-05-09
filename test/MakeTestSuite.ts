import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
//import { PromiseOrValue } from "../typechain-types/common";
import { MockContract, smock } from '@defi-wonderland/smock';
import {
    DexalotToken,
    OrderBooks,
    PortfolioBridgeMain,
    PortfolioMain,
    PortfolioSub,
    TradePairs,
    MockToken,
    BannedAccounts,
    PortfolioMinterMock,
    GasStation,
    LZEndpointMock,
    ExchangeSub,
    DelayedTransfers,
    PortfolioSubHelper,
    TradePairs__factory,
    PortfolioMinterMock__factory,
    GasStation__factory,
    ExchangeSub__factory,
    ExchangeMain,
    ExchangeMain__factory,
    Staking,
    Staking__factory,
    TokenVestingCloneFactory,
    PortfolioBridgeSub,
    PortfolioMinter,
    MainnetRFQ,
    NativeMinterMock,
    LZEndpointMock__factory,
    InventoryManager,
    MockWrappedToken,
} from '../typechain-types'

// import { NativeMinterMock } from "../typechain-types/contracts/mocks";

// import { LZEndpointMock__factory, NativeMinterMock__factory } from "../typechain-types/factories/contracts/mocks";

import { ethers, upgrades } from "hardhat";
import { ContractFactory, Wallet } from 'ethers';

// Fuji details. Gunzilla chainListOrgId is madeup
const cChain = { native: "AVAX", nativeBytes32: Utils.fromUtf8("AVAX"), evm_decimals:18, lzChainId: 10106, chainListOrgId: 43113 };
const arbitrumChain = { native: "ETH", nativeBytes32: Utils.fromUtf8("ETH"), evm_decimals:18, lzChainId: 10231, chainListOrgId: 421614 };
const gunzillaSubnet = { native: "GUN", nativeBytes32: Utils.fromUtf8("GUN"), evm_decimals: 18, lzChainId: 10236, chainListOrgId: 49321 };
const dexalotSubnet = { native: "ALOT", nativeBytes32: Utils.fromUtf8("ALOT"), evm_decimals: 18, lzChainId: 10118, chainListOrgId: 432201 };
const chainsArray = [cChain, arbitrumChain , gunzillaSubnet, dexalotSubnet]

const maxGas = { PortfolioMain: 300000, PortfolioSub: 250000, MainnetRFQ: 150000 };
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
    portfolioAvax: PortfolioMain,
    portfolioSub: PortfolioSub,
    gasStation: GasStation,
    portfolioMinter: PortfolioMinterMock,
    delayedTransfers: DelayedTransfers,
    inventoryManager: InventoryManager,
    portfolioSubHelper: PortfolioSubHelper,
    portfolioBridgeAvax: PortfolioBridgeMain,
    portfolioBridgeSub: PortfolioBridgeSub,
    lzEndpointAvax: LZEndpointMock | MockContract<LZEndpointMock>,
    lzEndpointSub: LZEndpointMock | MockContract<LZEndpointMock>,
    mainnetRFQAvax: MainnetRFQ,
    alot: MockToken
}

interface MultiPortfolioContracts {
    portfolioAvax: PortfolioMain,
    portfolioArb: PortfolioMain,
    portfolioGun: PortfolioMain,
    portfolioSub: PortfolioSub,
    gasStation: GasStation,
    inventoryManager: InventoryManager,
    portfolioMinter: PortfolioMinterMock,
    portfolioBridgeAvax: PortfolioBridgeMain,
    portfolioBridgeArb: PortfolioBridgeMain,
    portfolioBridgeGun: PortfolioBridgeMain,
    portfolioBridgeSub: PortfolioBridgeSub,
    lzEndpointAvax: LZEndpointMock | MockContract<LZEndpointMock>,
    lzEndpointArb: LZEndpointMock | MockContract<LZEndpointMock>,
    lzEndpointGun: LZEndpointMock | MockContract<LZEndpointMock>,
    lzEndpointSub: LZEndpointMock | MockContract<LZEndpointMock>,
    mainnetRFQAvax: MainnetRFQ,
    mainnetRFQArb: MainnetRFQ,
    mainnetRFQGun: MainnetRFQ,
    alot: MockToken | undefined
}

/*
    Dexalot global test deployments
    Please load this fixtures when necessary
    You should call fixtures in the same order as the test suite
*/

export const getChains = () => {
    return { cChain, dexalotSubnet, arbitrumChain, gunzillaSubnet , chainsArray };
}

export const getAccounts = async (): Promise<Signers> => {
    const [owner, admin, auctionAdmin, trader1, trader2, treasurySafe, feeSafe, other1, other2] = await ethers.getSigners();
    return { owner, admin, auctionAdmin, trader1, trader2, treasurySafe, feeSafe, other1, other2 };
}

export const deployDexalotToken = async (): Promise<DexalotToken> => {
    const DexalotToken = await ethers.getContractFactory("DexalotToken");
    const token: DexalotToken = await DexalotToken.deploy() as DexalotToken;
    return token;
}

export const deployMockToken = async (tokenStr: string, tokenDecimals: number): Promise<MockToken> => {
    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken: MockToken = await MockToken.deploy("Mock " + tokenStr + " Token", tokenStr, tokenDecimals) as MockToken;
    return mockToken;
}

export const deployMockWrappedToken = async (tokenStr: string, tokenDecimals: number): Promise<MockWrappedToken> => {
    const MockToken = await ethers.getContractFactory("MockWrappedToken");
    const mockToken: MockWrappedToken = await MockToken.deploy("Mock Wrapped " + tokenStr + " Token", tokenStr, tokenDecimals) as MockWrappedToken;
    return mockToken;
}

export const deployBannedAccounts = async (): Promise<BannedAccounts> => {
    const { admin } = await getAccounts();
    const BannedAccounts = await ethers.getContractFactory("BannedAccounts");
    const bannedAccounts: BannedAccounts = await upgrades.deployProxy(BannedAccounts, [admin.address]) as BannedAccounts;

    return bannedAccounts;
}

export const deployLZEndpointMock = async (sourceChainID: number): Promise<MockContract<LZEndpointMock>> => {
    const LZEndpointMock = await smock.mock<LZEndpointMock__factory>("LZEndpointMock");
    const lzEndpointMock = await LZEndpointMock.deploy(sourceChainID)
    return lzEndpointMock;
}

export const deployLZEndpoint = async (sourceChainID: number): Promise<LZEndpointMock> => {
    const LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
    const lzEndpointMock: LZEndpointMock = await LZEndpointMock.deploy(
        sourceChainID
    ) as LZEndpointMock;
    return lzEndpointMock;
}

export const deployOrderBooks = async (): Promise<OrderBooks> => {
    const OrderBooks = await ethers.getContractFactory("OrderBooks") ;
    const orderBook: OrderBooks = await upgrades.deployProxy(OrderBooks) as OrderBooks
    return orderBook;
}

export const deployDelayedTransfers = async (portfolioBridgeSub: PortfolioBridgeSub): Promise<DelayedTransfers> => {
    const DelayedTransfers = await ethers.getContractFactory("DelayedTransfers") ;
    const delayedTransfers: DelayedTransfers = await upgrades.deployProxy(DelayedTransfers,[portfolioBridgeSub.address]) as DelayedTransfers
    return delayedTransfers;
}

export const deployPortfolioSubHelper = async (): Promise<PortfolioSubHelper> => {
    const PortfolioSubHelper = await ethers.getContractFactory("PortfolioSubHelper") ;
    const portfolioSubHelper: PortfolioSubHelper = await upgrades.deployProxy(PortfolioSubHelper) as PortfolioSubHelper
    return portfolioSubHelper;
}

export const deployPortfolioMain = async (chainDetails:any): Promise<PortfolioMain> => {
    const PortfolioMain = await ethers.getContractFactory("PortfolioMain") ;
    const portfolioMain: PortfolioMain = await upgrades.deployProxy(PortfolioMain, [chainDetails.nativeBytes32, chainDetails.chainListOrgId]) as PortfolioMain;
    const bannedAccounts: BannedAccounts = await deployBannedAccounts();
    await portfolioMain.setBannedAccounts(bannedAccounts.address);

    return portfolioMain;
}

export const deployPortfolioSub = async (native: string): Promise<PortfolioSub> => {
    const {feeSafe, treasurySafe } = await getAccounts();

    const PortfolioSub = await ethers.getContractFactory("PortfolioSub") ;
    const portfolioSub: PortfolioSub = await upgrades.deployProxy(PortfolioSub, [Utils.fromUtf8(native), dexalotSubnet.chainListOrgId]) as PortfolioSub;
    await portfolioSub.setFeeAddress(feeSafe.address);
    await portfolioSub.setTreasury(treasurySafe.address);
    return portfolioSub;
}

export const deployMainnetRFQ = async (signer: SignerWithAddress, portfolioBridgeMain: PortfolioBridgeMain): Promise<MainnetRFQ> => {
    const MainnetRFQ = await ethers.getContractFactory("MainnetRFQ") ;
    const mainnetRFQ: MainnetRFQ = await upgrades.deployProxy(MainnetRFQ, [signer.address]) as MainnetRFQ;
    await mainnetRFQ.setPortfolioBridge(portfolioBridgeMain.address);
    await mainnetRFQ.setPortfolioMain();
    await portfolioBridgeMain.setMainnetRFQ(mainnetRFQ.address);
    return mainnetRFQ;
}

export const deployInventoryManager = async (portfolioBridgeSub: PortfolioBridgeSub): Promise<InventoryManager> => {
    const InventoryManager = await ethers.getContractFactory("InventoryManager") ;
    const inventoryManager: InventoryManager = await upgrades.deployProxy(InventoryManager, [portfolioBridgeSub.address]) as InventoryManager;
    return inventoryManager;
}

export const addToken = async (portfolioMain: PortfolioMain , portfolioSub: PortfolioSub, token: MockToken, gasSwapRatio: number, auctionMode = 0, usedForGasSwap=false, bridgeFee=0, subnetSymbol=""): Promise<void> => {

    const tokenDecimals = await token.decimals();
    const sourceChainID = await portfolioMain.getChainId();
    const symbol = await token.symbol();
    const tokenSymbol = Utils.fromUtf8(symbol);
    subnetSymbol = subnetSymbol === "" ? symbol : subnetSymbol;


    await portfolioMain.addToken(tokenSymbol, token.address, 0, tokenDecimals
        , Utils.parseUnits(bridgeFee.toString(), tokenDecimals), Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals), tokenDecimals), false);

    await portfolioMain.setBridgeParam(tokenSymbol, Utils.parseUnits(bridgeFee.toString(), tokenDecimals),
        Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals), tokenDecimals), usedForGasSwap);


    await addTokenToPortfolioSub(portfolioSub, symbol, subnetSymbol, token.address, tokenDecimals
        , sourceChainID, gasSwapRatio, auctionMode, usedForGasSwap, bridgeFee);
}

export const addTokenToPortfolioSub = async (portfolioSub: PortfolioSub, tokenSymbol: string, subnetSymbol: string, tokenAddress: string, tokenDecimals: number,
    sourceChainID: number, gasSwapRatio: number, auctionMode = 0, usedForGasSwap = false, bridgeFee = 0): Promise<void> => {
        tokenSymbol = Utils.fromUtf8(tokenSymbol);
        subnetSymbol= Utils.fromUtf8(subnetSymbol);
        await portfolioSub.addToken(tokenSymbol, tokenAddress, sourceChainID, tokenDecimals, auctionMode,
            Utils.parseUnits(bridgeFee.toString(), tokenDecimals), Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals), tokenDecimals), subnetSymbol);

        if(usedForGasSwap || bridgeFee >0 ) {
            await portfolioSub.setBridgeParam(subnetSymbol, Utils.parseUnits(bridgeFee.toString(),tokenDecimals),
                    Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals),tokenDecimals) , usedForGasSwap)
        }
}


export const addTokenToPortfolioMain = async (portfolio: PortfolioMain , token: MockToken, gasSwapRatio: number, usedForGasSwap=false, bridgeFee=0): Promise<void> => {
    const tokenDecimals = await token.decimals();

    await portfolio.addToken(Utils.fromUtf8(await token.symbol()), token.address, 0, tokenDecimals,
        Utils.parseUnits(bridgeFee.toString(), tokenDecimals), Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals), tokenDecimals), false);

    if(usedForGasSwap || bridgeFee >0 ) {
        await portfolio.setBridgeParam(Utils.fromUtf8(await token.symbol()), Utils.parseUnits(bridgeFee.toString(),tokenDecimals),
                Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals),tokenDecimals) , usedForGasSwap)
    }
}

export const addVirtualToken = async (portfolio: PortfolioMain, symbol: string, tokenDecimals:number, srcChainId: number): Promise<void> => {

    await portfolio.addToken(Utils.fromUtf8(symbol), ethers.constants.AddressZero, srcChainId, tokenDecimals,
        0,  Utils.parseUnits("100", tokenDecimals), true);
}


export const deployPortfolioBridge = async (remoteLZEndpoint: LZEndpointMock |MockContract<LZEndpointMock>, portfolio: PortfolioMain | PortfolioSub): Promise<PortfolioBridgeMain | PortfolioBridgeSub> => {
    const {admin} = await getAccounts();

    let PortfolioBridge: ContractFactory;
    let portfolioBridge;

    if (await portfolio.native() === Utils.fromUtf8('ALOT')) {
        //Subnet PortfolioBridge
        PortfolioBridge = await ethers.getContractFactory("PortfolioBridgeSub") ;
        portfolioBridge = await upgrades.deployProxy(
            PortfolioBridge, [remoteLZEndpoint.address]) as PortfolioBridgeSub;

    } else {
        PortfolioBridge = await ethers.getContractFactory("PortfolioBridgeMain") ;
        portfolioBridge = await upgrades.deployProxy(
            PortfolioBridge, [remoteLZEndpoint.address]) as PortfolioBridgeMain;

    }

    await portfolioBridge.setPortfolio(portfolio.address);


    await admin.sendTransaction({
        to: portfolioBridge.address,
        value: ethers.utils.parseEther("100"),
    });

    await portfolio.setPortfolioBridge(portfolioBridge.address);

    return portfolioBridge;
}

export const setRemoteBridges = async (
    sourcePortfolioBridge: PortfolioBridgeMain,
    destinationPorfolioBridge: PortfolioBridgeMain,
    sourceLzEndPoint: LZEndpointMock | MockContract<LZEndpointMock>,
    destLzEndPoint: LZEndpointMock | MockContract<LZEndpointMock>,
    sourceChain:any,
    remoteChain: any,
    maxDestinationGas = maxGas.PortfolioMain ) => {

    await sourcePortfolioBridge.setTrustedRemoteAddress(0, remoteChain.lzChainId, destinationPorfolioBridge.address, remoteChain.chainListOrgId, maxDestinationGas, false);
    // console.log("Setting portfolioBridgeSub dest id" , cChain.lzChainId, "Remote addr",portfolioBridgeMain.address)
    // const results = await portfolioBridgeSub.remoteParams(cChain.lzChainId);
    // console.log(results.lzRemoteChainId, results.chainListOrgChainId, results.gasForDestination);

    //TODO check to see if it is already set. Ignore if it is.
    await sourceLzEndPoint.setDestLzEndpoint(
        destinationPorfolioBridge.address,
        destLzEndPoint.address
    )
    await destinationPorfolioBridge.setTrustedRemoteAddress(0, sourceChain.lzChainId, sourcePortfolioBridge.address, sourceChain.chainListOrgId, maxDestinationGas, false);
    // console.log("Setting portfolioBridgeMain dest id", dexalotSubnet.lzChainId, "Remote addr",portfolioBridgeSub.address)
    await destLzEndPoint.setDestLzEndpoint(
        sourcePortfolioBridge.address,
        sourceLzEndPoint.address
    )
}

export const deployTradePairs = async (orderBooks: OrderBooks, portfolio: PortfolioSub, exchange: ExchangeSub): Promise<TradePairs> => {
    const TradePairs = await ethers.getContractFactory("TradePairs") as TradePairs__factory;
    const tradePairs: TradePairs = await upgrades.deployProxy(TradePairs, [orderBooks.address, portfolio.address]) as TradePairs;
    await tradePairs.grantRole(await tradePairs.DEFAULT_ADMIN_ROLE(), exchange.address);
    await tradePairs.grantRole(await tradePairs.EXCHANGE_ROLE(), exchange.address);
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

    const PortfolioMinter = await ethers.getContractFactory("PortfolioMinter");
    const NativeMinterMock = await ethers.getContractFactory("NativeMinterMock");
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

export const deployExchangeMain = async (portfolio: PortfolioMain, mainnetRFQ : MainnetRFQ): Promise<ExchangeMain> => {
    const {admin, treasurySafe} = await getAccounts();

    const ExchangeMain = await ethers.getContractFactory("ExchangeMain") as ExchangeMain__factory;
    const exchangeMain: ExchangeMain = await upgrades.deployProxy(ExchangeMain) as ExchangeMain;

    await exchangeMain.setPortfolio(portfolio.address);
    await portfolio.grantRole(await portfolio.DEFAULT_ADMIN_ROLE(), exchangeMain.address);

    await exchangeMain.setMainnetRFQ(mainnetRFQ.address);
    await mainnetRFQ.grantRole(await mainnetRFQ.DEFAULT_ADMIN_ROLE(), exchangeMain.address);

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
    const TokenVestingCloneFactory = await ethers.getContractFactory("TokenVestingCloneFactory");  //as TokenVestingCloneFactory__factory;
    const tokenVestingCloneFactory: TokenVestingCloneFactory = await TokenVestingCloneFactory.deploy() as TokenVestingCloneFactory;

    return tokenVestingCloneFactory;
}

export const deployCompletePortfolio = async (addMainnetAlot= false, mockLzEndPoint=false ): Promise<PortfolioContracts> => {
    const gasSwap = { avax: 0.01, arb: 0.001, gun: 1 };
    const bridgeFee = { avax: "0", arb: "0", gun: "0" };
    const portfolioAvax = await deployPortfolioMain(cChain);

    const portfolioSub = await deployPortfolioSub(dexalotSubnet.native);
    const portfolioSubHelper = await deployPortfolioSubHelper();
    await portfolioSub.setPortfolioSubHelper(portfolioSubHelper.address);

    await portfolioSubHelper.addAdminAccountForRates(await portfolioSub.feeAddress(), "Fee Address");
    await portfolioSubHelper.addAdminAccountForRates(await portfolioSub.getTreasury(), "Treasury Address");


    let lzEndpointAvax: LZEndpointMock | MockContract<LZEndpointMock>;
    let lzEndpointSub: LZEndpointMock | MockContract<LZEndpointMock>;

    if (mockLzEndPoint) {
        lzEndpointAvax = await deployLZEndpointMock(cChain.lzChainId);
        lzEndpointSub = await deployLZEndpointMock(dexalotSubnet.lzChainId);
    } else {
        lzEndpointAvax = await deployLZEndpoint(cChain.lzChainId);
        lzEndpointSub = await deployLZEndpoint(dexalotSubnet.lzChainId);
    }

    const portfolioBridgeAvax = await deployPortfolioBridge(lzEndpointAvax, portfolioAvax) as PortfolioBridgeMain;
    const portfolioBridgeSub = await deployPortfolioBridge(lzEndpointSub, portfolioSub) as PortfolioBridgeSub;
    const delayedTransfers = await deployDelayedTransfers(portfolioBridgeSub);
    await portfolioBridgeSub.setDelayedTransfer(delayedTransfers.address);
    const inventoryManager = await deployInventoryManager(portfolioBridgeSub);
    await portfolioBridgeSub.setInventoryManager(inventoryManager.address);

    await setRemoteBridges(portfolioBridgeAvax, portfolioBridgeSub, lzEndpointAvax, lzEndpointSub, cChain, dexalotSubnet);

    await addMainnetNativeCoin(portfolioAvax, portfolioSub, cChain, gasSwap.avax, bridgeFee.avax);

    const { other1 } = await getAccounts()
    const mainnetRFQAvax = await deployMainnetRFQ(other1, portfolioBridgeAvax) ;

    const alot_token_symbol = "ALOT";
    const alot_token_decimals = 18;
    const ALOT = Utils.fromUtf8(alot_token_symbol);
    const alot = await deployMockToken(alot_token_symbol, alot_token_decimals);

    if (addMainnetAlot) {
        //ALOT needs to be added to PortfolioMain with the proper address which will also set its gasSwapRatio to 1
        await portfolioAvax.addToken(ALOT, alot.address, cChain.chainListOrgId, alot_token_decimals, '0', ethers.utils.parseUnits('1', alot_token_decimals), false);
        // ALOT is automatically added and its swap ratio set to 1 in the Portfoliosub contract initialization
        // BUT ALOT needs to be added to PortfolioBridge independently with the Mainnet Address
        // PortfolioSub.addToken will ignore the call because it already has ALOT in its tokenList
        await portfolioBridgeSub.addToken(ALOT, alot.address, cChain.chainListOrgId, alot_token_decimals, 0, ALOT, 0);
    }

    const gasStation = await deployGasStation(portfolioSub);
    const portfolioMinter = await deployPortfolioMinterMock(portfolioSub, ethers.constants.AddressZero);

    return {
        portfolioAvax,
        portfolioSub,
        gasStation,
        portfolioMinter,
        delayedTransfers,
        inventoryManager,
        portfolioSubHelper,
        portfolioBridgeAvax,
        portfolioBridgeSub,
        lzEndpointAvax,
        lzEndpointSub,
        mainnetRFQAvax,
        alot
    }
}


export const deployCompleteMultiChainPortfolio = async (addAvaxChainAlot= false, mockLzEndPoint=false ): Promise<MultiPortfolioContracts> => {

    const gasSwap = { avax: 0.01, arb: 0.001, gun: 1 };
    const bridgeFee = { avax: "0", arb: "0", gun: "0" };

    const portfolioContracts = await deployCompletePortfolio(addAvaxChainAlot, mockLzEndPoint);

    const portfolioArb = await deployPortfolioMain(arbitrumChain);
    const portfolioGun = await deployPortfolioMain(gunzillaSubnet);

    let lzEndpointArb: LZEndpointMock | MockContract<LZEndpointMock>;
    let lzEndpointGun: LZEndpointMock | MockContract<LZEndpointMock>;

    if (mockLzEndPoint) {
        lzEndpointArb = await deployLZEndpointMock(arbitrumChain.lzChainId);
        lzEndpointGun = await deployLZEndpointMock(gunzillaSubnet.lzChainId);
    } else {
        lzEndpointArb = await deployLZEndpoint(arbitrumChain.lzChainId);
        lzEndpointGun = await deployLZEndpoint(gunzillaSubnet.lzChainId);
    }

    const portfolioBridgeArb = await deployPortfolioBridge(lzEndpointArb, portfolioArb) as PortfolioBridgeMain;
    const portfolioBridgeGun = await deployPortfolioBridge(lzEndpointGun, portfolioGun) as PortfolioBridgeMain;

    await setRemoteBridges(portfolioBridgeArb, portfolioContracts.portfolioBridgeSub, lzEndpointArb, portfolioContracts.lzEndpointSub, arbitrumChain,dexalotSubnet);
    await setRemoteBridges(portfolioBridgeGun, portfolioContracts.portfolioBridgeSub, lzEndpointGun, portfolioContracts.lzEndpointSub, gunzillaSubnet,dexalotSubnet);
    await setRemoteBridges(portfolioContracts.portfolioBridgeAvax, portfolioBridgeGun, portfolioContracts.lzEndpointAvax, lzEndpointGun, cChain, gunzillaSubnet);
    await setRemoteBridges(portfolioBridgeArb, portfolioBridgeGun, lzEndpointArb, lzEndpointGun, arbitrumChain, gunzillaSubnet);

    await portfolioBridgeGun.setUserPaysFeeForDestination(0, cChain.lzChainId, true);
    await portfolioBridgeGun.setUserPaysFeeForDestination(0, arbitrumChain.lzChainId, true);

    await addMainnetNativeCoin(portfolioArb, portfolioContracts.portfolioSub, arbitrumChain, gasSwap.arb, bridgeFee.arb);
    await addMainnetNativeCoin(portfolioGun, portfolioContracts.portfolioSub, gunzillaSubnet, gasSwap.gun, bridgeFee.gun);

    const { other1 } = await getAccounts()

    const mainnetRFQArb = await deployMainnetRFQ(other1, portfolioBridgeArb) ;
    const mainnetRFQGun = await deployMainnetRFQ(other1, portfolioBridgeGun) ;

    return {
        portfolioAvax: portfolioContracts.portfolioAvax,
        portfolioArb,
        portfolioGun,
        portfolioSub: portfolioContracts.portfolioSub,
        gasStation: portfolioContracts.gasStation,
        inventoryManager: portfolioContracts.inventoryManager,
        portfolioMinter: portfolioContracts.portfolioMinter,
        portfolioBridgeAvax: portfolioContracts.portfolioBridgeAvax,
        portfolioBridgeArb,
        portfolioBridgeGun,
        portfolioBridgeSub: portfolioContracts.portfolioBridgeSub,
        lzEndpointAvax: portfolioContracts.lzEndpointAvax,
        lzEndpointArb,
        lzEndpointGun,
        lzEndpointSub: portfolioContracts.lzEndpointSub,
        mainnetRFQAvax: portfolioContracts.mainnetRFQAvax,
        mainnetRFQArb,
        mainnetRFQGun,
        alot: portfolioContracts.alot
    }
}

// Sets-up the native coin of the mainnet chain properly. Mainnet native is added to PortfolioMain at initialization automatically. Hence no need to do it here
export const addMainnetNativeCoin = async(portfolioMain: PortfolioMain, portfolioSub: PortfolioSub, chainDetails:any,  gasSwap:number, bridgeFee: string, auctionMode=0) => {
    // Set the swap Ratio for AVAX in main at deployment
    await portfolioMain.setBridgeParam(chainDetails.nativeBytes32, Utils.parseUnits(bridgeFee, chainDetails.evm_decimals), Utils.parseUnits(gasSwap.toString(), chainDetails.evm_decimals ), true);
    // Add Avax to portfolioSub that also sets its gasSwapRatio
    await portfolioSub.addToken(chainDetails.nativeBytes32, ethers.constants.AddressZero, chainDetails.chainListOrgId, chainDetails.evm_decimals, auctionMode
        , Utils.parseUnits(bridgeFee, chainDetails.evm_decimals), Utils.parseUnits(gasSwap.toString(), chainDetails.evm_decimals ), chainDetails.nativeBytes32);
}

export const addBaseAndQuoteTokens = async (portfolioMain: PortfolioMain, portfolioSub: PortfolioSub, baseSymbol: string, baseAddr: string, baseDecimals: number, quoteSymbol: string, quoteAddr: string, quoteDecimals:number,  mode: number): Promise<void> => {

    const auctionMode: any = mode;

    // add token to portfolio subnet - don't add if it is the native ALOT or AVAX on subnet as they are already added
    if (baseSymbol != Utils.fromUtf8("ALOT") && baseSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding base to Sub" , baseSymbol);
        await portfolioSub.addToken(baseSymbol, baseAddr, cChain.chainListOrgId, baseDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',baseDecimals), baseSymbol);
    }
    if (quoteSymbol != Utils.fromUtf8("ALOT") && quoteSymbol != Utils.fromUtf8("AVAX")){
        //console.log ("Adding quote to Sub" , quoteSymbol);
        await portfolioSub.addToken(quoteSymbol, quoteAddr, cChain.chainListOrgId, quoteDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',quoteDecimals), quoteSymbol);
    }

    // add token to portfolio mainnet - don't add if it is the native AVAX on mainnet as they are already added
    if (baseSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding base to Main" , baseSymbol);
        await portfolioMain.addToken(baseSymbol, baseAddr, 0,baseDecimals, '0', ethers.utils.parseUnits('0.5',baseDecimals), false);
    }
    if (quoteSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding quote to Main" , quoteSymbol);
        await portfolioMain.addToken(quoteSymbol, quoteAddr, 0,quoteDecimals, '0', ethers.utils.parseUnits('0.5',quoteDecimals), false);
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


export const addTradePair = async (exchangeSub: ExchangeSub, pair: any, pairSettings: any) => {
    const { owner } = await getAccounts()
    const { baseSymbol,  baseDisplayDecimals, quoteSymbol, quoteDisplayDecimals, quoteDecimals, tradePairId } = pair
    const { minTradeAmount, maxTradeAmount, mode } = pairSettings

    await exchangeSub.connect(owner).addTradePair(tradePairId, baseSymbol, baseDisplayDecimals,
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
        gasLimit: 1000000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
    });

    return await portfolio.connect(from).depositToken(from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider, {
        gasLimit: 1000000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
    });
}


export const withdrawToken = async (portfolio: PortfolioSub, from:SignerWithAddress, tokenSymbol: string, tokenDecimals: number, amount: string, bridgeProvider =0): Promise<any> => {
     return await (<any> portfolio).connect(from)["withdrawToken(address,bytes32,uint256,uint8)"]( from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider, {
        gasLimit: 1000000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
    });
}

export const withdrawTokenToDst = async (portfolio: PortfolioSub, from:SignerWithAddress, tokenSymbol: string, tokenDecimals: number, amount: string, dstChainId: number , bridgeProvider =0): Promise<any> => {
    return await (<any> portfolio).connect(from)["withdrawToken(address,bytes32,uint256,uint8,uint32)"]( from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider, dstChainId);
}

export const setBridgeSubSettings = async (delayedTransfers: DelayedTransfers, settings: any) => {
    const {
        delayPeriod,
        epochLength,
        token,
        epochVolumeCap,
        delayThreshold
    } = settings;
    await delayedTransfers.setDelayPeriod(delayPeriod);
    await delayedTransfers.setEpochLength(epochLength);
    await delayedTransfers.setEpochVolumeCaps(
        [token],
        [epochVolumeCap]
    )
    await delayedTransfers.setDelayThresholds(
        [token],
        [delayThreshold]
    );
}


export const printTokens =  async (portfolioMainArray: PortfolioMain[], portfolioSub: PortfolioSub, portfolioBridgeSub: PortfolioBridgeSub) =>{
    console.log("*********************");
    for (const portfolioMain of portfolioMainArray) {
        const  tokenList = await portfolioMain.getTokenList()
        console.log("Token List in Portfolio", Utils.toUtf8(await portfolioMain.native()));
        console.log("Symbol, SymbolId, Decimals, address                        , auction, SrcChainSym, isVirtual");
        for (const element of tokenList) {
            const tdet = await portfolioMain.getTokenDetails(element);
            console.log(Utils.toUtf8(tdet.symbol), Utils.toUtf8(tdet.symbolId), tdet.decimals, tdet.tokenAddress, tdet.auctionMode, Utils.toUtf8(tdet.sourceChainSymbol), tdet.isVirtual)
        }
    }
    const tokenList = await portfolioSub.getTokenList()
    console.log("Token List in Portfolio Sub:")
    console.log("Symbol, SymbolId, Decimals, address                        , auction, SrcChainSym, isVirtual");
    for (const element of tokenList) {
        const tdet = await portfolioSub.getTokenDetails(element);
        console.log(Utils.toUtf8(tdet.symbol), Utils.toUtf8(tdet.symbolId), tdet.decimals, tdet.tokenAddress, tdet.auctionMode, Utils.toUtf8(tdet.sourceChainSymbol), tdet.isVirtual)
    }

    if (portfolioBridgeSub) {
        const  tokenList = await portfolioBridgeSub.getTokenList()
        console.log("Token List in Portfolio Bridge Sub:")
        console.log("Symbol, SymbolId, Decimals, address                        , auction, SrcChainSym, isVirtual");
        for (const element of tokenList) {
            const tdet = await portfolioBridgeSub.getTokenDetails(element);
            console.log(Utils.toUtf8(tdet.symbol), Utils.toUtf8(tdet.symbolId), tdet.decimals, tdet.tokenAddress, tdet.auctionMode, Utils.toUtf8(tdet.sourceChainSymbol), tdet.isVirtual);
        }
    }
}


// export const packQuote = (
//     nonceAndMeta: string,
//     expiry: number,
//     makerAsset: string,
//     takerAsset: string,
//     maker: string,
//     taker: string,
//     makerAmount: string,
//     takerAmount: string,
//   ): any => {
//     const rawArray = [
//       nonceAndMeta,
//       expiry,
//       makerAsset.toLowerCase(),
//       takerAsset.toLowerCase(),
//       maker.toLowerCase(),
//       taker.toLowerCase(),
//       makerAmount,
//       takerAmount,
//     ];

//     const packed = ethers.utils.solidityKeccak256(
//       [
//         "uint256",
//         "uint256",
//         "address",
//         "address",
//         "address",
//         "address",
//         "uint256",
//         "uint256",
//       ],
//       rawArray
//     );
//     const rawObject: MainnetRFQ.OrderStruct = {
//       nonceAndMeta: rawArray[0],
//       expiry: rawArray[1],
//       makerAsset: rawArray[2],
//       takerAsset: rawArray[3],
//       maker: rawArray[4],
//       taker: rawArray[5],
//       makerAmount: rawArray[6],
//       takerAmount: rawArray[7],
//     };

//     return {
//       raw: rawObject,
//       packed,
//     };
//   };

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
