import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import { createSpinner, getAccountPubKey, getUserInput } from "../utils";
import { Keypair, PublicKey } from "@solana/web3.js";
import pdaDeriver from "../pda-deriver";
import { remotePeers } from "../layerzero";
import { arrayify, hexZeroPad } from "@ethersproject/bytes";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { ADMIN_SEED } from "../consts";

const spinner = createSpinner();

export const setRemote = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  spinner.start();
  try {
    const [portfolioPDA] = pdaDeriver.portfolio();

    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      authority.publicKey.toBuffer(),
    ]);

    for (const [remoteStr, remotePeer] of Object.entries(remotePeers)) {
      const remotePeerBytes = Array.from(arrayify(hexZeroPad(remotePeer, 32)));
      const [remotePDA] = pdaDeriver.remote(Number(remoteStr));
      await program.methods
        .setRemote({
          dstEid: Number(remoteStr),
          remote: remotePeerBytes,
        })
        .accounts({
          payer: authority.publicKey,
          //@ts-ignore
          remote: remotePDA,
          portfolio: portfolioPDA,
          admin: adminPDA,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc({ commitment: "finalized" });
    }
    spinner.stop();
    console.clear();
    console.log("Remote set");
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getRemote = async (program: Program<Dexalot>): Promise<void> => {
  try {
    const dstEid = parseInt(
      await getUserInput("Enter the destination endpoint id: ")
    );
    const [remotePDA] = pdaDeriver.remote(dstEid as EndpointId);

    const remote = await program.account.remote.fetch(remotePDA);
    const peer = "0x" + Buffer.from(remote.address).toString("hex");
    console.log(peer);
  } catch (e) {
    // remote not initialized
    console.log(e);
  }
};

export const getPortfolioPDA = (): PublicKey => {
  return pdaDeriver.portfolio()[0];
};
