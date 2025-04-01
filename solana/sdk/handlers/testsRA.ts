import { hexlify } from "@ethersproject/bytes";
import { EndpointProgram } from "@layerzerolabs/lz-solana-sdk-v2";
import { PacketPath } from "@layerzerolabs/lz-v2-utilities";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { Dexalot } from "../../target/types/dexalot";
import { Program } from "@coral-xyz/anchor";
import pdaDeriver from "../pda-deriver";
import { getSendLibraryProgram } from "../layerzero";
import * as fs from "fs";
import { endpointProgram } from "../layerzero";
import { createSpinner } from "../utils";
import { DEST_ID, SOLANA_ID } from "../consts";
const spinner = createSpinner();

export const generateIntegrationTestsRemainingAccounts = async (
  connection: Connection,
  authority: Keypair,
  program: Program<Dexalot>
) => {
  const [portfolioPDA] = pdaDeriver.portfolio();
  const [remotePDA] = pdaDeriver.remote(DEST_ID);
  const remote = await program.account.remote.fetch(remotePDA);

  const msgLibProgram = await getSendLibraryProgram(
    connection,
    authority.publicKey,
    DEST_ID,
    endpointProgram
  );

  const packetPath: PacketPath = {
    srcEid: SOLANA_ID,
    dstEid: DEST_ID,
    sender: hexlify(portfolioPDA.toBytes()),
    receiver: hexlify(remote.address),
  };
  try {
    spinner.start();
    const sendRemainingAccounts =
      await endpointProgram.getSendIXAccountMetaForCPI(
        connection as any,
        authority.publicKey,
        packetPath,
        msgLibProgram,
        "finalized"
      );

    fs.writeFileSync(
      "../tests/sendRA.txt",
      JSON.stringify(sendRemainingAccounts, null, 2),
      "utf8"
    );

    const quoteRemainingAccounts =
      await endpointProgram.getQuoteIXAccountMetaForCPI(
        connection as any,
        authority.publicKey,
        packetPath,
        msgLibProgram
      );

    fs.writeFileSync(
      "../tests/quoteRA.txt",
      JSON.stringify(quoteRemainingAccounts, null, 2),
      "utf8"
    );
    spinner.stop();
    console.clear();
    console.log(`Done`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
