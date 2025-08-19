import {
  AnchorProvider,
  Program,
  setProvider,
  Wallet,
} from "@coral-xyz/anchor";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { addAdmin, removeAdmin } from "./handlers/admin";
import { banAccount, unbanAccount } from "./handlers/ban";
import {
  depositSPLToken,
  depositToAirdropVault,
  depositToSolVault,
} from "./handlers/deposit";
import {
  disableAllowDeposit,
  disableNativeDeposits,
  enableAllowDeposit,
  enableNativeDeposits,
  getGlobalConfig,
  pauseProgram,
  setAirdropAmount,
  setDefaultChainEid,
  setSwapSigner,
  unpauseProgram,
} from "./handlers/globalConfig";
import { initialize } from "./handlers/initialize";
import { getPortfolioPDA, getRemote, setRemote } from "./handlers/layerzero";
import {
  getAirdropVaultBalance,
  getSolUserFundsVaultBalance,
  getSolVaultBalance,
} from "./handlers/solVaults";
import {
  addToken,
  checkIsTokenSupproted,
  createNewToken,
  getSPLTokenBalanceOfActiveWallet,
  getSPLTokenBalanceOfPubkey,
  getSPLTokenUserFundsVaultBalance,
  getSPLTokenVaultBalance,
  getTokenDetails,
  mintSPLToken,
  removeToken,
} from "./handlers/token";
import { createAccount } from "./handlers/create";
import {
  airdrop,
  createKeypair,
  createKeypairFileFromSecretKey,
  loadKeypair,
  printWallet,
  showBalance,
} from "./handlers/wallet";

import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import IDL from "../target/idl/dexalot.json";
import { red } from "kleur";
import * as fs from "fs";
import {
  initOappNonce,
  initReceiveLibrary,
  initSendLibrary,
  initUlnConfig,
  remotePeers,
  setOappExecutor,
  setReceiveLibrary,
  setSendLibrary,
} from "./layerzero";
import { arrayify, hexZeroPad } from "@ethersproject/bytes";
import { simpleSwap } from "./handlers/swap";
import { crossSwap } from "./handlers/crossSwap";
import { removeFromSwapQueue } from "./handlers/removeFromSwapQueue";
import { addRebalancer, removeRebalancer } from "./handlers/rebalancer";
import { updateSwapExpiry } from "./handlers/updateSwapExpiry";
import {
  claimAirdropBalance,
  claimNativeBalance,
  claimSplBalance,
} from "./handlers/claimBalance";
import { fundSol, fundSpl } from "./handlers/fund";
import { generateIntegrationTestsRemainingAccounts } from "./handlers/testsRA";
import { addDestination } from "./handlers/addDestination";

const DEFAULT_WALLET_PATH = "./admin.json";

class Interactor {
  private wallet: Wallet | null = null;
  private provider: AnchorProvider | null = null;
  private connection: Connection | null = null;
  private program: Program<any> | null = null;
  private keypair: Keypair | null = null;

  constructor() {
    this.init_interactor();
  }

  async init_interactor() {
    try {
      await this.createDefaultWallet();

      await this.setupDevnetProvider();
      if (this.provider) {
        setProvider(this.provider);
      }
      await this.setProgram();
    } catch (error) {
      console.error(red(`Error initializing: ${error}\n\n`));
    }
  }

  async setProgram() {
    if (!this.provider) {
      console.error(red("Provider not found"));
      return;
    }
    this.program = new Program(IDL as any, this.provider);
  }

  async loadWallet() {
    try {
      this.keypair = await loadKeypair("");
      this.wallet = new Wallet(this.keypair);
    } catch (error) {
      console.error(red(`Error setting wallet: ${error}\n\n`));
    }
  }

  async createWallet() {
    try {
      this.keypair = await createKeypair("");
      this.wallet = new Wallet(this.keypair);
    } catch (error) {
      console.error(red(`Error setting wallet: ${error}\n\n`));
    }
  }

  async createKeypairFileFromSecretKey() {
    try {
      await createKeypairFileFromSecretKey();
    } catch (error) {
      console.error(red(`Error creating keypair file: ${error}\n\n`));
    }
  }

  async createDefaultWallet() {
    try {
      if (fs.existsSync(DEFAULT_WALLET_PATH)) {
        this.keypair = await loadKeypair(DEFAULT_WALLET_PATH);
      } else {
        this.keypair = await createKeypair(DEFAULT_WALLET_PATH);
      }

      this.wallet = new Wallet(this.keypair);
    } catch (error) {
      console.error(red(`Error setting wallet: ${error}\n\n`));
    }
  }

