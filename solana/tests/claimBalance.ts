import { BN, Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAccountPubKey } from "../sdk/utils";
import {
  PORTFOLIO_SEED,
  REBALANCER_SEED,
  SOL_VAULT_SEED,
  SPL_VAULT_SEED,
} from "../sdk/consts";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const claimSolBalance = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  amount: number
) => {
  const rebalancerPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(REBALANCER_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const solVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_VAULT_SEED),
  ]);
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  await dexalotProgram.methods
    .claimNativeBalance({
      amount: new BN(amount * LAMPORTS_PER_SOL),
    })
    .accounts({
      authority: authority.publicKey,
      //@ts-ignore
      rebalancer: rebalancerPDA,
      solVault: solVaultPDA,
      portfolio: portfolio,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
};

export const claimSplBalance = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  amount: number,
  tokenMint: PublicKey,
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
    tokenMint,
    splVaultPDA,
    true
  );

  const authorityATA = await getAssociatedTokenAddress(
    tokenMint,
    authority.publicKey
  );
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  await dexalotProgram.methods
    .claimSplBalance({
      amount: new BN(amount * 10 ** tokenDecimals),
      tokenAddress: tokenMint,
    })
    .accounts({
      authority: authority.publicKey,
      //@ts-ignore
      rebalancer: rebalancerPDA,
      splVault: splVaultPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
      mint: tokenMint,
      from: vaultATA,
      to: authorityATA,
      portfolio: portfolio,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
};
