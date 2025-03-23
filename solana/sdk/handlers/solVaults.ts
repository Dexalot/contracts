import { Connection } from "@solana/web3.js";
import { createSpinner, getAccountPubKey } from "../utils";
import { Dexalot } from "../../target/types/dexalot";
import { Program, web3 } from "@coral-xyz/anchor";
import {
  AIRDROP_VAULT_SEED,
  SOL_USER_FUNDS_VAULT_SEED,
  SOL_VAULT_SEED,
} from "../consts";
import { green } from "kleur";

const spinner = createSpinner();

export const getSolVaultBalance = async (
  connection: Connection,
  program: Program<Dexalot>
) => {
  try {
    spinner.start();
    const nativeVaultPDA = getAccountPubKey(program, [
      Buffer.from(SOL_VAULT_SEED),
    ]);
    const balance = await connection.getBalance(nativeVaultPDA);

    spinner.stop();
    console.clear();
    console.log(
      green(`Program balance: ${balance / web3.LAMPORTS_PER_SOL} SOL\n\n`)
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getAirdropVaultBalance = async (
  connection: Connection,
  program: Program<Dexalot>
) => {
  try {
    spinner.start();
    const airdropVaultPDA = getAccountPubKey(program, [
      Buffer.from(AIRDROP_VAULT_SEED),
    ]);
    const balance = await connection.getBalance(airdropVaultPDA);

    spinner.stop();
    console.clear();
    console.log(
      green(
        `Available balance for airdrops: ${
          balance / web3.LAMPORTS_PER_SOL
        } SOL\n\n`
      )
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getSolUserFundsVaultBalance = async (
  connection: Connection,
  program: Program<Dexalot>
) => {
  try {
    spinner.start();
    const solUserFudnsVaultPDA = getAccountPubKey(program, [
      Buffer.from(SOL_USER_FUNDS_VAULT_SEED),
    ]);

    const balance = await connection.getBalance(solUserFudnsVaultPDA);

    spinner.stop();
    console.clear();
    console.log(
      green(
        `Available balance in SOL User Funds vault: ${
          balance / web3.LAMPORTS_PER_SOL
        } SOL\n\n`
      )
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