  setupDevnetProvider = async () => {
    const connection = new Connection(clusterApiUrl("devnet"));
    if (!this.wallet) {
      console.error(red("Wallet not found"));
      return;
    }
    const provider = new AnchorProvider(
      connection,
      this.wallet,
      { commitment: "confirmed" } // You can customize options
    );
    this.provider = provider;
    this.connection = connection;
  };

  printWallet = async () => {
    if (!this.wallet) {
      console.error(red("Wallet not found"));
      return;
    }
    await printWallet(this.wallet);
  };

  requestAirdrop = async () => {
    if (!this.wallet || !this.provider || !this.connection) {
      console.error(red("Wallet, provider, or connection not found"));
      return;
    }
    try {
      await airdrop(this.wallet, this.provider, this.connection);
    } catch (error) {
      console.error(red("Error requesting airdrop\n\n"));
    }
  };

  showBalance = async () => {
    if (!this.wallet || !this.provider || !this.connection) {
      console.error(red("Wallet, provider, or connection not found\n\n"));
      return;
    }
    try {
      await showBalance(this.wallet, this.provider);
    } catch (error) {
      console.error(red("Error showing balance\n\n"));
    }
  };

  checkIsTokenSupproted = async () => {
    if (!this.program || !this.connection) {
      console.error(red("Program not found\n\n"));
      return;
    }
    try {
      await checkIsTokenSupproted(this.program, this.connection);
    } catch (error) {
      console.error(red("Error checking token\n\n"));
    }
  };

  getTokenDetails = async () => {
    if (!this.program || !this.connection) {
      console.error(red("Program not found\n\n"));
      return;
    }
    try {
      await getTokenDetails(this.program);
    } catch (error) {
      console.error(red("Error getting token details\n\n"));
    }
  };

  addToken = async () => {
    if (!this.program || !this.connection || !this.wallet || !this.keypair) {
      console.error(red("Program, connection, or wallet not found\n\n"));
      return;
    }
    try {
      await addToken(this.program, this.connection, this.keypair);
    } catch (error) {
      console.error(red(`Error adding token: ${error}\n\n`));
    }
  };

