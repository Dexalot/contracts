import { web3 } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export const generateLookupTable = async (
  connection: Connection,
  payer: Keypair,
  altAccounts: PublicKey[]
): Promise<PublicKey> => {
  const slot = await connection.getSlot("finalized");

  const [lookupTableInst, lookupTableAddress] =
    web3.AddressLookupTableProgram.createLookupTable({
      authority: payer.publicKey,
      payer: payer.publicKey,
      recentSlot: slot - 10, // to be sure that our slot is in a block
    });

  const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: lookupTableAddress,
    addresses: altAccounts,
  });

  const tx = new web3.Transaction().add(lookupTableInst, extendInstruction);
  await web3.sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "finalized",
  });
  await new Promise((resolve) => setTimeout(resolve, 5000)); // wait a few slots
  console.log(
    `Lookup table populated and created at ${lookupTableAddress.toBase58()}!`
  );
  return lookupTableAddress;
};
