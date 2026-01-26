// import Utils from './utils';


// import * as f from "./MakeTestSuite";
// import { DexalotRFQ, MockToken, OmniVault, OmniVaultCreator, OmniVaultExecutor, OmniVaultExecutorMain, OmniVaultRegistry, OmniVaultShare, PortfolioMain, PortfolioSub } from '../typechain-types';
// import { ethers } from 'ethers';
// import { network, tracer } from 'hardhat';
// import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

// describe("OmniVaults", () => {
//   let owner: SignerWithAddress;
//   let omnitraderEOA: SignerWithAddress;
//   let proposer: SignerWithAddress;
//   let trader1: SignerWithAddress;
//   let trader2: SignerWithAddress;

//   let omniVaultRegistry: OmniVaultRegistry;
//   let omniVaultCreator: OmniVaultCreator;
//   let omniVaultShare: OmniVaultShare;
//   let omniVaultExecutor: OmniVaultExecutor;
//   let omniVaultExecutorMain: OmniVaultExecutorMain;
//   let omniVault: OmniVault;
//   let dexalotRFQ: DexalotRFQ;
//   let portfolioMain: PortfolioMain;
//   let portfolioSub: PortfolioSub;

//   let mockUSDC: MockToken;
//   let mockZRO: MockToken;

//   let requestId: string;

//   beforeEach(async function () {
//       const accounts = await f.getAccounts();

//       owner = accounts.owner;
//       omnitraderEOA = accounts.other1;
//       proposer = accounts.other2;
//       trader1 = accounts.trader1;
//       trader2 = accounts.trader2;
//       tracer.enabled = false;


//       const { cChain } = f.getChains();

//       const config = await f.deployVaultConfigContracts();

//       omniVaultRegistry = config.omniVaultRegistry;
//       omniVaultCreator = config.omniVaultCreator;

//       console.log("Deployed vault config contracts");
//       mockZRO = await f.deployMockToken("ZRO", 18);
//       mockUSDC = await f.deployMockToken("USDC", 6);
//       console.log("Deployed mock tokens");

//       console.log("Deploying mainnet and L1 portfolio contracts");
//       const portfolioContracts = await f.deployCompletePortfolio(true);
//       const orderBooks = await f.deployOrderBooks();
//       const exchange = await f.deployExchangeSub(portfolioContracts.portfolioSub, orderBooks)
//       const tradePairs = await f.deployTradePairs(orderBooks, portfolioContracts.portfolioSub, exchange);
//       console.log("Deployed mainnet and L1 portfolio contracts");
//       portfolioMain = portfolioContracts.portfolioMainnet;
//       portfolioSub = portfolioContracts.portfolioSub;

//       await f.addToken(portfolioContracts.portfolioMainnet, portfolioContracts.portfolioSub, mockZRO, 0.5, 0, true, 0);
//       await f.addToken(portfolioContracts.portfolioMainnet, portfolioContracts.portfolioSub, mockUSDC, 0.5, 0, true, 0);

//       await omniVaultCreator.setFeeToken(mockUSDC.address);

//       await mockZRO.mint(await proposer.getAddress(), ethers.utils.parseUnits("1000000", 18));
//       await mockUSDC.mint(await proposer.getAddress(), ethers.utils.parseUnits("1000000", 6));
//       await mockZRO.mint(await trader1.getAddress(), ethers.utils.parseUnits("1000000", 18));
//       await mockUSDC.mint(await trader1.getAddress(), ethers.utils.parseUnits("1000000", 6));

//       await mockZRO.connect(proposer).approve(omniVaultCreator.address, ethers.constants.MaxUint256);
//       await mockUSDC.connect(proposer).approve(omniVaultCreator.address, ethers.constants.MaxUint256);

//       const signature = await proposer.signMessage(await omniVaultCreator.RISK_DISCLOSURE());

//       await omniVaultCreator.connect(proposer).acknowledgeRiskDisclosure(signature);

//       const tx = await omniVaultCreator.connect(proposer).openPairVault(
//         [mockZRO.address],
//         [mockUSDC.address],
//         [network.config.chainId || cChain.chainListOrgId],
//         ethers.utils.parseUnits("1000", 18),
//         ethers.utils.parseUnits("1000", 6)
//       )
//       const receipt = await tx.wait();
//       requestId = ethers.constants.HashZero;
//       for (const event of receipt.events || []) {
//         if (event.event === "VaultCreationRequest") {
//           requestId = event.args ? event.args.requestId : ethers.constants.HashZero;
//         }
//       }
//       console.log("Opened vault creation request with id:", requestId);

//       const vaultContracts = await f.deployVault(portfolioContracts.lzEndpointMainnet.address, omniVaultRegistry, omniVaultCreator, portfolioContracts.dexalotRouter, portfolioSub);

//       omniVaultShare = vaultContracts.omniVaultShare;
//       omniVaultExecutor = vaultContracts.omniVaultExecutor;
//       omniVaultExecutorMain = vaultContracts.omniVaultExecutorMain;
//       omniVault = vaultContracts.omniVault;
//       dexalotRFQ = vaultContracts.dexalotRFQ;

