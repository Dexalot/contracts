import { Program, web3 } from "@coral-xyz/anchor";
import { getAccountPubKey } from "../sdk/utils";
import { Dexalot } from "../target/types/dexalot";
import { SPL_VAULT_SEED } from "../sdk/consts";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export const createAta = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  account2: Keypair,
  userATA: PublicKey,
  splVaultATA: PublicKey,
  tokenMint: PublicKey
) => {
  const splVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_VAULT_SEED),
  ]);

  await dexalotProgram.methods
    .createAta()
    .accounts({
      payer: authority.publicKey,
      mint: tokenMint,
      user: account2.publicKey,
      //@ts-ignore
      splVault: splVaultPDA,
      portfolioATA: splVaultATA,
      userATA,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([authority, account2])
    .rpc();
};
