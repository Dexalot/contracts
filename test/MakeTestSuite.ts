import Utils from './utils';

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
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
    InventoryManager,
    MockWrappedToken,
    AlotOFT,
    AlotOFTAdapter,
    AlotOFTAdapter__factory,
    LzV2App,
    DexalotTokenOFT,
    DexalotTokenOFTMinter,
    SolPortfolioBridgeMock,
    DexalotRouter
} from '../typechain-types'
import { Options } from '@layerzerolabs/lz-v2-utilities'
// import { NativeMinterMock } from "../typechain-types/contracts/mocks";

// import { LZEndpointMock__factory, NativeMinterMock__factory } from "../typechain-types/factories/contracts/mocks";

import { ethers, upgrades, deployments } from "hardhat";
import { BigNumber, Contract, ContractFactory, Wallet } from 'ethers';

// Fuji details. Gunzilla chainListOrgId is madeup
const cChain = { native: "AVAX", nativeBytes32: Utils.fromUtf8("AVAX"), evm_decimals:18, lzChainId: 10106, chainListOrgId: 43113 };
const arbitrumChain = { native: "ETH", nativeBytes32: Utils.fromUtf8("ETH"), evm_decimals:18, lzChainId: 10231, chainListOrgId: 421614 };
const gunzillaSubnet = { native: "GUN", nativeBytes32: Utils.fromUtf8("GUN"), evm_decimals: 18, lzChainId: 10236, chainListOrgId: 49321 };
// Adding the native token for base as ETHB otherwise it clashes with arbitrumChain.
const baseChain = { native: "ETHB", nativeBytes32: Utils.fromUtf8("ETHB"), evm_decimals: 18, lzChainId: 10245, chainListOrgId: 84532 };
const bnbChain = { native: "tBNB", nativeBytes32: Utils.fromUtf8("tBNB"), evm_decimals: 18, lzChainId: 10102, chainListOrgId: 97 };
const solChain = { native: "SOL", nativeBytes32: Utils.fromUtf8("SOL"), evm_decimals: 9, lzChainId: 10168, chainListOrgId: 5459788 };
const dexalotSubnet = { native: "ALOT", nativeBytes32: Utils.fromUtf8("ALOT"), evm_decimals: 18, lzChainId: 10118, chainListOrgId: 432201 };
const chainsArray = [cChain, arbitrumChain , baseChain, gunzillaSubnet, dexalotSubnet] //

const lzBridge = 0;

const maxGas = { PortfolioMain: 350000, PortfolioSub: 400000, MainnetRFQ: 150000 };
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
    portfolioMainnet: PortfolioMain,
    portfolioSub: PortfolioSub,
    gasStation: GasStation,
    portfolioMinter: PortfolioMinterMock,
    delayedTransfers: DelayedTransfers,
    inventoryManager: InventoryManager,
    portfolioSubHelper: PortfolioSubHelper,
    portfolioBridgeMainnet: PortfolioBridgeMain,
    portfolioBridgeSub: PortfolioBridgeSub,
    lzEndpointMainnet: Contract | MockContract<Contract>,
    lzEndpointSub: Contract | MockContract<Contract>,
    lzAppMainnet: LzV2App,
    lzAppSub: LzV2App,
    mainnetRFQ: MainnetRFQ,
    dexalotRouter: DexalotRouter,
    alot: MockToken
}

interface MultiPortfolioContracts {
    portfolioAvax: PortfolioMain,
    portfolioArb: PortfolioMain,
    portfolioGun: PortfolioMain,
    portfolioBase: PortfolioMain,
    portfolioSub: PortfolioSub,
    gasStation: GasStation,
    inventoryManager: InventoryManager,
    portfolioMinter: PortfolioMinterMock,
    portfolioBridgeAvax: PortfolioBridgeMain,
    portfolioBridgeArb: PortfolioBridgeMain,
    portfolioBridgeGun: PortfolioBridgeMain,
    portfolioBridgeBase: PortfolioBridgeMain,
    portfolioBridgeSub: PortfolioBridgeSub,
    portfolioSubHelper: PortfolioSubHelper,
    lzEndpointAvax: Contract | MockContract<Contract>,
    lzEndpointArb: Contract | MockContract<Contract>,
    lzEndpointBase: Contract | MockContract<Contract>,
    lzEndpointGun: Contract | MockContract<Contract>,
    lzEndpointSub: Contract | MockContract<Contract>,
    lzAppAvax: LzV2App,
    lzAppArb: LzV2App,
    lzAppBase: LzV2App,
    lzAppGun: LzV2App,
    lzAppSub: LzV2App,
    mainnetRFQAvax: MainnetRFQ,
    mainnetRFQArb: MainnetRFQ,
    mainnetRFQBase: MainnetRFQ,
    mainnetRFQGun: MainnetRFQ,
    alot: MockToken | undefined
}

