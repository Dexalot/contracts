import { BankrunProvider } from "anchor-bankrun";
import { LAMPORTS_PER_SOL, Keypair, SystemProgram } from "@solana/web3.js";
import { Program, Wallet } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import DEXALOT_IDL from "../target/idl/dexalot.json";
import CALLER_MOCK_IDL from "../target/idl/caller_mock.json";
import { generateUniqueNonce, getAccountPubKey } from "../sdk/utils";
import {
  AIRDROP_VAULT_SEED,
  DEST_ID,
  ENDPOINT_ID,
  PORTFOLIO_SEED,
  SOL_USER_FUNDS_VAULT_SEED,
  SOL_VAULT_SEED,
  SPL_USER_FUNDS_VAULT_SEED,
  SPL_VAULT_SEED,
  TOKEN_DETAILS_SEED,
} from "../sdk/consts";

import { contextPromise } from "./context";
import { loadKeypair } from "../sdk/handlers/wallet";
import { initialize } from "./initalize";
import { getGlobalConfig } from "./get-global-config";
import { fundSol, fundSpl } from "./fund";
import { addRebalancer } from "./add-rebalancer";
import {
  setAirdropAmount,
  setAllowDeposit,
  setDefaultChainEid,
  setNativeDepositsRestricted,
  setPause,
  setSwapSigner,
} from "./set-global-config";
import { ProgramTestContext } from "solana-bankrun";
import pdaDeriver from "../sdk/pda-deriver";
import { setRemote } from "./set-remote";
import { addAdmin, removeAdmin } from "./admin";
import { addToken, removeToken } from "./token";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  //@ts-ignore
} from "spl-token-bankrun";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createAta } from "./create";
import { depositAirdropVault, depositSol, depositSpl } from "./deposit";
import { claimSolBalance, claimSplBalance } from "./claimBalance";
import { simpleSwap } from "./swap";
import { callDexalot } from "./lz-receive";
import { CallerMock } from "../target/types/caller_mock";
import { removeFromSwapQueue } from "./remove-from-swap-queue";

