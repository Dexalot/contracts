import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import { Keypair } from "@solana/web3.js";
import { getAccountPubKey } from "../sdk/utils";
import { ADMIN_SEED, PORTFOLIO_SEED } from "../sdk/consts";
import { arrayify, hexZeroPad } from "@ethersproject/bytes";
import pdaDeriver from "../sdk/pda-deriver";

export const setRemote = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  dstId: number,
  remotePeer: string
) => {
  const [remotePDA] = pdaDeriver.remote(dstId);
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const remotePeerBytes = Array.from(arrayify(hexZeroPad(remotePeer, 32)));
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  await dexalotProgram.methods
    .setRemote({
      dstEid: dstId,
      remote: remotePeerBytes,
    })
    .accounts({
      payer: authority.publicKey,
      //@ts-ignore
      remote: remotePDA,
      portfolio: portfolio,
      admin: adminPDA,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
};
