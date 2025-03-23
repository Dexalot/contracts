import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccountPubKey } from "../sdk/utils";
import { ADMIN_SEED } from "../sdk/consts";

export const addAdmin = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  admin: PublicKey
) => {
  const newAdminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.toBuffer(),
  ]);

  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  await dexalotProgram.methods
    .addAdmin({ account: admin })
    .accounts({
      // @ts-ignore
      admin: adminPDA,
      newAdmin: newAdminPDA,
      systemProgram: web3.SystemProgram.programId,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();
};

export const removeAdmin = async (
    dexalotProgram: Program<Dexalot>,
    authority: Keypair,
    admin: PublicKey
  ) => {
    const adminToRemovePDA = getAccountPubKey(dexalotProgram, [
        Buffer.from(ADMIN_SEED),
        admin.toBuffer(),
      ]);
    
      const adminPDA = getAccountPubKey(dexalotProgram, [
        Buffer.from(ADMIN_SEED),
        authority.publicKey.toBuffer(),
      ]);
    await dexalotProgram.methods
    .removeAdmin({ account: admin })
    .accounts({
      // @ts-ignore
      admin: adminPDA,
      adminToRemove: adminToRemovePDA,
      systemProgram: web3.SystemProgram.programId,
      receiver: authority.publicKey, // Refund lamports to the remover
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();
  }