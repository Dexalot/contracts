import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createDefaultAccount,
  createSpinner,
  generateUniqueNonce,
  getAccountPubKey,
  getUserInput,
  printTransactionEvents,
} from "../utils";
import { Dexalot } from "../../target/types/dexalot";
import { BN, Program, web3 } from "@coral-xyz/anchor";
import {
  CCTRADE_ALLOWED_DEST_SEED,
  CROSS_SWAP_TYPE,
  PORTFOLIO_SEED,
  SOL_VAULT_SEED,
  SOLANA_ID,
  SPL_VAULT_SEED,
} from "../consts";
import pdaDeriver from "../pda-deriver";
import { endpointProgram, getSendLibraryProgram } from "../layerzero";
import { keccak256, PacketPath } from "@layerzerolabs/lz-v2-utilities";
import { hexlify } from "@ethersproject/bytes";
import { green } from "kleur";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { generateLookupTable } from "./lookupTable";
import { secp256k1 } from "@noble/curves/secp256k1";

const spinner = createSpinner();

export const crossSwap = async (
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

  const destId = Number(await getUserInput("Enter the destination ID: "));

  const privateKeyHexString = await getUserInput(
    "Enter the private key hex for signing: "
  );

  const tokenSymbolBuffer = Buffer.alloc(32, 0);
  if (!destAssetMintPublicKey.equals(PublicKey.default)) {
    const tokenSymbolStr = await getUserInput(
      "Enter destination token symbol: "
    );
    tokenSymbolBuffer.write(tokenSymbolStr);
  }

  try {
    spinner.start();

    const nonce = generateUniqueNonce();

    const crossOrder = {
      taker,
      destTrader,
      makerSymbol: Array.from(tokenSymbolBuffer),
      makerAsset: destAssetMintPublicKey,
      takerAsset: srcAssetMintPublicKey,
      makerAmount: new BN("1000"),
      takerAmount: new BN("1000"),
      nonce: Array.from(nonce),
      expiry: new BN("1899558993"), // 2030
      destChainId: destId,
    };

    const crossOrderHash = keccak256(
      Buffer.concat([
        Buffer.from(CROSS_SWAP_TYPE),
        crossOrder.taker.toBuffer(),
        crossOrder.destTrader.toBuffer(),
        Buffer.from(crossOrder.makerSymbol),
        crossOrder.makerAsset.toBuffer(),
        crossOrder.takerAsset.toBuffer(),
        Buffer.from(crossOrder.makerAmount.toArray("be", 8)),
        Buffer.from(crossOrder.takerAmount.toArray("be", 8)),
        Buffer.from(crossOrder.nonce),
        Buffer.from(crossOrder.expiry.toArray("be", 16)),
        new BN(destId).toArrayLike(Buffer, "be", 4),
      ])
    );

    const messageHash = Buffer.from(crossOrderHash.slice(2), "hex");

    const privateKey = Buffer.from(privateKeyHexString, "hex");
    const signature = secp256k1.sign(messageHash, privateKey);
    const signatureBytes = Buffer.concat([
      signature.toCompactRawBytes(), // 64 bytes (r,s)
      Buffer.from([signature.recovery]), // 1 byte recovery id
    ]);

    const splVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const solVaultPDA = getAccountPubKey(program, [
      Buffer.from(SOL_VAULT_SEED),
    ]);

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

    const portfolioPDA = getAccountPubKey(program, [
      Buffer.from(PORTFOLIO_SEED),
    ]);

    const [completedSwapsEntryPDA] = pdaDeriver.completedSwapsEntry(
      nonce,
      crossOrder.destTrader
    );

    const destinationEntryPDA = getAccountPubKey(program, [
      Buffer.from(CCTRADE_ALLOWED_DEST_SEED),
      new BN(destId).toArrayLike(Buffer, "be", 4),
      destAssetMintPublicKey.toBytes(),
    ]);

    const [remotePDA] = pdaDeriver.remote(destId);
    const remote = await program.account.remote.fetch(remotePDA);

    const msgLibProgram = await getSendLibraryProgram(
      connection,
      payer.publicKey,
      destId,
      endpointProgram
    );

    const packetPath: PacketPath = {
      srcEid: SOLANA_ID,
      dstEid: destId,
      sender: hexlify(portfolioPDA.toBytes()),
      receiver: hexlify(remote.address),
    };

    const sendRemainingAccounts =
      await endpointProgram.getSendIXAccountMetaForCPI(
        connection as any,
        payer.publicKey,
        packetPath,
        msgLibProgram,
        "finalized"
      );

    const quoteRemainingAccounts =
      await endpointProgram.getQuoteIXAccountMetaForCPI(
        connection as any,
        payer.publicKey,
        packetPath,
        msgLibProgram
      );

    const lookupTableAddress = await generateLookupTable(connection, payer, [
      taker,
      destTrader,
      completedSwapsEntryPDA,
      web3.SystemProgram.programId,
      web3.SYSVAR_CLOCK_PUBKEY,
      portfolioPDA,
      splVaultPDA,
      solVaultPDA,
      srcAssetMintPublicKey,
      takerSrcAssetATA.address,
      vaultSrcAssetATA.address,
      TOKEN_PROGRAM_ID,
      remotePDA,
      endpointProgram.program,
      destinationEntryPDA,
    ]);
    // console.log(`Remote: ${remotePDA.toBase58()}`);
    // console.log(`Completed: ${completedSwapsEntryPDA.toBase58()}`);
    // console.log(`DestEntry: ${destinationEntryPDA.toBase58()}`);
    // console.log(`splVault: ${splVaultPDA.toBase58()}`);
    // console.log(`solVault: ${solVaultPDA.toBase58()}`);
    // console.log(`takerSrcAssetATA: ${takerSrcAssetATA.address.toBase58()}`);
    // console.log(`vaultSrcAssetATA: ${vaultSrcAssetATA.address.toBase58()}`);
    // console.log(`srcAssetMintPublicKey: ${srcAssetMintPublicKey.toBase58()}`);
    // console.log(`portfolioPDA: ${portfolioPDA.toBase58()}`);

    const lookupTableAccount = await connection
      .getAddressLookupTable(lookupTableAddress)
      .then((res) => res.value);

    if (!lookupTableAccount) {
      throw new Error("Lookup table not found");
    }

    const modifyComputeLimitIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    });

    const crossSwapIX = await program.methods
      .crossSwap({
        order: crossOrder,
        signature: signatureBytes,
      })
      .accounts({
        sender: payer.publicKey,
        taker: taker,
        destTrader: destTrader,
        completedSwapsEntry: completedSwapsEntryPDA,
        //@ts-ignore
        systemProgram: web3.SystemProgram.programId,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        portfolio: portfolioPDA,
        splVault: splVaultPDA,
        solVault: solVaultPDA,
        srcTokenMint: srcAssetMintPublicKey,
        takerSrcAssetAta: takerSrcAssetATA.address,
        splVaultSrcAssetAta: vaultSrcAssetATA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        remote: remotePDA,
        endpointProgram: endpointProgram.program,
        destinationEntry: destinationEntryPDA,
      })
      .preInstructions([modifyComputeLimitIx])
      .remainingAccounts([...quoteRemainingAccounts, ...sendRemainingAccounts])
      .instruction();

    const { blockhash } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [modifyComputeLimitIx, crossSwapIX],
    }).compileToV0Message([lookupTableAccount]);

    const transaction = new VersionedTransaction(messageV0);

    // Sign the transaction
    transaction.sign([payer]);

    // Send the transaction
    const tx = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: "finalized",
    });

    spinner.stop();
    console.clear();
    console.log(green(`Cross chain swap completed: ${tx}\n\n`));
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
