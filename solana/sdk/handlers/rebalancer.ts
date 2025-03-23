import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createSpinner, getAccountPubKey, getUserInput } from "../utils";
import { ADMIN_SEED, REBALANCER_SEED } from "../consts";

const spinner = createSpinner();

export const addRebalancer = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const newRebalancer = new PublicKey(
    await getUserInput("Enter the new rebalancer public key: ")
  );

  const newRebalancerPDA = getAccountPubKey(program, [
    Buffer.from(REBALANCER_SEED),
    newRebalancer.toBuffer(),
  ]);

  const adminPDA = getAccountPubKey(program, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  try {
    spinner.start();
    await program.methods
      .addRebalancer({ account: newRebalancer })
      .accounts({
        authority: authority.publicKey,
        // @ts-ignore
        admin: adminPDA,
        newRebalancer: newRebalancerPDA,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`New rebalancer added: ${newRebalancer.toBase58()}`);
  } catch (error) {
    spinner.stop(true);
    throw error;
  }
};

export const removeRebalancer = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const rebalancerToRemove = new PublicKey(await getUserInput(
    "Enter the public key of the rebalancer to remove: "
  ));

  const rebalancerPDA = getAccountPubKey(program, [
    Buffer.from(REBALANCER_SEED),
    rebalancerToRemove.toBuffer(),
  ]);

  const adminPDA = getAccountPubKey(program, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  try {
    spinner.start();
    await program.methods
      .removeRebalancer({ account:  rebalancerToRemove })
      .accounts({
        authority: authority.publicKey,
        // @ts-ignore
        admin: adminPDA,
        receiver: authority.publicKey, // Refund lamports to the remover
        rebalancerToRemove: rebalancerPDA,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Rebalancer removed: ${rebalancerToRemove.toBase58()}`);
  } catch (error) {
    spinner.stop(true);
    throw error;
  }
};
