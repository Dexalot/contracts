import { Program, web3 } from "@coral-xyz/anchor";
import {
  ADMIN_SEED,
  AIRDROP_VAULT_SEED,
  DEST_ID,
  PORTFOLIO_SEED,
  SOL_USER_FUNDS_VAULT_SEED,
  SOL_VAULT_SEED,
  SPL_USER_FUNDS_VAULT_SEED,
  SPL_VAULT_SEED,
  TOKEN_LIST_SEED,
} from "../sdk/consts";
import { endpointProgram } from "../sdk/layerzero";
import { getAccountPubKey } from "../sdk/utils";
import { Dexalot } from "../target/types/dexalot";
import { Keypair, PublicKey } from "@solana/web3.js";

export const initialize = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair
) => {
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.publicKey.toBuffer(),
  ]);

  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const tokenListPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(TOKEN_LIST_SEED),
    Buffer.from("0"),
  ]);

  const register_remaining_accounts =
    endpointProgram.getRegisterOappIxAccountMetaForCPI(
      admin.publicKey,
      portfolioPDA
    );
  const signer_pubkey = "29dfa1F0879fEF3F8E6D4419397b33c4Da8e6476";

  await dexalotProgram.methods
    .initialize({
      defaultChainId: DEST_ID,
      swapSigner: Array.from(Buffer.from(signer_pubkey, "hex")),
    })
    .accounts({
      //@ts-ignore
      portfolio: portfolioPDA,
      tokenList: tokenListPDA,
      admin: adminPDA,
      authority: admin.publicKey,
      systemProgram: web3.SystemProgram.programId,
      endpointProgram: endpointProgram.program,
    })
    .remainingAccounts(register_remaining_accounts)
    .signers([admin])
    .rpc();
};

export const initializeSplVaults = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair
) => {
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const splVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_VAULT_SEED),
  ]);
  const splUserFundsVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_USER_FUNDS_VAULT_SEED),
  ]);

  await dexalotProgram.methods
    .initializeSplVaults()
    .accounts({
      authority: authority.publicKey,
      //@ts-ignore
      splVault: splVaultPDA,
      splUserFundsVault: splUserFundsVaultPDA,
      admin: adminPDA,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
};

export const initializeSolVaults = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair
) => {
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const solVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_VAULT_SEED),
  ]);

  const solUserFundsVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_USER_FUNDS_VAULT_SEED),
  ]);

  const airdropVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(AIRDROP_VAULT_SEED),
  ]);

  await dexalotProgram.methods
    .initializeSolVaults()
    .accounts({
      authority: authority.publicKey,
      //@ts-ignore
      solVault: solVaultPDA,
      solUserFundsVault: solUserFundsVaultPDA,
      airdropVault: airdropVaultPDA,
      admin: adminPDA,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
};