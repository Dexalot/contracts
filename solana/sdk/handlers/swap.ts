import { BN, Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import { secp256k1 } from "@noble/curves/secp256k1";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createDefaultAccount,
  createSpinner,
  generateUniqueNonce,
  getAccountPubKey,
  getUserInput,
} from "../utils";
import pdaDeriver from "../pda-deriver";
import {
  ORDER_TYPE,
  PORTFOLIO_SEED,
  SOL_VAULT_SEED,
  SPL_VAULT_SEED,
} from "../consts";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { keccak256 } from "@layerzerolabs/lz-v2-utilities";
const spinner = createSpinner();

export const simpleSwap = async (
  connection: Connection,
  program: Program<Dexalot>,
  payer: Keypair
) => {
  const taker = new PublicKey(
    await getUserInput("Enter the taker public key: ")
  );
  const destTrader = new PublicKey(
    await getUserInput("Enter the destination trader public key: ")
  );
  const srcAssetMint = await getUserInput(
    "Enter the token mint address of the src token: "
  );
  const srcAssetMintPublicKey = srcAssetMint
    ? new PublicKey(srcAssetMint)
    : PublicKey.default;

  const destAssetMint = await getUserInput(
    "Enter the token mint address of the dest token: "
  );
  const destAssetMintPublicKey = destAssetMint
    ? new PublicKey(destAssetMint)
    : PublicKey.default;

  const privateKeyHexString = await getUserInput(
    "Enter the private key hex for signing: "
  );
  try {
    spinner.start();

    const nonce = generateUniqueNonce();

    const order = {
      makerAsset: destAssetMintPublicKey,
      takerAsset: srcAssetMintPublicKey,
      taker,
      makerAmount: new BN("1000"),
      takerAmount: new BN("1000"),
      expiry: new BN("1899558993"), // 2030
      destTrader,
      nonce: Array.from(nonce),
    };

    const orderHash = keccak256(
      Buffer.concat([
        Buffer.from(ORDER_TYPE),
        order.makerAsset.toBuffer(),
        order.takerAsset.toBuffer(),
        taker.toBuffer(),
        Buffer.from(order.makerAmount.toArray("be", 8)),
        Buffer.from(order.takerAmount.toArray("be", 8)),
        Buffer.from(order.expiry.toArray("be", 16)),
        order.destTrader.toBuffer(),
        Buffer.from(order.nonce),
      ])
    );

    const messageHash = Buffer.from(orderHash.slice(2), "hex");

    const privateKey = Buffer.from(privateKeyHexString, "hex");
    const signature = secp256k1.sign(messageHash, privateKey);
    const signatureBytes = Buffer.concat([
      signature.toCompactRawBytes(), // 64 bytes (r,s)
      Buffer.from([signature.recovery]), // 1 byte recovery id
    ]);

    const splVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const portfolioPDA = getAccountPubKey(program, [
      Buffer.from(PORTFOLIO_SEED),
    ]);
    const [completedSwapsEntryPDA] = pdaDeriver.completedSwapsEntry(
      nonce,
      order.destTrader
    );

    const takerSrcAssetATA = !srcAssetMintPublicKey.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          srcAssetMintPublicKey,
          taker,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    let takerDestAssetATA = !destAssetMintPublicKey.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          destAssetMintPublicKey,
          taker,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const destTraderSrcAssetATA = !srcAssetMintPublicKey.equals(
      PublicKey.default
    )
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          srcAssetMintPublicKey,
          destTrader,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    let destTraderDestAssetATA = !destAssetMintPublicKey.equals(
      PublicKey.default
    )
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          destAssetMintPublicKey,
          destTrader,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const vaultSrcAssetATA = !srcAssetMintPublicKey.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          srcAssetMintPublicKey,
          splVaultPDA,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const vaultDestAssetATA = !destAssetMintPublicKey.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          destAssetMintPublicKey,
          splVaultPDA,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const solVaultPDA = getAccountPubKey(program, [
      Buffer.from(SOL_VAULT_SEED),
    ]);

    const modifyComputeLimitIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });

    const tx = await program.methods
      .swap({
        order: order,
        signature: signatureBytes,
        isPartial: false,
        takerAmount: new BN(0),
      })
      .accounts({
        sender: payer.publicKey,
        taker,
        destTrader,
        completedSwapsEntry: completedSwapsEntryPDA,
        //@ts-ignore
        systemProgram: web3.SystemProgram.programId,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        portfolio: portfolioPDA,
        splVault: splVaultPDA,
        solVault: solVaultPDA,
        srcTokenMint: srcAssetMintPublicKey,
        destTokenMint: destAssetMintPublicKey,
        takerDestAssetAta: takerDestAssetATA.address,
        takerSrcAssetAta: takerSrcAssetATA.address,
        destTraderDestAssetAta: destTraderDestAssetATA.address,
        destTraderSrcAssetAta: destTraderSrcAssetATA.address,
        splVaultDestAssetAta: vaultDestAssetATA.address,
        splVaultSrcAssetAta: vaultSrcAssetATA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([modifyComputeLimitIx])
      .signers([payer])
      .rpc({ commitment: "finalized", skipPreflight: true });

    spinner.stop();
    console.clear();
    console.log(`Swap completed: ${tx}`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const partialSwap = async (
  connection: Connection,
  program: Program<Dexalot>,
  payer: Keypair
) => {
  const taker = new PublicKey(
    await getUserInput("Enter the taker public key: ")
  );
  const destTrader = new PublicKey(
    await getUserInput("Enter the destination trader public key: ")
  );
  const srcAssetMint = await getUserInput(
    "Enter the token mint address of the src token: "
  );
  const srcAssetMintPublicKey = srcAssetMint
    ? new PublicKey(srcAssetMint)
    : PublicKey.default;

  const destAssetMint = await getUserInput(
    "Enter the token mint address of the dest token: "
  );
  const destAssetMintPublicKey = destAssetMint
    ? new PublicKey(destAssetMint)
    : PublicKey.default;

  const takerAmount = Number(await getUserInput("Enter the taker amount: "));
  const privateKeyHexString = await getUserInput(
    "Enter the private key hex for signing: "
  );
  try {
    spinner.start();

    const nonce = generateUniqueNonce();

    const makerAmount = 1000; // set to 1 token with 3 decimals
    const orderTakerAmount = 1000; // set to 1 token with 3 decimals

    const order = {
      makerAsset: destAssetMintPublicKey,
      takerAsset: srcAssetMintPublicKey,
      taker,
      makerAmount: new BN(makerAmount),
      takerAmount: new BN(orderTakerAmount),
      expiry: new BN("1899558993"), // 2030
      destTrader,
      nonce: Array.from(nonce),
    };

    const adjustedMakerAmount: BN =
      takerAmount < orderTakerAmount
        ? new BN((makerAmount * takerAmount) / orderTakerAmount)
        : new BN(makerAmount);

    const orderHash = keccak256(
      Buffer.concat([
        Buffer.from(ORDER_TYPE),
        order.makerAsset.toBuffer(),
        order.takerAsset.toBuffer(),
        taker.toBuffer(),
        Buffer.from(adjustedMakerAmount.toArray("be", 8)),
        Buffer.from(order.takerAmount.toArray("be", 8)),
        Buffer.from(order.expiry.toArray("be", 16)),
        order.destTrader.toBuffer(),
        Buffer.from(order.nonce),
      ])
    );

    const messageHash = Buffer.from(orderHash.slice(2), "hex");

    const privateKey = Buffer.from(privateKeyHexString, "hex");
    const signature = secp256k1.sign(messageHash, privateKey);
    const signatureBytes = Buffer.concat([
      signature.toCompactRawBytes(), // 64 bytes (r,s)
      Buffer.from([signature.recovery]), // 1 byte recovery id
    ]);

    const splVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const portfolioPDA = getAccountPubKey(program, [
      Buffer.from(PORTFOLIO_SEED),
    ]);
    const [completedSwapsEntryPDA] = pdaDeriver.completedSwapsEntry(
      nonce,
      order.destTrader
    );

    const takerSrcAssetATA = !srcAssetMintPublicKey.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          srcAssetMintPublicKey,
          taker,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    let takerDestAssetATA = !destAssetMintPublicKey.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          destAssetMintPublicKey,
          taker,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const destTraderSrcAssetATA = !srcAssetMintPublicKey.equals(
      PublicKey.default
    )
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          srcAssetMintPublicKey,
          destTrader,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    let destTraderDestAssetATA = !destAssetMintPublicKey.equals(
      PublicKey.default
    )
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          destAssetMintPublicKey,
          destTrader,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const vaultSrcAssetATA = !srcAssetMintPublicKey.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          srcAssetMintPublicKey,
          splVaultPDA,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const vaultDestAssetATA = !destAssetMintPublicKey.equals(PublicKey.default)
      ? await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          destAssetMintPublicKey,
          splVaultPDA,
          true,
          "finalized",
          { commitment: "finalized" }
        )
      : createDefaultAccount();

    const solVaultPDA = getAccountPubKey(program, [
      Buffer.from(SOL_VAULT_SEED),
    ]);

    const modifyComputeLimitIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });

    const tx = await program.methods
      .swap({
        order: order,
        signature: signatureBytes,
        isPartial: true,
        takerAmount: new BN(takerAmount),
      })
      .accounts({
        sender: payer.publicKey,
        taker,
        destTrader,
        completedSwapsEntry: completedSwapsEntryPDA,
        //@ts-ignore
        systemProgram: web3.SystemProgram.programId,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        portfolio: portfolioPDA,
        splVault: splVaultPDA,
        solVault: solVaultPDA,
        srcTokenMint: srcAssetMintPublicKey,
        destTokenMint: destAssetMintPublicKey,
        takerDestAssetAta: takerDestAssetATA.address,
        takerSrcAssetAta: takerSrcAssetATA.address,
        destTraderDestAssetAta: destTraderDestAssetATA.address,
        destTraderSrcAssetAta: destTraderSrcAssetATA.address,
        splVaultDestAssetAta: vaultDestAssetATA.address,
        splVaultSrcAssetAta: vaultSrcAssetATA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([modifyComputeLimitIx])
      .signers([payer])
      .rpc({ commitment: "finalized", skipPreflight: true });

    spinner.stop();
    console.clear();
    console.log(`Swap completed: ${tx}`);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