/*
    Dexalot global test deployments
    Please load this fixtures when necessary
    You should call fixtures in the same order as the test suite
*/

export const getChains = () => {
    return { cChain, dexalotSubnet, arbitrumChain, gunzillaSubnet , baseChain, solChain, chainsArray };
}

export const getBnBChain = () => {
    const bnbchainsArray = [cChain, bnbChain];
    return { bnbChain, dexalotSubnet,  bnbchainsArray };
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

export const deployLZEndpointMock = async (sourceChainID: number): Promise<MockContract<Contract>> => {
    const LZEndpointMock = await smock.mock<ContractFactory>("EndpointV2Mock");
    const lzEndpointMock = await LZEndpointMock.deploy(sourceChainID)
    return lzEndpointMock;
}

export const deployLZEndpoint = async (sourceChainID: number): Promise<Contract> => {
    const { owner } = await getAccounts();

    const EndpointV2MockArtifact = await deployments.getArtifact('EndpointV2Mock');
    const EndpointV2Mock = new ContractFactory(
      EndpointV2MockArtifact.abi,
      EndpointV2MockArtifact.bytecode,
      owner,
    );
    const lzEndpointMock = await EndpointV2Mock.deploy(
        sourceChainID
    );
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

export const deployDexalotRouter = async (owner: SignerWithAddress, mainnetRFQ: MainnetRFQ): Promise<DexalotRouter> => {
    const DexalotRouter = await ethers.getContractFactory("DexalotRouter");
    const dexalotRouter: DexalotRouter = await DexalotRouter.deploy(owner.address) as DexalotRouter;
    await dexalotRouter.setAllowedRFQ(mainnetRFQ.address, true);
    await mainnetRFQ.setTrustedForwarder(dexalotRouter.address);
    return dexalotRouter;
}

export const deployAlotOFT = async (lzEndpointAddress: string, alotToken: MockToken): Promise<AlotOFT> => {
    const {owner} = await getAccounts();
    const name = await alotToken.name();
    const symbol = await alotToken.symbol();
    const AlotOFT = await ethers.getContractFactory("AlotOFT") ;
    const alotOFT: AlotOFT = await AlotOFT.deploy(name, symbol, lzEndpointAddress, owner.address) as AlotOFT;
    return alotOFT;
}

export const deployAlotOFTAdapter = async (lzEndpointAddress: string, alotToken: MockToken): Promise<AlotOFTAdapter> => {
    const {owner} = await getAccounts();

    const AlotOFTAdapter = new AlotOFTAdapter__factory(owner);
    const alotOFTAdapter: AlotOFTAdapter = await AlotOFTAdapter.deploy(alotToken.address, lzEndpointAddress, owner.address) as AlotOFTAdapter;
    return alotOFTAdapter;
}

export const deployDexalotTokenOFT = async (lzEndpointAddress: string): Promise<DexalotTokenOFT> => {
    const {owner} = await getAccounts();

    const DexalotTokenOFT = await ethers.getContractFactory("DexalotTokenOFT") ;
    const dexalotTokenOFT: DexalotTokenOFT = await DexalotTokenOFT.deploy("Dexalot Token", "DXTR", lzEndpointAddress, owner.address) as DexalotTokenOFT;
    return dexalotTokenOFT;
}

export const deployDexalotTokenOFTMinter = async (lzEndpointAddress: string): Promise<DexalotTokenOFTMinter> => {
    const {owner, treasurySafe} = await getAccounts();

    const DexalotTokenOFTMinter = await ethers.getContractFactory("DexalotTokenOFTMinter") ;
    const dexalotTokenOFTMinter: DexalotTokenOFTMinter = await DexalotTokenOFTMinter.deploy("Dexalot Token", "DXTR", lzEndpointAddress, owner.address, treasurySafe.address) as DexalotTokenOFTMinter;
    return dexalotTokenOFTMinter;
}

export const deployInventoryManager = async (portfolioBridgeSub: PortfolioBridgeSub): Promise<InventoryManager> => {
    const InventoryManager = await ethers.getContractFactory("InventoryManager") ;
    const inventoryManager: InventoryManager = await upgrades.deployProxy(InventoryManager, [portfolioBridgeSub.address]) as InventoryManager;
    return inventoryManager;
}

export const addToken = async (portfolioMain: PortfolioMain , portfolioSub: PortfolioSub, token: MockToken | MockWrappedToken, gasSwapRatio: number, auctionMode = 0, usedForGasSwap=false, bridgeFee=0, subnetSymbol="",subBridgeFee=0): Promise<void> => {

    const tokenDecimals = await token.decimals();
    const sourceChainID = await portfolioMain.getChainId();
    const symbol = await token.symbol();
    const tokenSymbol = Utils.fromUtf8(symbol);
    subnetSymbol = subnetSymbol === "" ? symbol : subnetSymbol;


    await portfolioMain.addToken(tokenSymbol, token.address,  tokenDecimals, tokenDecimals
        , Utils.parseUnits(bridgeFee.toString(), tokenDecimals), Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals), tokenDecimals));

    await portfolioMain.setBridgeParam(tokenSymbol, Utils.parseUnits(bridgeFee.toString(), tokenDecimals),
        Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals), tokenDecimals), usedForGasSwap);


    await addTokenToPortfolioSub(portfolioSub, symbol, subnetSymbol, token.address, tokenDecimals
        , sourceChainID, gasSwapRatio, auctionMode, usedForGasSwap, subBridgeFee);
}

