import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import { Keypair } from "@solana/web3.js";
import { getAccountPubKey } from "../sdk/utils";
import {
  AIRDROP_VAULT_SEED,
  SOL_VAULT_SEED,
  SPL_VAULT_SEED,
} from "../sdk/consts";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import pdaDeriver from "../sdk/pda-deriver";

export const removeFromSwapQueue = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  nonce: Buffer
) => {
  const solVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_VAULT_SEED),
  ]);

  const splVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_VAULT_SEED),
  ]);

  const airdropVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(AIRDROP_VAULT_SEED),
  ]);

  const [pendingSwapPDA] = pdaDeriver.pendingSwapsEntry(
    nonce,
    authority.publicKey
  );
  const pendingSwap = await dexalotProgram.account.pendingSwap.fetch(
    pendingSwapPDA
  );
  if (!pendingSwap) {
    throw new Error("Pending swap not found!");
  }
  const tokenMint = pendingSwap.tokenMint;

  const from = await getAssociatedTokenAddress(tokenMint, splVaultPDA, true);
  const to = await getAssociatedTokenAddress(tokenMint, authority.publicKey);

  await dexalotProgram.methods
    .removeFromSwapQueue({
      nonce: Array.from(nonce),
      destTrader: authority.publicKey,
    })
    .accounts({
      // @ts-ignore
      splVault: splVaultPDA,
      solVault: solVaultPDA,
      from: from,
      to: to,
      tokenProgram: TOKEN_PROGRAM_ID,
      trader: pendingSwap.trader,
      systemProgram: web3.SystemProgram.programId,
      swapQueueEntry: pendingSwapPDA,
      airdropVault: airdropVaultPDA,
    })
    .signers([authority])
    .rpc();
};
