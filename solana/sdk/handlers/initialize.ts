import { Keypair } from "@solana/web3.js";
import { Dexalot } from "../../target/types/dexalot";
import { createSpinner, getAccountPubKey } from "../utils";
import { Program, web3 } from "@coral-xyz/anchor";
import { ADMIN_SEED, DEST_ID, PORTFOLIO_SEED } from "../consts";
import { endpointProgram } from "../layerzero";

const spinner = createSpinner();

const signer_pubkey = "4747b7f5c40599E1C5CF5a72C535D953B64916b6";

export const initialize = async (program: Program<Dexalot>, admin: Keypair) => {
  spinner.start();
  try {
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      admin.publicKey.toBuffer(),
    ]);

    const portfolioPDA = getAccountPubKey(program, [
      Buffer.from(PORTFOLIO_SEED),
    ]);

    const register_remaining_accounts =
      endpointProgram.getRegisterOappIxAccountMetaForCPI(
        admin.publicKey,
        portfolioPDA
      );
    await program.methods
      .initialize({
        defaultChainId: DEST_ID,
        swapSigner: Array.from(Buffer.from(signer_pubkey, "hex")),
      })
      .accounts({
        //@ts-ignore
        portfolio: portfolioPDA,

        admin: adminPDA,
        authority: admin.publicKey,
        systemProgram: web3.SystemProgram.programId,
        endpointProgram: endpointProgram.program,
      })
      .remainingAccounts(register_remaining_accounts)
      .signers([admin])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log("Dexalot initialized");
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
