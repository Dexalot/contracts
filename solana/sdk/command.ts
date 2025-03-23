export enum Commands {
  Initialize = "1. Initialize",
  InitializeVaults = "2. Initialize Vaults",
  InitializeLayerZero = "3. Initialize Layerzero",

  // Global configuration
  SetDefaultChainEid = "1.  Set Default Chain EID",
  SetAirdropAmount = "2.  Set Airdrop Amount",
  PauseProgram = "3.  Pause Program",
  UnpauseProgram = "4.  Unpause Program",
  EnableAllowDeposit = "5.  Enable Allow Deposit",
  DisableAllowDeposit = "6.  Disable Allow Deposit",
  EnableNativeDeposits = "7.  Enable Native Deposits",
  DisableNativeDeposits = "8.  Disable Native Deposits",
  SetSwapSigner = "9.  Set swap signer",
  GetGlobalConfig = "10. Get global config",

  // Layerzero
  SetRemote = "1. Set Remote",
  GetRemote = "2. Get Remote",
  GetPortfolioPDA = "3. Get Portfolio PDA",

  // Wallet & Balance
  CreateWallet = "1. Create Wallet",
  SetActiveWallet = "2. Set Active Wallet",
  CreateWalletFileFromSecretKey = "3. Create Wallet File from Secret Key",
  PrintWallet = "4. Print Wallet Address",
  ShowBalance = "5. Show Balance of active wallet",
  Airdrop = "6. Airdrop SOL",

  // Account management
  AddAdmin = "1. Add Admin",
  RemoveAdmin = "2. Remove Admin",
  BanAccount = "3. Ban Account",
  UnbanAccount = "4. Unban Account",
  AddRebalancer = "5. Add Rebalancer",
  RemoveRebalancer = "6. Remove Rebalancer",

  // SOL vaults
  SolVaultBalance = "1. Get SOL Vault Balance",
  SolUserFundsVaultBalance = "2. Get SOL User Funds Vault Balance",
  AirdropVaultBalance = "3. Get Airdrop Vault Balance",

  // Token operations
  CreateNewToken = "1.  Create New Token",
  ListSupported = "2.  List Supported Tokens",
  AddToken = "3.  Add Token (only admin)",
  TokenDetails = "4.  Get Token Details",
  RemoveToken = "5.  Remove Token (only admin and paused)",
  MintSPLToken = "6.  Mint SPL token (only admin)",
  GetSPLTokenBalance = "7.  Get SPL token balance of active wallet",
  GetSPLTokenVaultBalance = "8.  Get program SPL token balance",
  GetSPLTokenUserFundsVaultBalance = "9.  Get program SPL token user funds balance",
  CheckSPLTokenBalanceOfPubkey = "10. Check SPL token balance of pubkey",
  CreateAccount = "11. Create account",

  // Deposits
  DepositSol = "1. Deposit SOL (only unpaused)",
  DepositSPL = "2. Deposit SPL token (only unpaused)",
  DepositAirdrop = "3. Deposit Airdrop (only unpaused)",

  SimpleSwap = "1. Simple swap",
  PartialSwap = "2. Partial swap",
  CrossSwap = "3. Cross swap",
  RemoveFromSwapQueue = "4. Remove from swap queue",
  UpdateSwapExpiry = "5. Update swap expiry (only rebalancer)",

  ClaimSplBalance = "1. Claim SPL balance",
  ClaimNativeBalance = "2. Claim native balance",

  FundSol = "1. Fund SOL (only rebalancer)",
  FundSpl = "2. Fund SPL (only rebalancer)",

  GenerateIntegrationTestsRA = "1. Generate intergration tests remaining accounts",
}

enum Sections {
  initialize = "1.  Initialize",
  globalConfig = "2.  Global configuration (admin only)",
  layerZero = "3.  Layerzero",
  walletAndBalance = "4.  Wallet",
  accountManagement = "5.  Account management (admin only)",
  solVault = "6.  SOL vaults",
  tokenOptions = "7.  Token operations",
  deposits = "8.  Deposits",
  swaps = "9.  Swaps",
  claimBalances = "10. Claim balances (rebalancer only)",
  fund = "11. Fund program (rebalancer only)",
  tests = "12. Test Helper",
  exit = "13. Exit",
}

// First, let's create a mapping of sections to their commands
const sectionCommands = {
  [Sections.initialize]: [
    Commands.Initialize,
    Commands.InitializeVaults,
    Commands.InitializeLayerZero,
  ],
  [Sections.globalConfig]: [
    Commands.SetDefaultChainEid,
    Commands.SetAirdropAmount,
    Commands.PauseProgram,
    Commands.UnpauseProgram,
    Commands.EnableAllowDeposit,
    Commands.DisableAllowDeposit,
    Commands.EnableNativeDeposits,
    Commands.DisableNativeDeposits,
    Commands.SetSwapSigner,
    Commands.GetGlobalConfig,
  ],
  [Sections.layerZero]: [
    Commands.SetRemote,
    Commands.GetRemote,
    Commands.GetPortfolioPDA,
  ],
  [Sections.walletAndBalance]: [
    Commands.CreateWallet,
    Commands.SetActiveWallet,
    Commands.CreateWalletFileFromSecretKey,
    Commands.PrintWallet,
    Commands.ShowBalance,
    Commands.Airdrop,
  ],
  [Sections.accountManagement]: [
    Commands.AddAdmin,
    Commands.RemoveAdmin,
    Commands.BanAccount,
    Commands.UnbanAccount,
    Commands.AddRebalancer,
    Commands.RemoveRebalancer,
  ],
  [Sections.solVault]: [
    Commands.SolVaultBalance,
    Commands.SolUserFundsVaultBalance,
    Commands.AirdropVaultBalance,
  ],
  [Sections.tokenOptions]: [
    Commands.CreateNewToken,
    Commands.ListSupported,
    Commands.AddToken,
    Commands.TokenDetails,
    Commands.RemoveToken,
    Commands.MintSPLToken,
    Commands.GetSPLTokenBalance,
    Commands.GetSPLTokenVaultBalance,
    Commands.GetSPLTokenUserFundsVaultBalance,
    Commands.CheckSPLTokenBalanceOfPubkey,
    Commands.CreateAccount,
  ],
  [Sections.deposits]: [
    Commands.DepositSol,
    Commands.DepositSPL,
    Commands.DepositAirdrop,
  ],
  [Sections.swaps]: [
    Commands.SimpleSwap,
    Commands.PartialSwap,
    Commands.CrossSwap,
    Commands.RemoveFromSwapQueue,
    Commands.UpdateSwapExpiry,
  ],
  [Sections.claimBalances]: [
    Commands.ClaimSplBalance,
    Commands.ClaimNativeBalance,
  ],
  [Sections.fund]: [Commands.FundSol, Commands.FundSpl],
  [Sections.tests]: [Commands.GenerateIntegrationTestsRA],
  [Sections.exit]: [],
};

export const printSections = () => {
  console.log("================================================");
  Object.values(Sections).forEach((section) => {
    console.log(section);
  });
  console.log("================================================");
};

export const printCommands = (sectionNumber: string) => {
  console.log("================================================");
  const section = Object.values(Sections).find((s) =>
    s.startsWith(sectionNumber + ".")
  );
  if (!section) {
    console.log("Invalid section number");
    return;
  }

  console.log(`== ${section} ==`);
  sectionCommands[section].forEach((cmd) => console.log(cmd));
  console.log("================================================");
};
