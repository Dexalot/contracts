import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import {
  createSpinner,
  getAccountPubKey,
  getUserInput,
  printTransactionEvents,
} from "../utils";
import { Keypair } from "@solana/web3.js";
import { ADMIN_SEED, BANNED_ACCOUNT_SEED } from "../consts";
import { green } from "kleur";

const spinner = createSpinner();

export const banAccount = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const input = await getUserInput(
    "Enter the Public key of the account to ban: "
  );
  try {
    spinner.start();
    const banReason = { abuse: {} };
    const bannedAccount = new web3.PublicKey(input);

    const bannedAccountPDA = getAccountPubKey(program, [
      Buffer.from(BANNED_ACCOUNT_SEED),
      bannedAccount.toBuffer(),
    ]);

    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const tx = await program.methods
      .banAccount({ account: bannedAccount, reason: banReason })
      .accounts({
        //@ts-ignore
        admin: adminPDA,
        bannedAccount: bannedAccountPDA,
        systemProgram: web3.SystemProgram.programId,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`Account ${bannedAccount.toBase58()} banned\n\n`));
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const unbanAccount = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const input = await getUserInput(
    "Enter the Public key of the account to unban: "
  );
  try {
    spinner.start();
    const bannedAccount = new web3.PublicKey(input);

    const bannedAccountPDA = getAccountPubKey(program, [
      Buffer.from(BANNED_ACCOUNT_SEED),
      bannedAccount.toBuffer(),
    ]);

    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const tx = await program.methods
      .unbanAccount({ account: bannedAccount })
      .accounts({
        //@ts-ignore
        admin: adminPDA,
        bannedAccount: bannedAccountPDA,
        systemProgram: web3.SystemProgram.programId,
        authority: authority.publicKey,
        receiver: authority.publicKey,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`Account ${bannedAccount.toBase58()} unbanned\n\n`));
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
