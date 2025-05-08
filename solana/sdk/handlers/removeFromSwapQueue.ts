import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createDefaultAccount,
  createSpinner,
  getAccountPubKey,
  getUserInput,
  printTransactionEvents,
} from "../utils";
import { Dexalot } from "../../target/types/dexalot";
import { Program, web3 } from "@coral-xyz/anchor";
import {
  AIRDROP_VAULT_SEED,
  PORTFOLIO_SEED,
  SOL_VAULT_SEED,
  SPL_VAULT_SEED,
} from "../consts";
import pdaDeriver from "../pda-deriver";
import { green } from "kleur";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const spinner = createSpinner();

export const removeFromSwapQueue = async (
  connection: Connection,
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const nonceHex = await getUserInput("Enter the nonce bytes: "); // "0x0000000000000000000000000001"
  const nonceHexWithoutPrefix = nonceHex.startsWith("0x")
    ? nonceHex.slice(2)
    : nonceHex;
  const nonce = Buffer.from(nonceHexWithoutPrefix, "hex").subarray(-12); // Take last 12 bytes

  const trader = new PublicKey(await getUserInput("Enter the trader: "));
  try {
    spinner.start();
    const solVaultPDA = getAccountPubKey(program, [
      Buffer.from(SOL_VAULT_SEED),
    ]);

    const splVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const airdropVaultPDA = getAccountPubKey(program, [
      Buffer.from(AIRDROP_VAULT_SEED),
    ]);

    const portfolioPDA = getAccountPubKey(program, [
      Buffer.from(PORTFOLIO_SEED),
    ]);

    const [pendingSwapPDA] = pdaDeriver.pendingSwapsEntry(nonce, trader);
    const pendingSwap = await program.account.pendingSwap.fetch(pendingSwapPDA);

    if (!pendingSwap) {
      throw new Error("Pending swap not found!");
    }

    const fromATA = !pendingSwap.tokenMint.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          authority,
          pendingSwap.tokenMint,
          splVaultPDA,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const toATA = !pendingSwap.tokenMint.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          authority,
          pendingSwap.tokenMint,
          pendingSwap.trader,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();



    const tx = await program.methods
      .removeFromSwapQueue({ nonce: Array.from(nonce), destTrader: trader })
      .accounts({
        // @ts-ignore
        splVault: splVaultPDA,
        solVault: solVaultPDA,
        from: fromATA.address,
        to: toATA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        trader: pendingSwap.trader,
        systemProgram: web3.SystemProgram.programId,
        swapQueueEntry: pendingSwapPDA,
        airdropVault: airdropVaultPDA,
        portfolio: portfolioPDA,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`Pending swap removed ${pendingSwapPDA}: ${tx}\n\n`));
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
