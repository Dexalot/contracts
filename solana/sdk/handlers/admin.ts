import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createSpinner, getAccountPubKey, getUserInput } from "../utils";
import { ADMIN_SEED } from "../consts";

const spinner = createSpinner();

export const addAdmin = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const newAdmin = new PublicKey(
    await getUserInput("Enter the public key of the new admin: ")
  );
  const newAdminPDA = getAccountPubKey(program, [
    Buffer.from(ADMIN_SEED),
    newAdmin.toBuffer(),
  ]);

  const adminPDA = getAccountPubKey(program, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  // Call the addAdmin instruction
  try {
    spinner.start();
    await program.methods
      .addAdmin({ account: newAdmin })
      .accounts({
        // @ts-ignore
        admin: adminPDA,
        newAdmin: newAdminPDA,
        systemProgram: web3.SystemProgram.programId,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`New admin added: ${newAdmin.toBase58()}`);
  } catch (error) {
    spinner.stop(true);
    throw error;
  }
};

export const removeAdmin = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const adminToRemove = new PublicKey(await getUserInput(
    "Enter the public key of the admin to remove: "
  ));

  const adminToRemovePDA = getAccountPubKey(program, [
    Buffer.from(ADMIN_SEED),
    adminToRemove.toBuffer(),
  ]);

  const adminPDA = getAccountPubKey(program, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  try {
    spinner.start();
    await program.methods
      .removeAdmin({ account: adminToRemove })
      .accounts({
        // @ts-ignore
        admin: adminPDA,
        adminToRemove: adminToRemovePDA,
        systemProgram: web3.SystemProgram.programId,
        receiver: authority.publicKey, // Refund lamports to the remover
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Admin removed: ${adminToRemove.toBase58()}`);
  } catch (error) {
    spinner.stop(true);
    throw error;
  }
};