//       const trustedMainnetContracts = [dexalotRFQ.address, portfolioContracts.portfolioMainnet.address, omniVault.address];
//       for (const contractAddress of trustedMainnetContracts) {
//         // 4 = native + erc20
//         await omniVaultExecutorMain.setTrustedContract(contractAddress, 4);
//       }

//       // TODO: add incentive distributor
//       const trustedL1Contracts = [portfolioContracts.portfolioSub.address, tradePairs.address];
//       for (const contractAddress of trustedL1Contracts) {
//         // 4 = native + erc20
//         await omniVaultExecutor.setTrustedContract(contractAddress, 4);
//       }

//       await omniVaultExecutorMain.setPortfolioMain(portfolioContracts.portfolioMainnet.address);

//       await omniVault.addTokenDetails(Utils.fromUtf8("ZRO"), {
//         tokenType: 1,
//         precision: 18,
//         minPerDeposit: "1",
//         maxPerDeposit: "10000",
//       })

//       await omniVault.addTokenDetails(Utils.fromUtf8("USDC"), {
//         tokenType: 2,
//         precision: 6,
//         minPerDeposit: "1",
//         maxPerDeposit: "10000",
//       })

//       await f.depositToken(portfolioMain, trader1, mockZRO, 18, Utils.fromUtf8("ZRO"), "10000");
//       await f.depositToken(portfolioMain, trader1, mockUSDC, 6, Utils.fromUtf8("USDC"), "10000");

//       await mockZRO.connect(trader1).approve(omniVault.address, ethers.constants.MaxUint256);
//       await mockUSDC.connect(trader1).approve(omniVault.address, ethers.constants.MaxUint256);
//       // send native to omnivaultexecutorMain
//       await owner.sendTransaction({
//         to: omniVaultExecutorMain.address,
//         value: ethers.utils.parseEther("10")
//       });
//     });

//     it("Should deposit into Omnivault and settle via OmniTrader", async () => {
//       // console.log(await mockZRO.balanceOf(omniVaultCreator.address));
//       // console.log(await mockUSDC.balanceOf(omniVaultCreator.address));
//       // await omniVaultCreator.acceptAndFundVault(requestId, omniVault.address, [ethers.utils.parseUnits("500", 18), ethers.utils.parseUnits("1000", 18)]);
//       // await omniVaultShare.connect(proposer).approve(omniVault.address, ethers.constants.MaxUint256);
//       // let tx = await omniVault.connect(proposer).requestWithdrawal(ethers.utils.parseUnits("100", 18));
//       // const receipt = await tx.wait();
//       // let withdrawalRequestId = ethers.constants.HashZero;
//       // for (const event of receipt.events || []) {
//       //   if (event.event === "TransferRequestUpdate") {
//       //     withdrawalRequestId = event.args ? event.args.requestId : ethers.constants.HashZero;
//       //   }
//       // }
//       let tx = await omniVault.connect(trader1).requestDeposit([Utils.fromUtf8("USDC")], [ethers.utils.parseUnits("50", 6)]);
//       const receipt2 = await tx.wait();
//       let depositRequestId = ethers.constants.HashZero;
//       for (const event of receipt2.events || []) {
//         if (event.event === "TransferRequestUpdate") {
//           depositRequestId = event.args ? event.args.requestId : ethers.constants.HashZero;
//           console.log("Deposit request id:", depositRequestId);
//         }
//       }
//       await omniVault.bulkSettleState([{depositRequestId, depositShares: 100000}], [], []);

//       console.log(await mockZRO.balanceOf(await proposer.getAddress()));
//       // await omniVaultExecutorMain.connect(omnitraderEOA).approveToken(mockZRO.address, omniVault.address, ethers.utils.parseUnits("100", 18));
//       // await omniVaultExecutorMain.connect(omnitraderEOA).settleTransfers([depositRequestId], [ethers.utils.parseUnits("10", 18)], [withdrawalRequestId], [ethers.utils.parseUnits("1", 18)], 0);
//       console.log(await mockZRO.balanceOf(await proposer.getAddress()));
//       console.log(await omniVaultShare.balanceOf(await trader1.getAddress()));
//       await omniVault.connect(proposer).claimWithdrawal(withdrawalRequestId);
//       console.log(await mockZRO.balanceOf(await proposer.getAddress()));

//       await omniVaultExecutorMain.connect(omnitraderEOA).approveToken(mockZRO.address, portfolioMain.address, ethers.utils.parseUnits("20", 18));
//       tracer.enabled = true;
//       // tracer.enableAllOpcodes = true;
//       await omniVaultExecutorMain.connect(omnitraderEOA).depositToken(ethers.utils.formatBytes32String("ZRO"), ethers.utils.parseUnits("20", 18), 0, 0, { gasLimit: 10000000 });
//       tracer.enabled = false;
//       console.log(await portfolioSub.getBalance(omniVaultExecutorMain.address, ethers.utils.formatBytes32String("ZRO")));


//       // console.log(receipt.events);
//     });
// });
