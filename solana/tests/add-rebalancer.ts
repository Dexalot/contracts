import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import { Keypair } from "@solana/web3.js";
import { getAccountPubKey } from "../sdk/utils";
import { ADMIN_SEED, REBALANCER_SEED } from "../sdk/consts";

export const addRebalancer = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair
) => {
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.publicKey.toBuffer(),
  ]);

  const rebalancerPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(REBALANCER_SEED),
    admin.publicKey.toBuffer(),
  ]);

  await dexalotProgram.methods
    .addRebalancer({ account: admin.publicKey })
    .accounts({
      authority: admin.publicKey,
      // @ts-ignore
      admin: adminPDA,
      newRebalancer: rebalancerPDA,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([admin])
    .rpc();
};
