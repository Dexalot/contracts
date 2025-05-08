import { BN, Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAccountPubKey } from "../sdk/utils";
import {
  PORTFOLIO_SEED,
  REBALANCER_SEED,
  SOL_VAULT_SEED,
  SPL_VAULT_SEED,
} from "../sdk/consts";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const fundSol = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair
) => {
  const rebalancerPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(REBALANCER_SEED),
    authority.publicKey.toBuffer(),
  ]);
  const solVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_VAULT_SEED),
  ]);
  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  await dexalotProgram.methods
    .fundSol({
      amount: new BN(1 * LAMPORTS_PER_SOL),
    })
    .accounts({
      authority: authority.publicKey,
      //@ts-ignore
      rebalancer: rebalancerPDA,
      solVault: solVaultPDA,
      portfolio: portfolioPDA,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
};

export const fundSpl = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  amount: number,
  tokenMintAddress: PublicKey,
  tokenDecimals: number
) => {
  const rebalancerPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(REBALANCER_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const splVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_VAULT_SEED),
  ]);
  
  const vaultATA = await getAssociatedTokenAddress(
    tokenMintAddress,
    splVaultPDA,
    true
  );

  const userATA = await getAssociatedTokenAddress(
    tokenMintAddress,
    authority.publicKey
  );

  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);

  await dexalotProgram.methods
    .fundSpl({
      tokenMint: tokenMintAddress,
      amount: new BN(amount * 10 ** tokenDecimals),
    })
    .accounts({
      authority: authority.publicKey,
      //@ts-ignore
      rebalancer: rebalancerPDA,
      splVault: splVaultPDA,
      from: userATA,
      to: vaultATA,
      portfolio: portfolioPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();
};
