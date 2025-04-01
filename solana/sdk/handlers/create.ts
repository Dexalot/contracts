import { Connection, Keypair } from "@solana/web3.js";
import { Dexalot } from "../../target/types/dexalot";
import { Program, web3 } from "@coral-xyz/anchor";
import { createSpinner, getUserInput } from "../utils";
import * as fs from "fs";

const spinner = createSpinner();

export const createAccount = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  const keyPath = await getUserInput("Enter the path to the wallet file: ");

  if (!fs.existsSync(keyPath)) {
    throw new Error("Wallet file does not exist");
  }

  const secretKeyArray = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const secretKey = new Uint8Array(secretKeyArray);

  const traderKeypair = Keypair.fromSecretKey(secretKey);

  spinner.start();
  try {
    await program.methods
      .createAccount()
      .accounts({
        //@ts-ignore
        systemProgram: web3.SystemProgram.programId,
        payer: admin.publicKey,
        user: traderKeypair.publicKey,
      })
      .signers([admin, traderKeypair])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log("Account created");
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