describe("dexalot_tests", () => {
  let dexalotProgram: Program<Dexalot>;
  let callerMockProgram: Program<CallerMock>;
  let authority: Keypair;
  let account2: Keypair;
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let tokenA: Keypair;
  let tokenB: Keypair;
  const tokenDecimals = 3;

  beforeAll(async () => {
    context = await contextPromise;
    authority = await loadKeypair("./tests/account1.json");
    account2 = await loadKeypair("./tests/account2.json");
    tokenA = await loadKeypair("./tests/tokenA.json");
    tokenB = await loadKeypair("./tests/tokenB.json");

    provider = new BankrunProvider(context, new Wallet(authority));

    dexalotProgram = new Program<Dexalot>(DEXALOT_IDL as any, provider);
    callerMockProgram = new Program<CallerMock>(
      CALLER_MOCK_IDL as any,
      provider
    );
  });

  test("initialize", async () => {
    // init
    await initialize(dexalotProgram, authority);
    const portfolioPda = getAccountPubKey(dexalotProgram, [
      Buffer.from(PORTFOLIO_SEED),
    ]);
    const portfolioAccount = await dexalotProgram.account.portfolio.fetch(
      portfolioPda
    );

    expect(portfolioAccount.endpoint.toBase58()).toBe(ENDPOINT_ID);

    // get globalConfig
    const globalConfig = await getGlobalConfig(dexalotProgram, authority);

    expect(Number(globalConfig.outNonce)).toBe(0);
    expect(globalConfig.allowDeposit).toBeTruthy();
    expect(globalConfig.programPaused).toBeFalsy();
    expect(globalConfig.nativeDepositsRestricted).toBeFalsy();
    expect(globalConfig.defaultChainId).toBe(DEST_ID);
    expect(globalConfig.airdropAmount.toString()).toBe("10000");
    expect(
      Buffer.from(globalConfig.swapSigner).toString("hex").toUpperCase()
    ).toBe("29dfa1F0879fEF3F8E6D4419397b33c4Da8e6476".toUpperCase());
  });

  test("fund_sol", async () => {
    // make the admin a rebalancer
    await addRebalancer(dexalotProgram, authority);

    const solVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SOL_VAULT_SEED),
    ]);

    // check sol balance
    const balanceBefore = await context.banksClient.getBalance(solVaultPDA);
    expect(Number(balanceBefore)).toBe(0);

    // fund sol
    await fundSol(dexalotProgram, authority);

    const balanceAfter = await context.banksClient.getBalance(solVaultPDA);
    expect(Number(balanceAfter)).toBe(1 * LAMPORTS_PER_SOL);
  });

  test("pause_program", async () => {
    const globalConfigBefore = await getGlobalConfig(dexalotProgram, authority);
    expect(globalConfigBefore.programPaused).toBeFalsy();

    // pause program
    await setPause(dexalotProgram, authority, true);

    const globalConfigAfterPause = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(globalConfigAfterPause.programPaused).toBeTruthy();

    // unpause program
    await setPause(dexalotProgram, authority, false);

    const globalConfigAfterUnpause = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(globalConfigAfterUnpause.programPaused).toBeFalsy();
  });

  test("allow_deposit", async () => {
    const globalConfigBefore = await getGlobalConfig(dexalotProgram, authority);
    expect(globalConfigBefore.allowDeposit).toBeTruthy();

    // disable allow deposits
    await setAllowDeposit(dexalotProgram, authority, false);

    const globalConfigAfterDisable = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(globalConfigAfterDisable.allowDeposit).toBeFalsy();

    // enable allow deposits
    await setAllowDeposit(dexalotProgram, authority, true);

    const globalConfigAfterEnable = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(globalConfigAfterEnable.allowDeposit).toBeTruthy();
  });

  test("native_deposits_restricted", async () => {
    const globalConfigBefore = await getGlobalConfig(dexalotProgram, authority);
    expect(globalConfigBefore.nativeDepositsRestricted).toBeFalsy();

    // enable native deposits restricted
    await setNativeDepositsRestricted(dexalotProgram, authority, true);

    const globalConfigAfterRestriction = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(globalConfigAfterRestriction.nativeDepositsRestricted).toBeTruthy();

    // disable native deposits restricted
    await setNativeDepositsRestricted(dexalotProgram, authority, false);

    const globalConfigAfterEnable = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(globalConfigAfterEnable.nativeDepositsRestricted).toBeFalsy();
  });

  test("set_swap_signer", async () => {
    const globalConfigBefore = await getGlobalConfig(dexalotProgram, authority);
    expect(
      Buffer.from(globalConfigBefore.swapSigner).toString("hex").toUpperCase()
    ).toBe("29dfa1F0879fEF3F8E6D4419397b33c4Da8e6476".toUpperCase());

    await setSwapSigner(
      dexalotProgram,
      authority,
      "29dfa1F0879fEF3F8E6D4419397b33c4Da8e6477"
    );

    const globalConfigAfterChange = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(
      Buffer.from(globalConfigAfterChange.swapSigner)
        .toString("hex")
        .toUpperCase()
    ).toBe("29dfa1F0879fEF3F8E6D4419397b33c4Da8e6477".toUpperCase());

    await setSwapSigner(
      dexalotProgram,
      authority,
      "29dfa1F0879fEF3F8E6D4419397b33c4Da8e6476"
    );

    const globalConfigAfterChangeBack = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(
      Buffer.from(globalConfigAfterChangeBack.swapSigner)
        .toString("hex")
        .toUpperCase()
    ).toBe("29dfa1F0879fEF3F8E6D4419397b33c4Da8e6476".toUpperCase());
  });

  test("set_default_chain_id", async () => {
    const globalConfigBefore = await getGlobalConfig(dexalotProgram, authority);
    expect(Number(globalConfigBefore.defaultChainId)).toBe(DEST_ID);

    await setDefaultChainEid(dexalotProgram, authority, 100);

    const globalConfigAfterChange = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(Number(globalConfigAfterChange.defaultChainId)).toBe(100);

    await setDefaultChainEid(dexalotProgram, authority, DEST_ID);

    const globalConfigAfterChangeBack = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(Number(globalConfigAfterChangeBack.defaultChainId)).toBe(DEST_ID);
  });

  test("add_admin", async () => {
    await addAdmin(dexalotProgram, authority, account2.publicKey);
  });

  test("set_airdrop_amount", async () => {
    const globalConfigBefore = await getGlobalConfig(dexalotProgram, authority);
    expect(Number(globalConfigBefore.airdropAmount)).toBe(10_000);

    await setAirdropAmount(dexalotProgram, account2, 100);

    const globalConfigAfterChange = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(Number(globalConfigAfterChange.airdropAmount)).toBe(100);

    await setAirdropAmount(dexalotProgram, authority, 10_000);

    const globalConfigAfterChangeBack = await getGlobalConfig(
      dexalotProgram,
      authority
    );
    expect(Number(globalConfigAfterChangeBack.airdropAmount)).toBe(10_000);
  });

  test("remove_admin", async () => {
    await removeAdmin(dexalotProgram, authority, account2.publicKey);
  });

  test("set_remote", async () => {
    const [remotePDA] = pdaDeriver.remote(DEST_ID);
    let remoteAccount = await context.banksClient.getAccount(remotePDA);
    expect(remoteAccount).toBeNull();

    await setRemote(
      dexalotProgram,
      authority,
      DEST_ID,
      "0x24B36B9BAF30be0427aA254c694F8cc92d765257"
    );
    remoteAccount = await context.banksClient.getAccount(remotePDA);
    expect(remoteAccount?.owner.toBase58()).toBe(
      dexalotProgram.programId.toBase58()
    );
  });

  test("add_token", async () => {
    const mintKeypair = tokenA;
    const mint = await createMint(
      context.banksClient,
      authority,
      authority.publicKey,
      null,
      tokenDecimals,
      mintKeypair
    );

    // add token
    await addToken(dexalotProgram, authority, mint, "A", tokenDecimals);
    const tokenDetailsPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(TOKEN_DETAILS_SEED),
      mint.toBuffer(),
    ]);
    const token = await dexalotProgram.account.tokenDetails.fetch(
      tokenDetailsPDA
    );
    expect(token.decimals).toBe(tokenDecimals);
    expect(token.tokenAddress.toBase58()).toBe(mint.toBase58());
  });

  test("remove_token", async () => {
    // pause program
    await setPause(dexalotProgram, authority, true);

    const mintKeypair = tokenA;

    const tokenDetailsPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(TOKEN_DETAILS_SEED),
      mintKeypair.publicKey.toBuffer(),
    ]);
    const token = await dexalotProgram.account.tokenDetails.fetch(
      tokenDetailsPDA
    );
    expect(token).toBeDefined();

    await removeToken(dexalotProgram, authority, mintKeypair.publicKey);

    await expect(
      dexalotProgram.account.tokenDetails.fetch(tokenDetailsPDA)
    ).rejects.toThrow();

    // unpause program
    await setPause(dexalotProgram, authority, false);
  });

  test("create_ata", async () => {
    const mintKeypair = tokenA;

    const userATA = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      account2.publicKey
    );

    const splVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const vaultATA = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      splVaultPDA,
      true
    );

    let userAtaAccount = await context.banksClient.getAccount(userATA);
    expect(userAtaAccount).toBeNull();

    await createAta(
      dexalotProgram,
      authority,
      account2,
      userATA,
      vaultATA,
      mintKeypair.publicKey
    );

    userAtaAccount = await context.banksClient.getAccount(userATA);
    expect(userAtaAccount?.owner.toBase58()).toBe(TOKEN_PROGRAM_ID.toBase58());
  });

  test("airdrop_deposit", async () => {
    const airdropVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(AIRDROP_VAULT_SEED),
    ]);
    let balance = await context.banksClient.getBalance(airdropVaultPDA);
    expect(Number(balance)).toBe(0);

    await depositAirdropVault(dexalotProgram, authority, 1);

    balance = await context.banksClient.getBalance(airdropVaultPDA);
    expect(Number(balance)).toBe(1 * LAMPORTS_PER_SOL);
  });

  test("sol_deposit", async () => {
    const solUserFundsVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SOL_USER_FUNDS_VAULT_SEED),
    ]);
    let balance = await context.banksClient.getBalance(solUserFundsVaultPDA);
    expect(Number(balance)).toBe(0);

    await depositSol(dexalotProgram, authority, 1);

    balance = await context.banksClient.getBalance(solUserFundsVaultPDA);
    expect(Number(balance)).toBe(1 * LAMPORTS_PER_SOL);
  });

  test("spl_deposit", async () => {
    const mintKeypair = tokenA;
    await addToken(
      dexalotProgram,
      authority,
      mintKeypair.publicKey,
      "A",
      tokenDecimals
    );

    const splUserFundsVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_USER_FUNDS_VAULT_SEED),
    ]);

    const vaultATA = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      splUserFundsVaultPDA,
      true
    );

    const userATA = await createAssociatedTokenAccount(
      context.banksClient,
      authority,
      mintKeypair.publicKey,
      authority.publicKey
    );

    mintTo(
      context.banksClient,
      authority,
      mintKeypair.publicKey,
      userATA,
      authority,
      100 * 10 ** tokenDecimals
    );

    // wait for 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    let vaultsAtaAccount = await getAccount(context.banksClient, vaultATA);
    expect(Number(vaultsAtaAccount.amount)).toBe(0);

    let userAtaAccount = await getAccount(context.banksClient, userATA);
    expect(Number(userAtaAccount.amount)).toBe(100 * 10 ** tokenDecimals);

    await depositSpl(
      dexalotProgram,
      authority,
      1,
      mintKeypair.publicKey,
      tokenDecimals
    );

    vaultsAtaAccount = await getAccount(context.banksClient, vaultATA);
    expect(Number(vaultsAtaAccount.amount)).toBe(1 * 10 ** tokenDecimals);

    userAtaAccount = await getAccount(context.banksClient, userATA);
    expect(Number(userAtaAccount.amount)).toBe(99 * 10 ** tokenDecimals);
  });

  test("fund_spl", async () => {
    const mintKeypair = tokenA;
    const splVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const vaultATA = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      splVaultPDA,
      true
    );
    let vaultsAtaAccount = await getAccount(context.banksClient, vaultATA);

    expect(Number(vaultsAtaAccount.amount)).toBe(0);

    await fundSpl(
      dexalotProgram,
      authority,
      10,
      mintKeypair.publicKey,
      tokenDecimals
    );

    vaultsAtaAccount = await getAccount(context.banksClient, vaultATA);
    expect(Number(vaultsAtaAccount.amount)).toBe(10 * 10 ** tokenDecimals);
  });

  test("claim_sol", async () => {
    const solVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SOL_VAULT_SEED),
    ]);
    let balance = await context.banksClient.getBalance(solVaultPDA);
    expect(Number(balance)).toBe(1 * LAMPORTS_PER_SOL);

    await claimSolBalance(dexalotProgram, authority, 0.9);

    balance = await context.banksClient.getBalance(solVaultPDA);
    expect(Number(balance)).toBeLessThan(0.2 * LAMPORTS_PER_SOL);
  });

  test("claim_spl", async () => {
    const mintKeypair = tokenA;

    const splVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const vaultATA = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      splVaultPDA,
      true
    );
    let vaultsAtaAccount = await getAccount(context.banksClient, vaultATA);
    expect(Number(vaultsAtaAccount.amount)).toBe(10 * 10 ** tokenDecimals);

    await claimSplBalance(
      dexalotProgram,
      authority,
      1,
      mintKeypair.publicKey,
      tokenDecimals
    );

    vaultsAtaAccount = await getAccount(context.banksClient, vaultATA);
    expect(Number(vaultsAtaAccount.amount)).toBe(9 * 10 ** tokenDecimals);
  });

  test("simple_swap", async () => {
    await createMint(
      context.banksClient,
      authority,
      authority.publicKey,
      null,
      tokenDecimals,
      tokenB
    );

    await addToken(
      dexalotProgram,
      authority,
      tokenB.publicKey,
      "B",
      tokenDecimals
    );

    const userAtaTokenB = await createAssociatedTokenAccount(
      context.banksClient,
      authority,
      tokenB.publicKey,
      authority.publicKey
    );

    mintTo(
      context.banksClient,
      authority,
      tokenB.publicKey,
      userAtaTokenB,
      authority,
      100 * 10 ** tokenDecimals
    );
    // wait for 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await fundSpl(
      dexalotProgram,
      authority,
      5,
      tokenB.publicKey,
      tokenDecimals
    );

    const splVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const vaultAtaTokenB = await getAssociatedTokenAddress(
      tokenB.publicKey,
      splVaultPDA,
      true
    );

    await createAta(
      dexalotProgram,
      authority,
      account2,
      userAtaTokenB,
      vaultAtaTokenB,
      tokenB.publicKey
    );

    const userAtaTokenA = await getAssociatedTokenAddress(
      tokenA.publicKey,
      authority.publicKey
    );

    const vaultAtaTokenA = await getAssociatedTokenAddress(
      tokenA.publicKey,
      splVaultPDA,
      true
    );

    const user2AtaTokenB = await getAssociatedTokenAddress(
      tokenB.publicKey,
      account2.publicKey
    );

    let user2AtaTokenBAccount = await getAccount(
      context.banksClient,
      user2AtaTokenB
    );
    expect(Number(user2AtaTokenBAccount.amount)).toBe(0 * 10 ** tokenDecimals);

    let vaultsAtaAAccount = await getAccount(
      context.banksClient,
      vaultAtaTokenA
    );
    expect(Number(vaultsAtaAAccount.amount)).toBe(9 * 10 ** tokenDecimals);

    let vaultsAtaBAccount = await getAccount(
      context.banksClient,
      vaultAtaTokenB
    );
    expect(Number(vaultsAtaBAccount.amount)).toBe(5 * 10 ** tokenDecimals);

    let userAtaTokenAAccount = await getAccount(
      context.banksClient,
      userAtaTokenA
    );
    expect(Number(userAtaTokenAAccount.amount)).toBe(90 * 10 ** tokenDecimals);

    await simpleSwap(
      dexalotProgram,
      authority,
      account2,
      tokenB.publicKey,
      tokenA.publicKey
    );

    user2AtaTokenBAccount = await getAccount(
      context.banksClient,
      user2AtaTokenB
    );
    expect(Number(user2AtaTokenBAccount.amount)).toBe(1 * 10 ** tokenDecimals);

    vaultsAtaAAccount = await getAccount(context.banksClient, vaultAtaTokenA);
    expect(Number(vaultsAtaAAccount.amount)).toBe(10 * 10 ** tokenDecimals);

    vaultsAtaBAccount = await getAccount(context.banksClient, vaultAtaTokenB);
    expect(Number(vaultsAtaBAccount.amount)).toBe(4 * 10 ** tokenDecimals);

    userAtaTokenAAccount = await getAccount(context.banksClient, userAtaTokenA);
    expect(Number(userAtaTokenAAccount.amount)).toBe(89 * 10 ** tokenDecimals);
  });

  test("lz_receive", async () => {
    const userAtaTokenA = await getAssociatedTokenAddress(
      tokenA.publicKey,
      authority.publicKey
    );

    const splVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const splUserFundsVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_USER_FUNDS_VAULT_SEED),
    ]);

    const vaultAtaTokenA = await getAssociatedTokenAddress(
      tokenA.publicKey,
      splVaultPDA,
      true
    );

    const vaultUserFundsAtaTokenA = await getAssociatedTokenAddress(
      tokenA.publicKey,
      splUserFundsVaultPDA,
      true
    );

    const solVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SOL_VAULT_SEED),
    ]);

    const solUserFundsVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SOL_USER_FUNDS_VAULT_SEED),
    ]);

    let userAtaAccount = await getAccount(context.banksClient, userAtaTokenA);
    expect(Number(userAtaAccount.amount)).toBe(88 * 10 ** tokenDecimals);

    let vaultAta = await getAccount(context.banksClient, vaultAtaTokenA);
    expect(Number(vaultAta.amount)).toBe(11 * 10 ** tokenDecimals);

    let nonce = generateUniqueNonce();

    await callDexalot(
      dexalotProgram,
      callerMockProgram,
      authority,
      nonce,
      tokenA.publicKey,
      authority.publicKey,
      splVaultPDA,
      solVaultPDA,
      { ccTrade: {} },
      1000
    );

    userAtaAccount = await getAccount(context.banksClient, userAtaTokenA);
    expect(Number(userAtaAccount.amount)).toBe(89 * 10 ** tokenDecimals);

    vaultAta = await getAccount(context.banksClient, vaultAtaTokenA);
    expect(Number(vaultAta.amount)).toBe(10 * 10 ** tokenDecimals);

    let vaultUserFundsAta = await getAccount(
      context.banksClient,
      vaultUserFundsAtaTokenA
    );
    expect(Number(vaultUserFundsAta.amount)).toBe(1 * 10 ** tokenDecimals);
    nonce = generateUniqueNonce();
    await callDexalot(
      dexalotProgram,
      callerMockProgram,
      authority,
      nonce,
      tokenA.publicKey,
      authority.publicKey,
      splUserFundsVaultPDA,
      solUserFundsVaultPDA,
      { withdraw: {} },
      1000
    );
    vaultUserFundsAta = await getAccount(
      context.banksClient,
      vaultUserFundsAtaTokenA
    );
    expect(Number(vaultUserFundsAta.amount)).toBe(0);

    userAtaAccount = await getAccount(context.banksClient, userAtaTokenA);
    expect(Number(userAtaAccount.amount)).toBe(90 * 10 ** tokenDecimals);
  });

  test("remove_from_swap_queue", async () => {
    const nonce = generateUniqueNonce();
    const userAtaTokenA = await getAssociatedTokenAddress(
      tokenA.publicKey,
      authority.publicKey
    );

    const splVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const solVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SOL_VAULT_SEED),
    ]);

    const vaultAtaTokenA = await getAssociatedTokenAddress(
      tokenA.publicKey,
      splVaultPDA,
      true
    );

    let userAtaAccount = await getAccount(context.banksClient, userAtaTokenA);
    expect(Number(userAtaAccount.amount)).toBe(90 * 10 ** tokenDecimals);

    let vaultAta = await getAccount(context.banksClient, vaultAtaTokenA);
    expect(Number(vaultAta.amount)).toBe(10 * 10 ** tokenDecimals);

    await callDexalot(
      dexalotProgram,
      callerMockProgram,
      authority,
      nonce,
      tokenA.publicKey,
      authority.publicKey,
      splVaultPDA,
      solVaultPDA,
      { ccTrade: {} },
      11000
    );

    userAtaAccount = await getAccount(context.banksClient, userAtaTokenA);
    expect(Number(userAtaAccount.amount)).toBe(90 * 10 ** tokenDecimals);

    vaultAta = await getAccount(context.banksClient, vaultAtaTokenA);
    expect(Number(vaultAta.amount)).toBe(10 * 10 ** tokenDecimals);

    await fundSpl(
      dexalotProgram,
      authority,
      1,
      tokenA.publicKey,
      tokenDecimals
    );

    vaultAta = await getAccount(context.banksClient, vaultAtaTokenA);
    expect(Number(vaultAta.amount)).toBe(11 * 10 ** tokenDecimals);

    await removeFromSwapQueue(dexalotProgram, authority, nonce);

    userAtaAccount = await getAccount(context.banksClient, userAtaTokenA);
    expect(Number(userAtaAccount.amount)).toBe(100 * 10 ** tokenDecimals);

    vaultAta = await getAccount(context.banksClient, vaultAtaTokenA);
    expect(Number(vaultAta.amount)).toBe(0);
  });

  it("claim_admin", async () => {
    expect(addAdmin(dexalotProgram, authority, authority.publicKey)).rejects.toThrow("AnchorError caused by account: admin. Error Code: AccountNotInitialized. Error Number: 3012. Error Message: The program expected this account to be already initialized.")
  });

  it("Attacker can't steal tokens from queued swaps", async () => {
    ///////////////////////////////////
    /////      STEP 1: SETUP      /////
    ///////////////////////////////////

    // Initialize all required accounts for the protocol
    await initialize(dexalotProgram, authority);
    await addRebalancer(dexalotProgram, authority);

    // Create tokenA mint and register it in the app
    await createMint(
      context.banksClient,
      authority,
      authority.publicKey,
      null,
      tokenDecimals,
      tokenA
    );

    await addToken(
      dexalotProgram,
      authority,
      tokenA.publicKey,
      "A",
      tokenDecimals
    );
    await depositAirdropVault(dexalotProgram, authority, 1);

    // setup the attacker and the victim (who should receive the tokens)
    const attacker = await loadKeypair("./tests/account3.json");
    const victim = account2;

    // Setup attacker account with SOL for transaction fees
    context.setAccount(attacker.publicKey, {
      lamports: 2000000000,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    // Get required PDAs and accounts
    const splVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(SPL_VAULT_SEED),
    ]);
    const airdropVaultPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(AIRDROP_VAULT_SEED),
    ]);
    const portfolioPDA = getAccountPubKey(dexalotProgram, [
      Buffer.from(PORTFOLIO_SEED),
    ]);

    const vaultAtaTokenA = await getAssociatedTokenAddress(
      tokenA.publicKey,
      splVaultPDA,
      true
    );
    const attackerTokenAta = await getAssociatedTokenAddress(
      tokenA.publicKey,
      attacker.publicKey,
      true
    );
    const victimTokenAta = await getAssociatedTokenAddress(
      tokenA.publicKey,
      victim.publicKey
    );

    // Create attacker's token account (this is where stolen tokens will go)
    await createAssociatedTokenAccount(
      context.banksClient,
      authority, // Use authority to create it
      tokenA.publicKey,
      attacker.publicKey // But owned by attacker
    );

    // Create victim's token account (so we can check it has 0 tokens)
    await createAssociatedTokenAccount(
      context.banksClient,
      authority, // Use authority to create it
      tokenA.publicKey,
      victim.publicKey // But owned by victim
    );

    /////////////////////////////////////////////////
    /////      STEP 2: SIMULATE lz_receive      /////
    /////////////////////////////////////////////////

    // Fund the vault with tokens that will be stolen - just mint directly to vault
    await mintTo(
      context.banksClient,
      authority,
      tokenA.publicKey,
      vaultAtaTokenA,
      authority,
      5000
    );

    // Manually create the PendingSwap account (simulating what lz_receive would do)
    const nonce = generateUniqueNonce();
    const [pendingSwapPDA] = pdaDeriver.pendingSwapsEntry(
      nonce,
      victim.publicKey
    );

    const pendingSwapAccountSize = 8 + 32 + 8 + 32;
    const rent = await context.banksClient.getRent();
    const lamports = Number(
      rent.minimumBalance(BigInt(pendingSwapAccountSize))
    );

    // PendingSwap discriminator
    const discriminator = Buffer.from([21, 123, 168, 49, 126, 169, 137, 168]);
    // victim is the trader
    const traderBytes = victim.publicKey.toBuffer();
    // victim should receive 5000 tokens
    const quantityBytes = Buffer.alloc(8);
    quantityBytes.writeBigUInt64LE(5000n, 0);
    // receiving tokens of token A
    const tokenMintBytes = tokenA.publicKey.toBuffer();

    // serialize the PDA account data with discriminator
    const accountData = Buffer.concat([
      discriminator,
      traderBytes,
      quantityBytes,
      tokenMintBytes,
    ]);

    // Write the PendingSwap data to the PDA account
    context.setAccount(pendingSwapPDA, {
      lamports,
      data: accountData,
      owner: dexalotProgram.programId,
      executable: false,
    });


    /////////////////////////////////////////
    /////      STEP 3: THE EXPLOIT      /////
    /////////////////////////////////////////

    // In the beginning both the victim and the attacker have ZERO tokens

    const attackerBalanceBefore = (
      await getAccount(context.banksClient, attackerTokenAta)
    ).amount;
    const victimBalanceBefore = (
      await getAccount(context.banksClient, victimTokenAta)
    ).amount;

    console.log("Attacker token balance:", Number(attackerBalanceBefore));
    console.log("Victim token balance:", Number(victimBalanceBefore));

    expect(Number(attackerBalanceBefore)).toBe(0);
    expect(Number(victimBalanceBefore)).toBe(0);

    // setup provider for attacker so attacker can sign the transaction
    const attackerProvider = new BankrunProvider(context, new Wallet(attacker));
    const attackerDexalotProgram = new Program<Dexalot>(
      DEXALOT_IDL as any,
      attackerProvider
    );

    // Execute the exploit
    expect(attackerDexalotProgram.methods
      .removeFromSwapQueue({
        nonce: Array.from(nonce),
        destTrader: victim.publicKey,
      })
      .accounts({
        // @ts-ignore
        splVault: splVaultPDA,
        solVault: getAccountPubKey(dexalotProgram, [
          Buffer.from(SOL_VAULT_SEED),
        ]),
        from: vaultAtaTokenA, // Legitimate from account (vault's ATA)
        to: attackerTokenAta, // EXPLOIT: Attacker provides their own token account
        tokenProgram: TOKEN_PROGRAM_ID,
        trader: victim.publicKey, // Victim should be the trader
        systemProgram: SystemProgram.programId,
        swapQueueEntry: pendingSwapPDA,
        airdropVault: airdropVaultPDA,
        portfolio: portfolioPDA,
        tokenMint: tokenA.publicKey
      })
      .rpc()
    ).rejects.toThrow("AnchorError caused by account: to");
  });
});
