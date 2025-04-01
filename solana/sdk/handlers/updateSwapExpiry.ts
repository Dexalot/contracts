import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createSpinner,
  getAccountPubKey,
  getUserInput,
  printTransactionEvents,
} from "../utils";
import { green } from "kleur";
import { REBALANCER_SEED } from "../consts";
import pdaDeriver from "../pda-deriver";

const spinner = createSpinner();

export const updateSwapExpiry = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const nonceHex = await getUserInput("Enter the nonce bytes: "); // "0x0000000000000000000000000001"
  const nonceHexWithoutPrefix = nonceHex.startsWith("0x")
    ? nonceHex.slice(2)
    : nonceHex;
  const nonce = Buffer.from(nonceHexWithoutPrefix, "hex").subarray(-12); // Take last 12 bytes

  const trader = new PublicKey(
    await getUserInput("Enter the trader public key: ")
  );

  try {
    spinner.start();
    const rebalancerPDA = getAccountPubKey(program, [
      Buffer.from(REBALANCER_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const [completedSwapsEntryPDA] = pdaDeriver.completedSwapsEntry(
      nonce,
      trader
    );

    const tx = await program.methods
      .updateSwapExpiry({ nonce: Array.from(nonce), trader })
      .accounts({
        authority: authority.publicKey,
        completedSwapEntry: completedSwapsEntryPDA,
        //@ts-ignore
        rebalancer: rebalancerPDA,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(
      green(
        `Update swap expiry ${completedSwapsEntryPDA.toBase58()}. Tx: ${tx}\n\n`
      )
    );
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
