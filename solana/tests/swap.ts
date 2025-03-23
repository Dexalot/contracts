import { Keypair, PublicKey } from "@solana/web3.js";
import { Dexalot } from "../target/types/dexalot";
import { BN, Program, web3 } from "@coral-xyz/anchor";
import { generateUniqueNonce, getAccountPubKey } from "../sdk/utils";
import { keccak256 } from "@layerzerolabs/lz-v2-utilities";
import {
  CROSS_SWAP_TYPE,
  DEST_ID,
  ORDER_TYPE,
  PORTFOLIO_SEED,
  SOL_VAULT_SEED,
  SPL_VAULT_SEED,
} from "../sdk/consts";
import { secp256k1 } from "@noble/curves/secp256k1";
import pdaDeriver from "../sdk/pda-deriver";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getLayerZeroQuoteSendRemainingAccounts } from "./utils";
import { endpointProgram } from "../sdk/layerzero";
import { ProgramTestContext } from "solana-bankrun";

export const simpleSwap = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  account2: Keypair,
  destAssetMintPublicKey: PublicKey,
  srcAssetMintPublicKey: PublicKey
) => {
  const nonce = generateUniqueNonce();

  const order = {
    makerAsset: destAssetMintPublicKey,
    takerAsset: srcAssetMintPublicKey,
    taker: authority.publicKey,
    makerAmount: new BN("1000"),
    takerAmount: new BN("1000"),
    expiry: new BN("1899558993"), // 2030
    destTrader: account2.publicKey,
    nonce: Array.from(nonce),
  };

  const orderHash = keccak256(
    Buffer.concat([
      Buffer.from(ORDER_TYPE),
      order.makerAsset.toBuffer(),
      order.takerAsset.toBuffer(),
      authority.publicKey.toBuffer(),
      Buffer.from(order.makerAmount.toArray("be", 8)),
      Buffer.from(order.takerAmount.toArray("be", 8)),
      Buffer.from(order.expiry.toArray("be", 16)),
      order.destTrader.toBuffer(),
      Buffer.from(order.nonce),
    ])
  );

  const messageHash = Buffer.from(orderHash.slice(2), "hex");
  const privateKey = Buffer.from(
    "5adc6d74d07d6c60aa9677190273ce900247c5e36dce2f3ed043fbfeecbaa019",
    "hex"
  );
  const signature = secp256k1.sign(messageHash, privateKey);
  const signatureBytes = Buffer.concat([
    signature.toCompactRawBytes(), // 64 bytes (r,s)
    Buffer.from([signature.recovery]), // 1 byte recovery id
  ]);

  const splVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_VAULT_SEED),
  ]);

  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const [completedSwapsEntryPDA] = pdaDeriver.completedSwapsEntry(
    nonce,
    order.destTrader
  );

  const solVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_VAULT_SEED),
  ]);

  const takerDestAssetATA = await getAssociatedTokenAddress(
    destAssetMintPublicKey,
    authority.publicKey
  );

  const takerSrcAssetATA = await getAssociatedTokenAddress(
    srcAssetMintPublicKey,
    authority.publicKey
  );

  const destTraderDestAssetATA = await getAssociatedTokenAddress(
    destAssetMintPublicKey,
    account2.publicKey
  );

  const destTraderSrcAssetATA = await getAssociatedTokenAddress(
    srcAssetMintPublicKey,
    account2.publicKey
  );

  const vaultSrcAssetATA = await getAssociatedTokenAddress(
    srcAssetMintPublicKey,
    splVaultPDA,
    true
  );

  const vaultDestAssetATA = await getAssociatedTokenAddress(
    destAssetMintPublicKey,
    splVaultPDA,
    true
  );

  await dexalotProgram.methods
    .swap({
      order: order,
      signature: signatureBytes,
      isPartial: false,
      takerAmount: new BN(0),
    })
    .accounts({
      sender: authority.publicKey,
      taker: authority.publicKey,
      destTrader: account2.publicKey,
      completedSwapsEntry: completedSwapsEntryPDA,
      //@ts-ignore
      systemProgram: web3.SystemProgram.programId,
      clock: web3.SYSVAR_CLOCK_PUBKEY,
      portfolio: portfolioPDA,
      splVault: splVaultPDA,
      solVault: solVaultPDA,
      srcTokenMint: srcAssetMintPublicKey,
      destTokenMint: destAssetMintPublicKey,
      takerDestAssetAta: takerDestAssetATA,
      takerSrcAssetAta: takerSrcAssetATA,
      destTraderDestAssetAta: destTraderDestAssetATA,
      destTraderSrcAssetAta: destTraderSrcAssetATA,
      splVaultDestAssetAta: vaultDestAssetATA,
      splVaultSrcAssetAta: vaultSrcAssetATA,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();
};

export const partialSwap = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  account2: Keypair,
  destAssetMintPublicKey: PublicKey,
  srcAssetMintPublicKey: PublicKey,
  takerAmount: number
) => {
  const nonce = generateUniqueNonce();

  const makerAmount = 1000; // set to 1 token with 3 decimals
  const orderTakerAmount = 1000; // set to 1 token with 3 decimals

  const order = {
    makerAsset: destAssetMintPublicKey,
    takerAsset: srcAssetMintPublicKey,
    taker: authority.publicKey,
    makerAmount: new BN(makerAmount),
    takerAmount: new BN(orderTakerAmount),
    expiry: new BN("1899558993"), // 2030
    destTrader: account2.publicKey,
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
      authority.publicKey.toBuffer(),
      Buffer.from(adjustedMakerAmount.toArray("be", 8)),
      Buffer.from(order.takerAmount.toArray("be", 8)),
      Buffer.from(order.expiry.toArray("be", 16)),
      order.destTrader.toBuffer(),
      Buffer.from(order.nonce),
    ])
  );

  const messageHash = Buffer.from(orderHash.slice(2), "hex");

  const privateKey = Buffer.from(
    "5adc6d74d07d6c60aa9677190273ce900247c5e36dce2f3ed043fbfeecbaa019",
    "hex"
  );
  const signature = secp256k1.sign(messageHash, privateKey);
  const signatureBytes = Buffer.concat([
    signature.toCompactRawBytes(), // 64 bytes (r,s)
    Buffer.from([signature.recovery]), // 1 byte recovery id
  ]);

  const splVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_VAULT_SEED),
  ]);

  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);
  const [completedSwapsEntryPDA] = pdaDeriver.completedSwapsEntry(
    nonce,
    order.destTrader
  );

  const takerSrcAssetATA = await getAssociatedTokenAddress(
    srcAssetMintPublicKey,
    authority.publicKey
  );

  const takerDestAssetATA = await getAssociatedTokenAddress(
    destAssetMintPublicKey,
    authority.publicKey
  );

  const destTraderSrcAssetATA = await getAssociatedTokenAddress(
    srcAssetMintPublicKey,
    account2.publicKey
  );

  const destTraderDestAssetATA = await getAssociatedTokenAddress(
    destAssetMintPublicKey,
    account2.publicKey
  );

  const vaultSrcAssetATA = await getAssociatedTokenAddress(
    srcAssetMintPublicKey,
    splVaultPDA,
    true
  );

  const vaultDestAssetATA = await getAssociatedTokenAddress(
    destAssetMintPublicKey,
    splVaultPDA,
    true
  );

  const solVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_VAULT_SEED),
  ]);

  await dexalotProgram.methods
    .swap({
      order: order,
      signature: signatureBytes,
      isPartial: true,
      takerAmount: new BN(takerAmount),
    })
    .accounts({
      sender: authority.publicKey,
      taker: authority.publicKey,
      destTrader: account2.publicKey,
      completedSwapsEntry: completedSwapsEntryPDA,
      //@ts-ignore
      systemProgram: web3.SystemProgram.programId,
      clock: web3.SYSVAR_CLOCK_PUBKEY,
      portfolio: portfolioPDA,
      splVault: splVaultPDA,
      solVault: solVaultPDA,
      srcTokenMint: srcAssetMintPublicKey,
      destTokenMint: destAssetMintPublicKey,
      takerDestAssetAta: takerDestAssetATA,
      takerSrcAssetAta: takerSrcAssetATA,
      destTraderDestAssetAta: destTraderDestAssetATA,
      destTraderSrcAssetAta: destTraderSrcAssetATA,
      splVaultDestAssetAta: vaultDestAssetATA,
      splVaultSrcAssetAta: vaultSrcAssetATA,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();
};

export const crossSwap = async (
  dexalotProgram: Program<Dexalot>,
  authority: Keypair,
  account2: Keypair,
  destAssetMintPublicKey: PublicKey,
  srcAssetMintPublicKey: PublicKey,
  context: ProgramTestContext
) => {
  const nonce = generateUniqueNonce();

  const crossOrder = {
    taker: authority.publicKey,
    destTrader: account2.publicKey,
    makerSymbol: Array.from(new Uint8Array(32)),
    makerAsset: destAssetMintPublicKey,
    takerAsset: srcAssetMintPublicKey,
    makerAmount: new BN("1000"),
    takerAmount: new BN("1000"),
    nonce: Array.from(nonce),
    expiry: new BN("1899558993"), // 2030
    destChainId: new BN(DEST_ID),
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
      Buffer.from(crossOrder.destChainId.toArray("be", 8)),
    ])
  );

  const messageHash = Buffer.from(crossOrderHash.slice(2), "hex");

  const privateKey = Buffer.from(
    "5adc6d74d07d6c60aa9677190273ce900247c5e36dce2f3ed043fbfeecbaa019",
    "hex"
  );
  const signature = secp256k1.sign(messageHash, privateKey);
  const signatureBytes = Buffer.concat([
    signature.toCompactRawBytes(), // 64 bytes (r,s)
    Buffer.from([signature.recovery]), // 1 byte recovery id
  ]);

  const splVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SPL_VAULT_SEED),
  ]);

  const solVaultPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(SOL_VAULT_SEED),
  ]);

  const takerSrcAssetATA = await getAssociatedTokenAddress(
    srcAssetMintPublicKey,
    authority.publicKey
  );

  const vaultSrcAssetATA = await getAssociatedTokenAddress(
    srcAssetMintPublicKey,
    splVaultPDA,
    true
  );

  const portfolioPDA = getAccountPubKey(dexalotProgram, [
    Buffer.from(PORTFOLIO_SEED),
  ]);

  const [completedSwapsEntryPDA] = pdaDeriver.completedSwapsEntry(
    nonce,
    crossOrder.destTrader
  );
  const [remotePDA] = pdaDeriver.remote(DEST_ID);

  const remainingAccounts = getLayerZeroQuoteSendRemainingAccounts();

  await dexalotProgram.methods
    .crossSwap({
      order: crossOrder,
      signature: signatureBytes,
    })
    .accounts({
      sender: authority.publicKey,
      taker: authority.publicKey,
      destTrader: account2.publicKey,
      completedSwapsEntry: completedSwapsEntryPDA,
      //@ts-ignore
      systemProgram: web3.SystemProgram.programId,
      clock: web3.SYSVAR_CLOCK_PUBKEY,
      portfolio: portfolioPDA,
      splVault: splVaultPDA,
      solVault: solVaultPDA,
      srcTokenMint: srcAssetMintPublicKey,
      takerSrcAssetAta: takerSrcAssetATA,
      splVaultSrcAssetAta: vaultSrcAssetATA,
      tokenProgram: TOKEN_PROGRAM_ID,
      remote: remotePDA,
      endpointProgram: endpointProgram.program,
    })
    .remainingAccounts(remainingAccounts)
    .signers([authority])
    .rpc();
};