  removeToken = async () => {
    if (!this.program || !this.connection || !this.wallet || !this.keypair) {
      console.error(red("Program, connection, or wallet not found\n\n"));
      return;
    }
    try {
      await removeToken(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error removing token: ${error}\n\n`));
    }
  };

  getSolVaultBalance = async () => {
    if (!this.connection || !this.program) {
      console.error(red("Connection not found\n\n"));
      return;
    }
    try {
      await getSolVaultBalance(this.connection, this.program);
    } catch (error) {
      console.error(red("Error getting program balance\n\n"));
    }
  };

  getSPLTokenBalanceOfActiveWallet = async () => {
    if (!this.program || !this.connection || !this.wallet || !this.keypair) {
      console.error(red("Program, connection, or wallet not found\n\n"));
      return;
    }
    try {
      await getSPLTokenBalanceOfActiveWallet(
        this.program,
        this.keypair,
        this.connection
      );
    } catch (error) {
      console.error(red(`Error checking SPL token balance: ${error}\n\n`));
    }
  };

  depositToSolVault = async () => {
    if (!this.program || !this.keypair || !this.connection) {
      console.error(red("Program, keypair, or connection not found\n\n"));
      return;
    }
    try {
      await depositToSolVault(this.connection, this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error depositing SOL: ${error}\n\n`));
    }
  };

  depositSPLToken = async () => {
    if (!this.program || !this.connection || !this.wallet || !this.keypair) {
      console.error(red("Program, connection, or wallet not found\n\n"));
      return;
    }
    try {
      await depositSPLToken(this.program, this.keypair, this.connection);
    } catch (error) {
      console.error(red(`Error depositing SPL token: ${error}\n\n`));
    }
  };

  mintSPLToken = async () => {
    if (!this.program || !this.connection || !this.wallet || !this.keypair) {
      console.error(red("Program, connection, or wallet not found\n\n"));
      return;
    }
    try {
      await mintSPLToken(this.program, this.keypair, this.connection);
    } catch (error) {
      console.error(red(`Error minting SPL token: ${error}\n\n`));
    }
  };

  getSPLTokenVaultBalance = async () => {
    if (!this.program || !this.connection || !this.wallet || !this.keypair) {
      console.error(red("Program, connection, or wallet not found\n\n"));
      return;
    }
    try {
      await getSPLTokenVaultBalance(
        this.program,
        this.keypair,
        this.connection
      );
    } catch (error) {
      console.error(red(`Error getting SPL token vault balance: ${error}\n\n`));
    }
  };

  getSPLTokenUserFundsVaultBalance = async () => {
    if (!this.program || !this.connection || !this.wallet || !this.keypair) {
      console.error(red("Program, connection, or wallet not found\n\n"));
      return;
    }
    try {
      await getSPLTokenUserFundsVaultBalance(
        this.program,
        this.keypair,
        this.connection
      );
    } catch (error) {
      console.error(
        red(`Error getting SPL token user funds vault balance: ${error}\n\n`)
      );
    }
  };

  addAdmin = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await addAdmin(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error adding admin: ${error}\n\n`));
    }
  };

  removeAdmin = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await removeAdmin(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error removing admin: ${error}\n\n`));
    }
  };

  pauseProgram = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await pauseProgram(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error pausing program: ${error}\n\n`));
    }
  };

  unpauseProgram = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await unpauseProgram(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error unpausing program: ${error}\n\n`));
    }
  };

  banAccount = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await banAccount(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error banning account: ${error}\n\n`));
    }
  };

  unbanAccount = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await unbanAccount(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error unbanning account: ${error}\n\n`));
    }
  };

  initialize = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await initialize(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error initializing: ${error}\n\n`));
    }
  };

  initializeLayerzero = async () => {
    if (!this.connection || !this.keypair) {
      console.error(red("Connection or keypair not found\n\n"));
      return;
    }
    try {
      for (const [remoteStr, remotePeer] of Object.entries(remotePeers)) {
        const remotePeerBytes = arrayify(hexZeroPad(remotePeer, 32));
        const remote = parseInt(remoteStr) as EndpointId;

        // await setPeers(connection, signer, remote, remotePeerBytes);
        await initSendLibrary(this.connection, this.keypair, remote);
        await setSendLibrary(this.connection, this.keypair, remote);

        await initReceiveLibrary(this.connection, this.keypair, remote);
        await setReceiveLibrary(this.connection, this.keypair, remote);

        await initOappNonce(
          this.connection,
          this.keypair,
          remote,
          remotePeerBytes
        );
        await initUlnConfig(
          this.connection,
          this.keypair,
          this.keypair,
          remote
        );
        await setOappExecutor(this.connection, this.keypair, remote);
      }
    } catch (error) {
      console.error(red(`Error initializing layerzero: ${error}\n\n`));
    }
  };

  setRemote = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await setRemote(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error setting remote: ${error}\n\n`));
    }
  };

  getRemote = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await getRemote(this.program);
    } catch (error) {
      console.error(red(`Error getting remote: ${error}\n\n`));
    }
  };

  getPortfolioPDA = async () => {
    try {
      console.log(getPortfolioPDA().toBase58());
    } catch (error) {
      console.error(red(`Error getting portfolio PDA: ${error}\n\n`));
    }
  };

  setDefaultChainEid = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await setDefaultChainEid(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error setting default chain EID: ${error}\n\n`));
    }
  };

  createNewToken = async () => {
    if (!this.connection || !this.keypair) {
      console.error(red("Connection or keypair not found\n\n"));
      return;
    }
    try {
      await createNewToken(this.connection, this.keypair);
    } catch (error) {
      console.error(red(`Error creating new token: ${error}\n\n`));
    }
  };

  createAccount = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await createAccount(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error creating account: ${error}\n\n`));
    }
  };

  getAirdropVaultBalance = async () => {
    if (!this.connection || !this.program) {
      console.error(red("Connection or program not found\n\n"));
      return;
    }
    try {
      await getAirdropVaultBalance(this.connection, this.program);
    } catch (error) {
      console.error(red(`Error getting airdrop balance: ${error}\n\n`));
    }
  };

  depositToAirdropVault = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await depositToAirdropVault(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error depositing airdrop: ${error}\n\n`));
    }
  };

  setAirdropAmount = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await setAirdropAmount(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error setting airdrop amount: ${error}\n\n`));
    }
  };

  getSPLTokenBalanceOfPubkey = async () => {
    if (!this.program || !this.connection) {
      console.error(red("Program or connection not found\n\n"));
      return;
    }
    try {
      await getSPLTokenBalanceOfPubkey(this.program, this.connection);
    } catch (error) {
      console.error(
        red(`Error checking SPL token balance of pubkey: ${error}\n\n`)
      );
    }
  };

  enableAllowDeposit = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await enableAllowDeposit(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error enabling allow deposits: ${error}\n\n`));
    }
  };

  disableAllowDeposit = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await disableAllowDeposit(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error disabling allow deposits: ${error}\n\n`));
    }
  };

  enableNativeDeposits = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await enableNativeDeposits(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error enabling native deposits: ${error}\n\n`));
    }
  };

  disableNativeDeposits = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await disableNativeDeposits(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error disabling native deposits: ${error}\n\n`));
    }
  };

  simpleSwap = async () => {
    if (!this.connection || !this.program || !this.keypair) {
      console.error(red("Connection, program, or keypair not found\n\n"));
      return;
    }
    try {
      await simpleSwap(this.connection, this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error executing simple swap: ${error}\n\n`));
    }
  };

  crossSwap = async () => {
    if (!this.connection || !this.program || !this.keypair) {
      console.error(red("Connection, program, or keypair not found\n\n"));
      return;
    }
    try {
      await crossSwap(this.connection, this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error executing cross swap: ${error}\n\n`));
    }
  };

  setSwapSigner = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await setSwapSigner(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error setting swap signer: ${error}\n\n`));
    }
  };

  removeFromSwapQueue = async () => {
    if (!this.connection || !this.program || !this.keypair) {
      console.error(red("Connection, program, or keypair not found\n\n"));
      return;
    }
    try {
      await removeFromSwapQueue(this.connection, this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error removing from swap queue: ${error}\n\n`));
    }
  };

  addRebalancer = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await addRebalancer(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error adding rebalancer: ${error}\n\n`));
    }
  };

  removeRebalancer = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await removeRebalancer(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error removing rebalancer: ${error}\n\n`));
    }
  };

  updateSwapExpiry = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await updateSwapExpiry(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error updating swap expiry: ${error}\n\n`));
    }
  };

  claimSplBalance = async () => {
    if (!this.connection || !this.program || !this.keypair) {
      console.error(red("Connection, program, or keypair not found\n\n"));
      return;
    }
    try {
      await claimSplBalance(this.connection, this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error claiming SPL balance: ${error}\n\n`));
    }
  };

  claimNativeBalance = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program, or keypair not found\n\n"));
      return;
    }
    try {
      await claimNativeBalance(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error claiming SOL balance: ${error}\n\n`));
    }
  };

  getGlobalConfig = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await getGlobalConfig(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error getting global config: ${error}\n\n`));
    }
  };

  fundSol = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program, or keypair not found\n\n"));
      return;
    }
    try {
      await fundSol(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error funding SOL balance: ${error}\n\n`));
    }
  };

  fundSpl = async () => {
    if (!this.connection || !this.program || !this.keypair) {
      console.error(red("Connection, program, or keypair not found\n\n"));
      return;
    }
    try {
      await fundSpl(this.connection, this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error funding SPL balance: ${error}\n\n`));
    }
  };

  generateTestRemainingAccounts = async () => {
    if (!this.connection || !this.program || !this.keypair) {
      console.error(red("Connection, program, or keypair not found\n\n"));
      return;
    }
    try {
      await generateIntegrationTestsRemainingAccounts(
        this.connection,
        this.keypair,
        this.program
      );
    } catch (error) {
      console.error(red(`Error generating accounts: ${error}\n\n`));
    }
  };

  getSolUserFundsVaultBalance = async () => {
    if (!this.connection || !this.program) {
      console.error(red("Connection or program not found\n\n"));
      return;
    }
    try {
      await getSolUserFundsVaultBalance(this.connection, this.program);
    } catch (error) {
      console.error(
        red(`Error getting SOL user funds vault balance: ${error}\n\n`)
      );
    }
  };

  addDestination = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await addDestination(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error adding destination: ${error}\n\n`));
    }
  };

  claimAirdropBalance = async () => {
    if (!this.program || !this.keypair) {
      console.error(red("Program or keypair not found\n\n"));
      return;
    }
    try {
      await claimAirdropBalance(this.program, this.keypair);
    } catch (error) {
      console.error(red(`Error claiming airdrop balance: ${error}\n\n`));
    }
  };
}

export default new Interactor();
