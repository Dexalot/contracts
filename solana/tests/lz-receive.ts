import { BN, Program, web3 } from "@coral-xyz/anchor";
import { AccountMeta, Keypair, PublicKey } from "@solana/web3.js";
import { DEXALOT_PROGRAM_ID, LZ_MOCK_PROGRAM_ID } from "./context";
import { getAccountPubKey } from "../sdk/utils";
import { Dexalot } from "../target/types/dexalot";
import {
  AIRDROP_VAULT_SEED,
  DEST_ID,
  PORTFOLIO_SEED,
  TOKEN_DETAILS_SEED,
} from "../sdk/consts";
import pdaDeriver from "../sdk/pda-deriver";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { CallerMock } from "../target/types/caller_mock";

export const callDexalot = async (
  dexalotProgram: Program<Dexalot>,
  callerMockProgram: Program<CallerMock>,
  authority: Keypair,
  nonce: Buffer,
  tokenMint: PublicKey,
  destTrader: PublicKey,
  tokenVaultPDA: PublicKey,
  nativeVaultPDA: PublicKey,
  txType: any,
  amount: number
) => {
  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const [remotePDA] = pdaDeriver.remote(DEST_ID);
  const remote = await dexalotProgram.account.remote.fetch(remotePDA);

  const from = await getAssociatedTokenAddress(tokenMint, tokenVaultPDA, true);

  const to = await getAssociatedTokenAddress(tokenMint, authority.publicKey);
  const airdropVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(AIRDROP_VAULT_SEED),
  ]);

  const tokenDetailsPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(TOKEN_DETAILS_SEED),
    tokenMint.toBuffer(),
  ]);

  const [pendingSwapsEntryPDA] = pdaDeriver.pendingSwapsEntry(
    nonce,
    destTrader
  );

  const remainingAccounts: AccountMeta[] = [
    {
      pubkey: new PublicKey(LZ_MOCK_PROGRAM_ID),
      isWritable: false,
      isSigner: false,
    },
    ...new Array(7).fill({
      pubkey: new PublicKey("F8E8QGhKmHEx2esh5LpVizzcP4cHYhzXdXTwg9w3YYY2"),
      isWritable: false,
      isSigner: false,
    }),
  ];

  await callerMockProgram.methods
    .callDexalot({
      sender: new PublicKey(remote.address),
      tokenMint: tokenMint,
      transactionType: txType,
      nonce: Array.from(nonce),
      trader: destTrader,
      quantity: new BN(amount),
      timestamp: 1899558993, // 2030
      srcEid: DEST_ID,
    })
    .accounts({
      dexalotProgram: DEXALOT_PROGRAM_ID,
      portfolio: portfolioPDA,
      tokenDetails: tokenDetailsPDA,
      tokenVault: tokenVaultPDA,
      solVault: nativeVaultPDA,
      from: from,
      to: to,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      trader: authority.publicKey,
      airdropVault: airdropVaultPDA,
      //@ts-ignore
      systemProgram: web3.SystemProgram.programId,
      tokenMint: tokenMint,
      swapQueueEntry: pendingSwapsEntryPDA,
    })
    .remainingAccounts(remainingAccounts)
    .signers([authority])
    .rpc();
};
