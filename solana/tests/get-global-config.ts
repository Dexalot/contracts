import { Program } from "@coral-xyz/anchor";
import { Dexalot } from "../target/types/dexalot";
import { getAccountPubKey } from "../sdk/utils";
import { ADMIN_SEED, PORTFOLIO_SEED } from "../sdk/consts";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export const getGlobalConfig = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair
) => {
  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);

  const globalConfig = (
    await dexalotProgram.account.portfolio.fetch(portfolioPDA)
  ).globalConfig;

  return globalConfig;
};