export const addTokenToPortfolioSub = async (portfolioSub: PortfolioSub, tokenSymbol: string, subnetSymbol: string, tokenAddress: string, tokenDecimals: number,
    sourceChainID: number, gasSwapRatio: number, auctionMode = 0, usedForGasSwap = false, bridgeFee = 0): Promise<void> => {
        tokenSymbol = Utils.fromUtf8(tokenSymbol);
        subnetSymbol= Utils.fromUtf8(subnetSymbol);
        await portfolioSub.addToken(tokenSymbol, tokenAddress, sourceChainID, tokenDecimals, tokenDecimals, auctionMode,
            Utils.parseUnits(bridgeFee.toString(), tokenDecimals), Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals), tokenDecimals), subnetSymbol);

        if(usedForGasSwap || bridgeFee >0 ) {
            await portfolioSub.setBridgeParam(subnetSymbol, Utils.parseUnits(bridgeFee.toString(),tokenDecimals),
                    Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals),tokenDecimals) , usedForGasSwap)
        }
}


export const addTokenToPortfolioMain = async (portfolio: PortfolioMain , token: MockToken, gasSwapRatio: number, usedForGasSwap=false, bridgeFee=0): Promise<void> => {
    const tokenDecimals = await token.decimals();

    await portfolio.addToken(Utils.fromUtf8(await token.symbol()), token.address, tokenDecimals, tokenDecimals,
        Utils.parseUnits(bridgeFee.toString(), tokenDecimals), Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals), tokenDecimals));

    if(usedForGasSwap || bridgeFee >0 ) {
        await portfolio.setBridgeParam(Utils.fromUtf8(await token.symbol()), Utils.parseUnits(bridgeFee.toString(),tokenDecimals),
                Utils.parseUnits(gasSwapRatio.toFixed(tokenDecimals),tokenDecimals) , usedForGasSwap)
    }
}


export const deployLZV2App = async (remoteLZEndpoint: Contract | MockContract<Contract>, isMockApp = false): Promise<LzV2App> => {
    const {owner} = await getAccounts();

    const LZV2App = await ethers.getContractFactory(isMockApp ? "CelerMock" : "LzV2App");
    const lzV2App = await LZV2App.deploy(remoteLZEndpoint.address, owner.address);
    return lzV2App as LzV2App;
}


