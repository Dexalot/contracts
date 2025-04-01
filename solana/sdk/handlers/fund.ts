import { BN, Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { createSpinner, getAccountPubKey, getUserInput } from "../utils";
import { REBALANCER_SEED, SOL_VAULT_SEED, SPL_VAULT_SEED } from "../consts";
import { green } from "kleur";
import {
  getMint,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const spinner = createSpinner();

export const fundSol = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const amount =
    Number(await getUserInput("Enter the amount of SOL to fund: ")) *
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

    const tx = await program.methods
      .fundSol({
        amount: new BN(amount),
      })
      .accounts({
        authority: authority.publicKey,
        //@ts-ignore
        rebalancer: rebalancerPDA,
        solVault: solVaultPDA,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`SOL balance funded. Tx: ${tx}\n\n`));
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const fundSpl = async (
  connection: Connection,
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const tokenMint = new PublicKey(
    await getUserInput("Enter the token mint address: ")
  );
  const amount = Number(
    await getUserInput("Enter the amount of SPL to fund: ")
  );

  try {
    spinner.start();

    const mintAccount = await getMint(
      connection,
      tokenMint,
      "finalized",
      TOKEN_PROGRAM_ID
    );

    const tokenDecimals = mintAccount.decimals;

    const rebalancerPDA = getAccountPubKey(program, [
      Buffer.from(REBALANCER_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const splVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const userATA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      tokenMint,
      authority.publicKey, // User authority
      true,
      "finalized",
      { commitment: "finalized" }
    );

    // Fetch the program's vault associated token account
    const vaultATA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      tokenMint,
      splVaultPDA,
      true,
      "finalized",
      { commitment: "finalized" }
    );

    const tx = await program.methods
      .fundSpl({
        tokenMint,
        amount: new BN(amount * 10 ** tokenDecimals),
      })
      .accounts({
        authority: authority.publicKey,
        //@ts-ignore
        rebalancer: rebalancerPDA,
        splVault: splVaultPDA,
        from: userATA.address,
        to: vaultATA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(
      green(`SPL balance of ${tokenMint.toBase58()} funded. Tx: ${tx}\n\n`)
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
