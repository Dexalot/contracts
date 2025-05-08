import { BN, Program, web3 } from "@coral-xyz/anchor";
import { createSpinner, getAccountPubKey, getUserInput } from "../utils";
import { Dexalot } from "../../target/types/dexalot";
import { Keypair } from "@solana/web3.js";
import { ADMIN_SEED, PORTFOLIO_SEED } from "../consts";
import { green } from "kleur";
import pdaDeriver from "../pda-deriver";

const spinner = createSpinner();

export const pauseProgram = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  try {
    spinner.start();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      authority.publicKey.toBuffer(),
    ]);
    const portfolio = getAccountPubKey(program, [Buffer.from(PORTFOLIO_SEED)]);

    const tx = await program.methods
      .setPaused(true)
      .accounts({
        authority: authority.publicKey,
        // @ts-ignore
        admin: adminPDA,
        systemProgram: web3.SystemProgram.programId,
        portfolio,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`Program paused\n\n`));
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const unpauseProgram = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  try {
    spinner.start();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      authority.publicKey.toBuffer(),
    ]);
    const portfolio = getAccountPubKey(program, [Buffer.from(PORTFOLIO_SEED)]);

    await program.methods
      .setPaused(false)
      .accounts({
        authority: authority.publicKey,
        // @ts-ignore
        admin: adminPDA,
        systemProgram: web3.SystemProgram.programId,
        portfolio,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(green(`Program unpaused\n\n`));
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const setDefaultChainEid = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  const dstEid = parseInt(await getUserInput("Enter the default chain EID: "));
  try {
    spinner.start();

    const [portfolioPDA] = pdaDeriver.portfolio();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      admin.publicKey.toBuffer(),
    ]);

    await program.methods
      .setDefaultChain({ chainId: dstEid })
      .accounts({
        authority: admin.publicKey,
        //@ts-ignore
        portfolio: portfolioPDA,
        admin: adminPDA,
      })
      .signers([admin])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Default chain Eid set to ${dstEid}`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const setAirdropAmount = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  const amount = parseInt(
    await getUserInput("Enter the airdrop amount in lamports: \n")
  );
  try {
    spinner.start();
    const [portfolioPDA] = pdaDeriver.portfolio();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      admin.publicKey.toBuffer(),
    ]);
    await program.methods
      .setAirdropAmount({ amount: new BN(amount) })
      .accounts({
        authority: admin.publicKey,
        //@ts-ignore
        portfolio: portfolioPDA,
        admin: adminPDA,
      })
      .signers([admin])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Airdrop amount set to ${amount} lamports`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const enableAllowDeposit = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  try {
    spinner.start();
    const [portfolioPDA] = pdaDeriver.portfolio();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      admin.publicKey.toBuffer(),
    ]);
    await program.methods
      .setAllowDeposit(true)
      .accounts({
        authority: admin.publicKey,
        //@ts-ignore
        portfolio: portfolioPDA,
        admin: adminPDA,
      })
      .signers([admin])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Allow deposit enabled`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const disableAllowDeposit = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  try {
    spinner.start();
    const [portfolioPDA] = pdaDeriver.portfolio();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      admin.publicKey.toBuffer(),
    ]);
    await program.methods
      .setAllowDeposit(false)
      .accounts({
        authority: admin.publicKey,
        //@ts-ignore
        portfolio: portfolioPDA,
        admin: adminPDA,
      })
      .signers([admin])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Allow deposit disabled`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const enableNativeDeposits = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  try {
    spinner.start();
    const [portfolioPDA] = pdaDeriver.portfolio();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      admin.publicKey.toBuffer(),
    ]);
    await program.methods
      .setNativeDepositsRestricted(false)
      .accounts({
        authority: admin.publicKey,
        //@ts-ignore
        portfolio: portfolioPDA,
        admin: adminPDA,
      })
      .signers([admin])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Native deposit enabled`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const disableNativeDeposits = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  try {
    spinner.start();
    const [portfolioPDA] = pdaDeriver.portfolio();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      admin.publicKey.toBuffer(),
    ]);
    await program.methods
      .setNativeDepositsRestricted(true)
      .accounts({
        authority: admin.publicKey,
        //@ts-ignore
        portfolio: portfolioPDA,
        admin: adminPDA,
      })
      .signers([admin])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Native deposit disabled`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const setSwapSigner = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  const swapSigner = await getUserInput(
    "Enter the swap signer public key (without starting 0x): \n"
  );
  try {
    spinner.start();
    const [portfolioPDA] = pdaDeriver.portfolio();
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      admin.publicKey.toBuffer(),
    ]);
    await program.methods
      .setSwapSigner({ swapSigner: Array.from(Buffer.from(swapSigner, "hex")) })
      .accounts({
        authority: admin.publicKey,
        //@ts-ignore
        portfolio: portfolioPDA,
        admin: adminPDA,
      })
      .signers([admin])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(`Swap signer set to ${swapSigner}`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getGlobalConfig = async (
  program: Program<Dexalot>,
  admin: Keypair
) => {
  try {
    spinner.start();

    const [portfolioPDA] = pdaDeriver.portfolio();
    const globalConfig = (await program.account.portfolio.fetch(portfolioPDA)).globalConfig;

    spinner.stop();
    console.clear();
    console.log(green("Global Config:"));
    console.log(`  Out Nonce: ${globalConfig.outNonce}`);
    console.log(`  Allow Deposit: ${globalConfig.allowDeposit}`);
    console.log(`  Program Paused: ${globalConfig.programPaused}`);
    console.log(
      `  Native Deposits Restricted: ${globalConfig.nativeDepositsRestricted}`
    );
    console.log(`  Default Chain ID: ${globalConfig.defaultChainId}`);
    console.log(
      `  Airdrop Amount: ${globalConfig.airdropAmount.toString()} lamports`
    );
    console.log(
      `  Swap Signer: 0x${Buffer.from(globalConfig.swapSigner).toString("hex")}`
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