export const deployPortfolioBridge = async (lzV2App: LzV2App, portfolio: PortfolioMain | PortfolioSub): Promise<PortfolioBridgeMain | PortfolioBridgeSub> => {
    const {admin, owner} = await getAccounts();

    let PortfolioBridge: ContractFactory;
    let portfolioBridge;

    if (await portfolio.native() === Utils.fromUtf8('ALOT')) {
        //Subnet PortfolioBridge
        PortfolioBridge = await ethers.getContractFactory("PortfolioBridgeSub") ;
        portfolioBridge = await upgrades.deployProxy(
            PortfolioBridge, [lzBridge, lzV2App.address, owner.address]) as PortfolioBridgeSub;
        await portfolioBridge.setDefaultDestinationChain(cChain.chainListOrgId);
    } else {
        PortfolioBridge = await ethers.getContractFactory("PortfolioBridgeMain") ;
        portfolioBridge = await upgrades.deployProxy(
            PortfolioBridge, [lzBridge, lzV2App.address, owner.address]) as PortfolioBridgeMain;
        await portfolioBridge.setDefaultDestinationChain(dexalotSubnet.chainListOrgId);
    }

    await portfolioBridge.setPortfolio(portfolio.address);
    await lzV2App.setPortfolioBridge(portfolioBridge.address);

    await admin.sendTransaction({
        to: portfolioBridge.address,
        value: ethers.utils.parseEther("100"),
    });

    await portfolio.setPortfolioBridge(portfolioBridge.address);

    return portfolioBridge;
}

export const deployMockSolana = async () => {
    const lzEndpointSolana = await deployLZEndpoint(solChain.lzChainId);
    const lzV2AppSolana = await deployLZV2App(lzEndpointSolana);
    const PBridgeSolana = await ethers.getContractFactory("SolPortfolioBridgeMock");
    const pBridgeSolana = await PBridgeSolana.deploy(lzV2AppSolana.address);
    await lzV2AppSolana.setPortfolioBridge(pBridgeSolana.address);
    return {lzEndpointSolana, lzV2AppSolana, pBridgeSolana};
}

