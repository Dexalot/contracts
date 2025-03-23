// @ts-ignore-line
import readline from "readline";
import { BorshCoder, EventParser, web3 } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import {
  Connection,
  PublicKey,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import { buildVersionedTransaction } from "@layerzerolabs/lz-solana-sdk-v2";
import { green } from "kleur";
import { Account } from "@solana/spl-token";
import { keccak256 } from "@layerzerolabs/lz-v2-utilities";

export const getUserInput = (question: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

export const getAccountPubKey = (
  program: Program<Dexalot>,
  seed: any[]
): web3.PublicKey => {
  let [pubkey, bump] = web3.PublicKey.findProgramAddressSync(
    seed,
    program.programId
  );

  return pubkey;
};

export const padSymbol = (symbol: string): Uint8Array => {
  const buffer = Buffer.alloc(32, 0); // Initialize a 32-byte buffer filled with zeros
  const symbolBuffer = Buffer.from(symbol);
  if (symbolBuffer.length > 32) {
    throw new Error("Symbol exceeds 32 bytes");
  }
  symbolBuffer.copy(buffer, 0); // Copy the symbol bytes to the start of the buffer
  return buffer;
};

export const printTransactionEvents = async (
  program: Program<Dexalot>,
  tx: string
) => {
  const transaction = await program.provider.connection.getTransaction(tx, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  const eventParser = new EventParser(
    program.programId,
    new BorshCoder(program.idl)
  );
  const events = [
    ...eventParser.parseLogs(transaction?.meta?.logMessages ?? []),
  ];
  if (events.length > 0) {
    console.log("==Events==");
    for (let event of events) {
      console.log(event);
    }
  }
};

export async function sendAndConfirm(
  connection: Connection,
  signers: Signer[],
  instructions: TransactionInstruction[]
): Promise<void> {
  const tx = await buildVersionedTransaction(
    connection as any,
    signers[0].publicKey,
    instructions,
    "confirmed"
  );
  tx.sign(signers);
  const hash = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });
  console.log(`Tx hash: ${hash}`);
  await connection.confirmTransaction(hash, "confirmed");
}

export function createSpinner() {
  const Spinner = require("cli-spinner").Spinner;
  const spinner = new Spinner(green("%s Processing.."));
  spinner.setSpinnerString(20);
  return spinner;
}

export const createDefaultAccount = (): Account => ({
  address: new PublicKey("FqUrzy7WDEk3zTU4cG1P3Yv5H4HC7ysvMWFJDM2LXfXu"), // this is dummy value, not used in our calculations
  owner: new PublicKey("FqUrzy7WDEk3zTU4cG1P3Yv5H4HC7ysvMWFJDM2LXfXu"),
  amount: BigInt(0),
  mint: new PublicKey("FqUrzy7WDEk3zTU4cG1P3Yv5H4HC7ysvMWFJDM2LXfXu"),
  delegate: null,
  delegatedAmount: BigInt(0),
  isNative: false,
  isInitialized: true,
  isFrozen: false,
  closeAuthority: null,
  rentExemptReserve: BigInt(0),
  tlvData: Buffer.from([]),
});

export const generateUniqueNonce = (): Buffer => {
  const nonce = Buffer.alloc(12, 0); // Create 12-byte buffer initialized with zeros
  const timestamp = Buffer.from(
    keccak256(Buffer.from(Date.now().toString())).slice(2, 10),
    "hex"
  );
  timestamp.copy(nonce, nonce.length - timestamp.length); // Copy timestamp to end of buffer
  return nonce;
};
