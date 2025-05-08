import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccountPubKey, padSymbol } from "../sdk/utils";
import {
  ADMIN_SEED,
  SPL_USER_FUNDS_VAULT_SEED,
  SPL_VAULT_SEED,
  TOKEN_DETAILS_SEED,
} from "../sdk/consts";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export const addToken = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  tokenMint: PublicKey,
  tokenSymbol: string,
  tokenDecimals: number
) => {
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const tokenDetailsPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(TOKEN_DETAILS_SEED),
    tokenMint.toBuffer(),
  ]);

  const splVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_VAULT_SEED),
  ]);

  const splUserFundsVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_USER_FUNDS_VAULT_SEED),
  ]);
  const symbolPadded = padSymbol(tokenSymbol);

  await dexalotProgram.methods
    .addToken({
      symbol: Array.from(symbolPadded),
      tokenAddress: tokenMint,
      decimals: tokenDecimals,
    })
    .accounts({
      authority: authority.publicKey,
      //@ts-ignore
      admin: adminPDA,
      splVault: splVaultPDA,
      splUserFundsVault: splUserFundsVaultPDA,
      tokenDetails: tokenDetailsPDA,
      tokenMint: tokenMint,
      splTokenAccount: await getAssociatedTokenAddress(
        tokenMint,
        splVaultPDA,
        true // allow owner off curve
      ),
      splUserFundsTokenAccount: await getAssociatedTokenAddress(
        tokenMint,
        splUserFundsVaultPDA,
        true // allow owner off curve
      ),
      systemProgram: web3.SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();
};

export const removeToken = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  tokenMint: PublicKey
) => {
  const [adminPDA, adminBump] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from(ADMIN_SEED), authority.publicKey.toBuffer()],
    dexalotProgram.programId
  );

  // Derive the sol_details PDA
  const [tokenDetails, solDetailsBump] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from(TOKEN_DETAILS_SEED), tokenMint.toBuffer()],
    dexalotProgram.programId
  );

  await dexalotProgram.methods
    .removeToken({ tokenAddress: tokenMint })
    .accounts({
      authority: authority.publicKey,
      //@ts-ignore
      tokenDetails,
      admin: adminPDA,
      receiver: authority.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
};