export const setRemoteBridges = async (
    sourcePortfolioBridge: PortfolioBridgeMain | SolPortfolioBridgeMock,
    destinationPorfolioBridge: PortfolioBridgeMain | SolPortfolioBridgeMock,
    sourceLzEndPoint: Contract | MockContract<Contract>,
    destLzEndPoint: Contract | MockContract<Contract>,
    sourceLzApp: LzV2App,
    destLzApp: LzV2App,
    sourceChain:any,
    remoteChain: any,
    userPaysFeeA: boolean = false,
    userPaysFeeB: boolean = false,
    maxDestinationGas = maxGas.PortfolioMain,
    bridge = 0
 ) => {

    const options = Options.newOptions().addExecutorLzReceiveOption(maxDestinationGas, 0).toHex();
    const enforcedOptionsRemote = [0, 1, 2].map((i) => {return {
        options: options,
        msgType: i,
        eid: remoteChain.lzChainId,
    }})
    const enforcedOptionsSource = [0, 1, 2].map((i) => {return {
        options: options,
        msgType: i,
        eid: sourceChain.lzChainId,
    }})
    const bytes32SourceAddr = ethers.utils.zeroPad(sourceLzApp.address, 32);
    const bytes32DestAddr = ethers.utils.zeroPad(destLzApp.address, 32);
    await sourcePortfolioBridge.setTrustedRemoteAddress(bridge, remoteChain.chainListOrgId, ethers.utils.hexZeroPad(ethers.utils.hexlify(remoteChain.lzChainId), 32), bytes32DestAddr, userPaysFeeA);
    // console.log("Setting portfolioBridgeSub dest id" , cChain.lzChainId, "Remote addr",portfolioBridgeMain.address)
    // const results = await portfolioBridgeSub.remoteParams(cChain.lzChainId);
    // console.log(results.lzRemoteChainId, results.chainListOrgChainId, results.gasForDestination);
    //TODO check to see if it is already set. Ignore if it is.
    await sourceLzEndPoint.setDestLzEndpoint(
        destLzApp.address,
        destLzEndPoint.address
    )
    await sourceLzApp.setPeer(remoteChain.lzChainId, bytes32DestAddr);
    await sourceLzApp.setEnforcedOptions(enforcedOptionsRemote);
    await destinationPorfolioBridge.setTrustedRemoteAddress(bridge, sourceChain.chainListOrgId, ethers.utils.hexZeroPad(ethers.utils.hexlify(sourceChain.lzChainId), 32), bytes32SourceAddr, userPaysFeeB);
    // console.log("Setting portfolioBridgeMain dest id", dexalotSubnet.lzChainId, "Remote addr",portfolioBridgeSub.address)
    await destLzEndPoint.setDestLzEndpoint(
        sourceLzApp.address,
        sourceLzEndPoint.address
    )
    await destLzApp.setPeer(sourceChain.lzChainId, bytes32SourceAddr);
    await destLzApp.setEnforcedOptions(enforcedOptionsSource);
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
// Only deploys a mainnet & Dexalot subnet for dual chain testing
// Default chain deployed is cChain
// Is also used for BnbChain & Subnet testing
export const deployCompletePortfolio = async (addMainnetAlot= false, mockLzEndPoint=false, chain =cChain ): Promise<PortfolioContracts> => {
    const gasSwap = { avax: 0.01, arb: 0.001, gun: 1 };
    const bridgeFee = { avax: "0", arb: "0", gun: "0" };
    const portfolioMainnet = await deployPortfolioMain(chain);

    const portfolioSub = await deployPortfolioSub(dexalotSubnet.native);
    const portfolioSubHelper = await deployPortfolioSubHelper();
    await portfolioSub.setPortfolioSubHelper(portfolioSubHelper.address);

    await portfolioSubHelper.addAdminAccountForRates(await portfolioSub.feeAddress(), "Fee Address");
    await portfolioSubHelper.addAdminAccountForRates(await portfolioSub.getTreasury(), "Treasury Address");


    let lzEndpointMainnet: Contract | MockContract<Contract>;
    let lzEndpointSub: Contract | MockContract<Contract>;

    if (mockLzEndPoint) {
        lzEndpointMainnet = await deployLZEndpointMock(chain.lzChainId);
        lzEndpointSub = await deployLZEndpointMock(dexalotSubnet.lzChainId);
    } else {
        lzEndpointMainnet = await deployLZEndpoint(chain.lzChainId);
        lzEndpointSub = await deployLZEndpoint(dexalotSubnet.lzChainId);
    }

    const lzV2AppMainnet = await deployLZV2App(lzEndpointMainnet);
    const portfolioBridgeMainnet = await deployPortfolioBridge(lzV2AppMainnet, portfolioMainnet) as PortfolioBridgeMain;
    const lzV2AppSubnet = await deployLZV2App(lzEndpointSub);
    const portfolioBridgeSub = await deployPortfolioBridge(lzV2AppSubnet, portfolioSub) as PortfolioBridgeSub;
    const delayedTransfers = await deployDelayedTransfers(portfolioBridgeSub);
    await portfolioBridgeSub.setDelayedTransfer(delayedTransfers.address);
    const inventoryManager = await deployInventoryManager(portfolioBridgeSub);
    await portfolioBridgeSub.setInventoryManager(inventoryManager.address);

    await setRemoteBridges(portfolioBridgeMainnet, portfolioBridgeSub, lzEndpointMainnet, lzEndpointSub, lzV2AppMainnet, lzV2AppSubnet, chain, dexalotSubnet);

    await addMainnetNativeCoin(portfolioMainnet, portfolioSub, chain, gasSwap.avax, bridgeFee.avax);

    const { other1, owner } = await getAccounts()
    const mainnetRFQ = await deployMainnetRFQ(other1, portfolioBridgeMainnet);
    const dexalotRouter = await deployDexalotRouter(owner, mainnetRFQ);

    const alot_token_symbol = "ALOT";
    const alot_token_decimals = 18;
    const ALOT = Utils.fromUtf8(alot_token_symbol);
    const alot = await deployMockToken(alot_token_symbol, alot_token_decimals);

    if (addMainnetAlot) {
        //ALOT needs to be added to PortfolioMain with the proper address which will also set its gasSwapRatio to 1
        await portfolioMainnet.addToken(ALOT, alot.address,  alot_token_decimals, alot_token_decimals, '0', ethers.utils.parseUnits('1', alot_token_decimals));
        // ALOT is automatically added and its swap ratio set to 1 in the Portfoliosub contract initialization
        // BUT ALOT needs to be added to PortfolioBridge independently with the Mainnet Address
        // PortfolioSub.addToken will ignore the call because it already has ALOT in its tokenList
        await portfolioBridgeSub.addToken(ALOT, alot.address, chain.chainListOrgId, alot_token_decimals, alot_token_decimals, 0, ALOT, 0);
    }

    const gasStation = await deployGasStation(portfolioSub);
    const portfolioMinter = await deployPortfolioMinterMock(portfolioSub, ethers.constants.AddressZero);

    return {
        portfolioMainnet: portfolioMainnet,
        portfolioSub,
        gasStation,
        portfolioMinter,
        delayedTransfers,
        inventoryManager,
        portfolioSubHelper,
        portfolioBridgeMainnet: portfolioBridgeMainnet,
        portfolioBridgeSub,
        lzEndpointMainnet: lzEndpointMainnet,
        lzEndpointSub,
        lzAppMainnet: lzV2AppMainnet,
        lzAppSub: lzV2AppSubnet,
        mainnetRFQ: mainnetRFQ,
        dexalotRouter,
        alot
    }
}

// TODO Do this with 1 inner loops
export const deployCompleteMultiChainPortfolio = async (addAvaxChainAlot= false, mockLzEndPoint=false ): Promise<MultiPortfolioContracts> => {

    const gasSwap = { avax: 0.01, arb: 0.001, base:0.001 , gun: 1 };
    const bridgeFee = { avax: "0", arb: "0", base: "0", gun: "0" };

    const portfolioContracts = await deployCompletePortfolio(addAvaxChainAlot, mockLzEndPoint);

    const portfolioArb = await deployPortfolioMain(arbitrumChain);
    const portfolioBase = await deployPortfolioMain(baseChain);
    const portfolioGun = await deployPortfolioMain(gunzillaSubnet);

    let lzEndpointArb: Contract | MockContract<Contract>;
    let lzEndpointBase: Contract | MockContract<Contract>;
    let lzEndpointGun: Contract | MockContract<Contract>;

    if (mockLzEndPoint) {
        lzEndpointArb = await deployLZEndpointMock(arbitrumChain.lzChainId);
        lzEndpointBase = await deployLZEndpointMock(baseChain.lzChainId);
        lzEndpointGun = await deployLZEndpointMock(gunzillaSubnet.lzChainId);
    } else {
        lzEndpointArb = await deployLZEndpoint(arbitrumChain.lzChainId);
        lzEndpointBase = await deployLZEndpoint(baseChain.lzChainId);
        lzEndpointGun = await deployLZEndpoint(gunzillaSubnet.lzChainId);
    }

    const lzV2AppArb = await deployLZV2App(lzEndpointArb);
    const portfolioBridgeArb = await deployPortfolioBridge(lzV2AppArb, portfolioArb) as PortfolioBridgeMain;
    const lzV2AppBase = await deployLZV2App(lzEndpointBase);
    const portfolioBridgeBase = await deployPortfolioBridge(lzV2AppBase, portfolioBase) as PortfolioBridgeMain;
    const lzV2AppGun = await deployLZV2App(lzEndpointGun);
    const portfolioBridgeGun = await deployPortfolioBridge(lzV2AppGun, portfolioGun) as PortfolioBridgeMain;

    // Mainnets to Subnet
    await setRemoteBridges(portfolioBridgeArb, portfolioContracts.portfolioBridgeSub, lzEndpointArb, portfolioContracts.lzEndpointSub, lzV2AppArb, portfolioContracts.lzAppSub, arbitrumChain, dexalotSubnet, true);
    await setRemoteBridges(portfolioBridgeGun, portfolioContracts.portfolioBridgeSub, lzEndpointGun, portfolioContracts.lzEndpointSub, lzV2AppGun, portfolioContracts.lzAppSub, gunzillaSubnet, dexalotSubnet, true);
    await setRemoteBridges(portfolioBridgeBase, portfolioContracts.portfolioBridgeSub, lzEndpointBase, portfolioContracts.lzEndpointSub, lzV2AppBase, portfolioContracts.lzAppSub, baseChain, dexalotSubnet, true);

    // Mainnets to Gun
    await setRemoteBridges(portfolioContracts.portfolioBridgeMainnet, portfolioBridgeGun, portfolioContracts.lzEndpointMainnet, lzEndpointGun, portfolioContracts.lzAppMainnet, lzV2AppGun, cChain, gunzillaSubnet);
    await setRemoteBridges(portfolioBridgeArb, portfolioBridgeGun, lzEndpointArb, lzEndpointGun, lzV2AppArb, lzV2AppGun, arbitrumChain, gunzillaSubnet);
    await setRemoteBridges(portfolioBridgeBase, portfolioBridgeGun, lzEndpointBase, lzEndpointGun, lzV2AppBase, lzV2AppGun, arbitrumChain, baseChain);

    //Arb to Avax Link
    await setRemoteBridges(portfolioBridgeArb, portfolioContracts.portfolioBridgeMainnet, lzEndpointArb, portfolioContracts.lzEndpointMainnet, lzV2AppArb, portfolioContracts.lzAppMainnet, arbitrumChain, cChain);


    await portfolioBridgeGun.setUserPaysFeeForDestination(lzBridge, cChain.chainListOrgId, true);
    await portfolioBridgeGun.setUserPaysFeeForDestination(lzBridge, arbitrumChain.chainListOrgId, true);
    await portfolioBridgeGun.setUserPaysFeeForDestination(lzBridge, baseChain.chainListOrgId, true);

    await addMainnetNativeCoin(portfolioArb, portfolioContracts.portfolioSub, arbitrumChain, gasSwap.arb, bridgeFee.arb);
    await addMainnetNativeCoin(portfolioBase, portfolioContracts.portfolioSub, baseChain, gasSwap.base, bridgeFee.base);
    await addMainnetNativeCoin(portfolioGun, portfolioContracts.portfolioSub, gunzillaSubnet, gasSwap.gun, bridgeFee.gun);

    const { other1 } = await getAccounts()

    const mainnetRFQArb = await deployMainnetRFQ(other1, portfolioBridgeArb);
    const mainnetRFQBase = await deployMainnetRFQ(other1, portfolioBridgeBase) ;
    const mainnetRFQGun = await deployMainnetRFQ(other1, portfolioBridgeGun) ;

    return {
        portfolioAvax: portfolioContracts.portfolioMainnet,
        portfolioArb,
        portfolioBase,
        portfolioGun,
        portfolioSub: portfolioContracts.portfolioSub,
        gasStation: portfolioContracts.gasStation,
        inventoryManager: portfolioContracts.inventoryManager,
        portfolioMinter: portfolioContracts.portfolioMinter,
        portfolioBridgeAvax: portfolioContracts.portfolioBridgeMainnet,
        portfolioBridgeArb,
        portfolioBridgeBase,
        portfolioBridgeGun,
        portfolioBridgeSub: portfolioContracts.portfolioBridgeSub,
        portfolioSubHelper: portfolioContracts.portfolioSubHelper,
        lzEndpointAvax: portfolioContracts.lzEndpointMainnet,
        lzEndpointArb,
        lzEndpointBase,
        lzEndpointGun,
        lzEndpointSub: portfolioContracts.lzEndpointSub,
        lzAppAvax: portfolioContracts.lzAppMainnet,
        lzAppArb: lzV2AppArb,
        lzAppBase: lzV2AppBase,
        lzAppGun: lzV2AppGun,
        lzAppSub: portfolioContracts.lzAppSub,
        mainnetRFQAvax: portfolioContracts.mainnetRFQ,
        mainnetRFQArb,
        mainnetRFQBase,
        mainnetRFQGun,
        alot: portfolioContracts.alot
    }
}

// Sets-up the native coin of the mainnet chain properly. Mainnet native is added to PortfolioMain at initialization automatically. Hence no need to do it here
export const addMainnetNativeCoin = async(portfolioMain: PortfolioMain, portfolioSub: PortfolioSub, chainDetails:any,  gasSwap:number, bridgeFee: string, auctionMode=0) => {
    // Set the swap Ratio for AVAX in main at deployment
    await portfolioMain.setBridgeParam(chainDetails.nativeBytes32, Utils.parseUnits(bridgeFee, chainDetails.evm_decimals), Utils.parseUnits(gasSwap.toString(), chainDetails.evm_decimals ), true);
    // Add Avax to portfolioSub that also sets its gasSwapRatio
    await portfolioSub.addToken(chainDetails.nativeBytes32, ethers.constants.AddressZero, chainDetails.chainListOrgId, chainDetails.evm_decimals, chainDetails.evm_decimals, auctionMode
        , Utils.parseUnits(bridgeFee, chainDetails.evm_decimals), Utils.parseUnits(gasSwap.toString(), chainDetails.evm_decimals ), chainDetails.nativeBytes32);
}

export const addBaseAndQuoteTokens = async (portfolioMain: PortfolioMain, portfolioSub: PortfolioSub, baseSymbol: string, baseAddr: string, baseDecimals: number, quoteSymbol: string, quoteAddr: string, quoteDecimals:number,  mode: number): Promise<void> => {

    const auctionMode: any = mode;

    // add token to portfolio subnet - don't add if it is the native ALOT or AVAX on subnet as they are already added
    if (baseSymbol != Utils.fromUtf8("ALOT") && baseSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding base to Sub" , baseSymbol);
        await portfolioSub.addToken(baseSymbol, baseAddr, cChain.chainListOrgId, baseDecimals, baseDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',baseDecimals), baseSymbol);
    }
    if (quoteSymbol != Utils.fromUtf8("ALOT") && quoteSymbol != Utils.fromUtf8("AVAX")){
        //console.log ("Adding quote to Sub" , quoteSymbol);
        await portfolioSub.addToken(quoteSymbol, quoteAddr, cChain.chainListOrgId, quoteDecimals, quoteDecimals, auctionMode, '0', ethers.utils.parseUnits('0.5',quoteDecimals), quoteSymbol);
    }

    // add token to portfolio mainnet - don't add if it is the native AVAX on mainnet as they are already added
    if (baseSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding base to Main" , baseSymbol);
        await portfolioMain.addToken(baseSymbol, baseAddr, baseDecimals, baseDecimals, '0', ethers.utils.parseUnits('0.5',baseDecimals));
    }
    if (quoteSymbol != Utils.fromUtf8("AVAX")) {
        //console.log ("Adding quote to Main" , quoteSymbol);
        await portfolioMain.addToken(quoteSymbol, quoteAddr,quoteDecimals, quoteDecimals,'0', ethers.utils.parseUnits('0.5',quoteDecimals));
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
    const bf = await portfolio.getNativeBridgeFee(0)
    return await from.sendTransaction({to: portfolio.address, value: Utils.toWei(amount).add(bf),
        gasLimit: 900000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei")});

}

export const depositNativeWithContractCall = async (portfolio: PortfolioMain, from:SignerWithAddress, amount: string, bridgeProvider = lzBridge): Promise<any> => {
    const bf = await portfolio.getNativeBridgeFee(bridgeProvider)
    //return await from.sendTransaction({from: from.address, to: portfolio.address, value: Utils.toWei(amount)});
    return await portfolio.connect(from).depositNative (from.address, bridgeProvider, { value: Utils.parseUnits(amount, 18).add(bf), gasLimit: 1000000});
}


export const depositToken = async (portfolio: PortfolioMain, from:SignerWithAddress, token: MockToken | MockWrappedToken, tokenDecimals: number, tokenSymbol: string, amount: string, bridgeProvider = lzBridge): Promise<any> => {
    await token.connect(from).approve(portfolio.address, Utils.parseUnits(amount, tokenDecimals), {
        gasLimit: 2000000 //, maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
    });

    const bf = await portfolio.getNativeBridgeFee(bridgeProvider);

    return await portfolio.connect(from).depositToken(from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider, {
        gasLimit: 2000000, value: bf //, maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
    });
}


export const withdrawToken = async (portfolio: PortfolioSub, from:SignerWithAddress, tokenSymbol: string, tokenDecimals: number, amount: string, bridgeProvider = lzBridge): Promise<any> => {
     return await (<any> portfolio).connect(from)["withdrawToken(address,bytes32,uint256,uint8,uint32)"]( from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider, cChain.chainListOrgId, {
        gasLimit: 1000000, maxFeePerGas: ethers.utils.parseUnits("5", "gwei"),
    });
}

export const withdrawTokenToDst = async (portfolio: PortfolioSub, from:SignerWithAddress, tokenSymbol: string, tokenDecimals: number, amount: string, dstChainId: number , bridgeProvider = lzBridge): Promise<any> => {
    return await (<any> portfolio).connect(from)["withdrawToken(address,bytes32,uint256,uint8,uint32)"]( from.address, tokenSymbol, Utils.parseUnits(amount, tokenDecimals), bridgeProvider, dstChainId);
}


export const setHardhatBalance = async (trader: SignerWithAddress, newBalance: BigNumber) => {
    const newBalanceHex = newBalance.toHexString().replace("0x0", "0x");
    await ethers.provider.send("hardhat_setBalance", [
        trader.address,
        newBalanceHex,
    ]);
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
