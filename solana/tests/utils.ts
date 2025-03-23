import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";

export const getLayerZeroQuoteSendRemainingAccounts = () => {
  const sendFileContent = fs.readFileSync("./tests/sendRA.txt", "utf8");
  const sendRemainingAccounts = JSON.parse(sendFileContent).map(
    (a: { pubkey: string; isWritable: boolean; isSigner: boolean }) => ({
      pubkey: new PublicKey(a.pubkey),
      isWritable: a.isWritable,
      isSigner: a.isSigner,
    })
  );

  const quoteFileContent = fs.readFileSync("./tests/quoteRA.txt", "utf8");
  const quoteRemainingAccounts = JSON.parse(quoteFileContent).map(
    (a: { pubkey: string; isWritable: boolean; isSigner: boolean }) => ({
      pubkey: new PublicKey(a.pubkey),
      isWritable: a.isWritable,
      isSigner: a.isSigner,
    })
  );

  return [...quoteRemainingAccounts, ...sendRemainingAccounts];
};
