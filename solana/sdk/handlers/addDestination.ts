import { BN, Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createSpinner, getAccountPubKey, getUserInput } from "../utils";
import { ADMIN_SEED, CCTRADE_ALLOWED_DEST_SEED } from "../consts";

const spinner = createSpinner();

export const addDestination = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const eid = Number(await getUserInput("Enter the Endpoint ID: "));
  const tokenAddressInput = await getUserInput("Enter the token address: ");
  let tokenAddress = PublicKey.default;
  if (tokenAddressInput) {
    tokenAddress = new PublicKey(tokenAddressInput);
  }

  const adminPDA = getAccountPubKey(program, [
    Buffer.from(ADMIN_SEED),
    authority.publicKey.toBuffer(),
  ]);

  const destinationEntry = getAccountPubKey(program, [
    Buffer.from(CCTRADE_ALLOWED_DEST_SEED),
    new BN(eid).toArrayLike(Buffer, "be", 4),
    tokenAddress.toBytes(),
  ]);

  // Call the addAdmin instruction
  try {
    spinner.start();
    await program.methods
      .addDestination({ eid, tokenAddress })
      .accounts({
        payer: authority.publicKey,
        // @ts-ignore
        systemProgram: web3.SystemProgram.programId,
        destinationEntry: destinationEntry,
        admin: adminPDA,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(
      `New allowed destination added: ${tokenAddress.toBase58()} on network eid: ${eid}`
    );
  } catch (error) {
    spinner.stop(true);
    throw error;
  }
};
