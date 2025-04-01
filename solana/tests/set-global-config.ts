import { BN, Program, web3 } from "@coral-xyz/anchor";
import { ADMIN_SEED, PORTFOLIO_SEED } from "../sdk/consts";
import { getAccountPubKey } from "../sdk/utils";
import { Dexalot } from "../target/types/dexalot";
import { Keypair } from "@solana/web3.js";

export const setPause = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair,
  pause: boolean
) => {
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.publicKey.toBuffer(),
  ]);
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);

  const tx = await dexalotProgram.methods
    .setPaused(pause)
    .accounts({
      authority: admin.publicKey,
      // @ts-ignore
      admin: adminPDA,
      systemProgram: web3.SystemProgram.programId,
      portfolio,
    })
    .signers([admin])
    .rpc();
};

export const setAllowDeposit = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair,
  allow: boolean
) => {
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.publicKey.toBuffer(),
  ]);
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);

  await dexalotProgram.methods
    .setAllowDeposit(allow)
    .accounts({
      authority: admin.publicKey,
      // @ts-ignore
      admin: adminPDA,
      systemProgram: web3.SystemProgram.programId,
      portfolio,
    })
    .signers([admin])
    .rpc();
};

export const setNativeDepositsRestricted = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair,
  enabled: boolean
) => {
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.publicKey.toBuffer(),
  ]);
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);

  await dexalotProgram.methods
    .setNativeDepositsRestricted(enabled)
    .accounts({
      authority: admin.publicKey,
      // @ts-ignore
      admin: adminPDA,
      systemProgram: web3.SystemProgram.programId,
      portfolio,
    })
    .signers([admin])
    .rpc();
};

export const setSwapSigner = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair,
  swapSigner: string
) => {
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.publicKey.toBuffer(),
  ]);
  await dexalotProgram.methods
    .setSwapSigner({ swapSigner: Array.from(Buffer.from(swapSigner, "hex")) })
    .accounts({
      authority: admin.publicKey,
      //@ts-ignore
      portfolio: portfolio,
      admin: adminPDA,
    })
    .signers([admin])
    .rpc();
};

export const setDefaultChainEid = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair,
  defaultChainEid: number
) => {
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.publicKey.toBuffer(),
  ]);
  await dexalotProgram.methods
    .setDefaultChain({ chainId: defaultChainEid })
    .accounts({
      authority: admin.publicKey,
      //@ts-ignore
      portfolio: portfolio,
      admin: adminPDA,
    })
    .signers([admin])
    .rpc();
};

export const setAirdropAmount = async (
  dexalotProgram: Program<Dexalot>,
  admin: Keypair,
  amount: number
) => {
  const portfolio = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const adminPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(ADMIN_SEED),
    admin.publicKey.toBuffer(),
  ]);
  await dexalotProgram.methods
    .setAirdropAmount({ amount: new BN(amount) })
    .accounts({
      authority: admin.publicKey,
      //@ts-ignore
      portfolio: portfolio,
      admin: adminPDA,
    })
    .signers([admin])
    .rpc();
};
