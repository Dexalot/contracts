import { Keypair, PublicKey } from "@solana/web3.js";
import { Dexalot } from "../target/types/dexalot";
import { BN, Program, web3 } from "@coral-xyz/anchor";
import { getAccountPubKey } from "../sdk/utils";
import {
  ADMIN_SEED,
  AIRDROP_VAULT_SEED,
  BANNED_ACCOUNT_SEED,
  DEST_ID,
  PORTFOLIO_SEED,
  SOL_USER_FUNDS_VAULT_SEED,
  SOL_VAULT_SEED,
  SPL_USER_FUNDS_VAULT_SEED,
  TOKEN_DETAILS_SEED,
} from "../sdk/consts";
import pdaDeriver from "../sdk/pda-deriver";
import { endpointProgram } from "../sdk/layerzero";
import { LZ_MOCK_PROGRAM_ID } from "./context";
import { getLayerZeroQuoteSendRemainingAccounts } from "./utils";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { arrayify, hexZeroPad, zeroPad } from "@ethersproject/bytes";

export const depositAirdropVault = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  amount: number
) => {
  const airdropVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(AIRDROP_VAULT_SEED),
  ]);

  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);

  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const lamports = web3.LAMPORTS_PER_SOL * amount;

  await dexalotProgram.methods
    .depositAirdrop({ amount: new BN(lamports) })
    .accounts({
      authority: authority.publicKey,
      // @ts-ignore
      portfolio: portfolioPDA,
      airdropVault: airdropVaultPDA,
      systemProgram: web3.SystemProgram.programId,
      admin: adminPDA,
    })
    .signers([authority])
    .rpc();
};

export const depositSol = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  amount: number
) => {
  const nativeVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_USER_FUNDS_VAULT_SEED),
  ]);

  const lamports = web3.LAMPORTS_PER_SOL * amount;

  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const [remotePDA] = pdaDeriver.remote(DEST_ID);

  const bannedAccountPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(BANNED_ACCOUNT_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const remainingAccounts = getLayerZeroQuoteSendRemainingAccounts();
  const traderPublicKey = arrayify(
    hexZeroPad("0x29dfa1F0879fEF3F8E6D4419397b33c4Da8e6476", 32)
  );
  await dexalotProgram.methods
    .depositNative({
      amount: new BN(lamports),
      trader: Array.from(traderPublicKey),
    })
    .accounts({
      user: authority.publicKey,
      // @ts-ignore
      portfolio: portfolioPDA,
      solVault: nativeVaultPDA,
      systemProgram: web3.SystemProgram.programId,
      remote: remotePDA,
      bannedAccount: bannedAccountPDA,
      endpointProgram: LZ_MOCK_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .signers([authority])
    .rpc();
};

export const depositSpl = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  amount: number,
  tokenMintAddress: PublicKey,
  tokenDecimals: number
) => {
  const tokenDetailsPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(TOKEN_DETAILS_SEED),
    tokenMintAddress.toBuffer(),
  ]);

  const splUserFundsVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_USER_FUNDS_VAULT_SEED),
  ]);

  const bannedAccountPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(BANNED_ACCOUNT_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);

  const [remotePDA] = pdaDeriver.remote(DEST_ID);

  const vaultATA = await getAssociatedTokenAddress(
    tokenMintAddress,
    splUserFundsVaultPDA,
    true
  );

  const userATA = await getAssociatedTokenAddress(
    tokenMintAddress,
    authority.publicKey
  );
  const traderPublicKey = arrayify(
    hexZeroPad("0x29dfa1F0879fEF3F8E6D4419397b33c4Da8e6476", 32)
  );

  const remainingAccounts = getLayerZeroQuoteSendRemainingAccounts();
  await dexalotProgram.methods
    .deposit({
      tokenMint: tokenMintAddress,
      amount: new BN(amount * 10 ** tokenDecimals),
      trader: Array.from(traderPublicKey),
    })
    .accounts({
      user: authority.publicKey,
      // @ts-ignore
      portfolio: portfolioPDA,
      tokenDetails: tokenDetailsPDA,
      splUserFundsVault: splUserFundsVaultPDA,
      from: userATA,
      to: vaultATA,
      tokenProgram: TOKEN_PROGRAM_ID,
      bannedAccount: bannedAccountPDA,
      remote: remotePDA,
      endpointProgram: endpointProgram.program,
      systemProgram: web3.SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .signers([authority])
    .rpc();
};
