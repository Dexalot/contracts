import { BN, Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { createSpinner, getAccountPubKey, getUserInput } from "../utils";
import { green } from "kleur";
import {
  ADMIN_SEED,
  AIRDROP_VAULT_SEED,
  PORTFOLIO_SEED,
  REBALANCER_SEED,
  SOL_VAULT_SEED,
  SPL_VAULT_SEED,
  TOKEN_DETAILS_SEED,
} from "../consts";

import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const spinner = createSpinner();

export const claimSplBalance = async (
  connection: Connection,
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const amount = Number(await getUserInput("Enter the amount to claim: "));

  const tokenAddress = new PublicKey(
    await getUserInput("Enter the token address: ")
  );

  try {
    spinner.start();
    const tokenDetailsPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_DETAILS_SEED),
      tokenAddress.toBuffer(),
    ]);
    const tokenDetails = await program.account.tokenDetails.fetch(
      tokenDetailsPDA
    );

    if (!tokenDetails.tokenAddress) {
      throw new Error("Token address not found!");
    }

    const rebalancerPDA = getAccountPubKey(program, [
      Buffer.from(REBALANCER_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const splVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const authorityATA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      tokenAddress,
      authority.publicKey,
      true,
      "finalized",
      { commitment: "finalized" }
    );

    // Fetch the program's vault associated token account
    const vaultATA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      tokenAddress,
      splVaultPDA,
      true,
      "finalized",
      { commitment: "finalized" }
    );
    const portfolio = getAccountPubKey(program, [Buffer.from(PORTFOLIO_SEED)]);
    const tx = await program.methods
      .claimSplBalance({
        amount: new BN(amount * 10 ** tokenDetails.decimals),
        tokenAddress,
      })
      .accounts({
        authority: authority.publicKey,
        //@ts-ignore
        rebalancer: rebalancerPDA,
        splVault: splVaultPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        mint: tokenAddress,
        from: vaultATA.address,
        to: authorityATA.address,
        portfolio: portfolio,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`Balance claimed. Tx: ${tx}\n\n`));
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const claimNativeBalance = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const amount =
    Number(await getUserInput("Enter the amount of SOL to claim: ")) *
    LAMPORTS_PER_SOL;

  try {
    spinner.start();

    const rebalancerPDA = getAccountPubKey(program, [
      Buffer.from(REBALANCER_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const solVaultPDA = getAccountPubKey(program, [
      Buffer.from(SOL_VAULT_SEED),
    ]);
    const portfolio = getAccountPubKey(program, [Buffer.from(PORTFOLIO_SEED)]);
    const tx = await program.methods
      .claimNativeBalance({
        amount: new BN(amount),
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
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`SOL balance claimed. Tx: ${tx}\n\n`));
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const claimAirdropBalance = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const amount =
    Number(await getUserInput("Enter the amount of SOL to claim: ")) *
    LAMPORTS_PER_SOL;

  try {
    spinner.start();

    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const airdropVaultPDA = getAccountPubKey(program, [
      Buffer.from(AIRDROP_VAULT_SEED),
    ]);
    const portfolio = getAccountPubKey(program, [Buffer.from(PORTFOLIO_SEED)]);
    const tx = await program.methods
      .claimAirdropBalance({
        amount: new BN(amount),
      })
      .accounts({
        authority: authority.publicKey,
        //@ts-ignore
        admin: adminPDA,
        airdropVault: airdropVaultPDA,
        portfolio: portfolio,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`SOL balance claimed. Tx: ${tx}\n\n`));
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
