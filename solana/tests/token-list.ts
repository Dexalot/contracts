import { Keypair, PublicKey } from "@solana/web3.js";
import { Dexalot } from "../target/types/dexalot";
import { Program } from "@coral-xyz/anchor";
import { getAccountPubKey } from "../sdk/utils";
import { TOKEN_LIST_SEED } from "../sdk/consts";

export const getTokenList = async (
  dexalotProgram: Program<Dexalot>
): Promise<string[]> => {
  const tokenListPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(TOKEN_LIST_SEED),
    Buffer.from("0"),
  ]);
  let tokenListAccount = await dexalotProgram.account.tokenList.fetch(
    tokenListPDA
  );

  const tokens = tokenListAccount.tokens.map((tokenMintAddress) => {
    return tokenMintAddress.toBase58().replace(/\0/g, "");
  });

  return tokens;
};
