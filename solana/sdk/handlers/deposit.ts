import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createSpinner,
  getAccountPubKey,
  getUserInput,
  printTransactionEvents,
} from "../utils";
import { Dexalot } from "../../target/types/dexalot";
import { BN, Program, web3 } from "@coral-xyz/anchor";
import {
  ADMIN_SEED,
  AIRDROP_VAULT_SEED,
  BANNED_ACCOUNT_SEED,
  DEST_ID,
  SOL_USER_FUNDS_VAULT_SEED,
  SOL_VAULT_SEED,
  SPL_USER_FUNDS_VAULT_SEED,
  TOKEN_DETAILS_SEED,
} from "../consts";
import pdaDeriver from "../pda-deriver";
import { endpointProgram, getSendLibraryProgram } from "../layerzero";
import { PacketPath } from "@layerzerolabs/lz-v2-utilities";
import { arrayify, hexlify, hexZeroPad } from "@ethersproject/bytes";
import { green } from "kleur";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { generateLookupTable } from "./lookupTable";

const srcEid = 40168;

const spinner = createSpinner();

export const depositToSolVault = async (
  connection: Connection,
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const amount = Number(
    await getUserInput("Enter the amount of SOL to deposit: ")
  );
  const traderPublicKeyString = await getUserInput(
    "Enter trader public key (with 0x): "
  );

  const traderPublicKey = arrayify(hexZeroPad(traderPublicKeyString, 32));
  try {
    spinner.start();
    const solUserFundsVaultPDA = getAccountPubKey(program, [
      Buffer.from(SOL_USER_FUNDS_VAULT_SEED),
    ]);

    const lamports = web3.LAMPORTS_PER_SOL * amount;

    const [portfolioPDA] = pdaDeriver.portfolio();
    const [remotePDA] = pdaDeriver.remote(DEST_ID);
    const remote = await program.account.remote.fetch(remotePDA);

    const bannedAccountPDA = getAccountPubKey(program, [
      Buffer.from(BANNED_ACCOUNT_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const msgLibProgram = await getSendLibraryProgram(
      connection,
      authority.publicKey,
      DEST_ID,
      endpointProgram
    );

    const packetPath: PacketPath = {
      srcEid,
      dstEid: DEST_ID,
      sender: hexlify(portfolioPDA.toBytes()),
      receiver: hexlify(remote.address),
    };

    const sendRemainingAccounts =
      await endpointProgram.getSendIXAccountMetaForCPI(
        connection as any,
        authority.publicKey,
        packetPath,
        msgLibProgram,
        "finalized"
      );

    const quoteRemainingAccounts =
      await endpointProgram.getQuoteIXAccountMetaForCPI(
        connection as any,
        authority.publicKey,
        packetPath,
        msgLibProgram
      );

    const modifyComputeLimitIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 500_000,
    });

    const tx = await program.methods
      .depositNative({
        amount: new BN(lamports),
        trader: Array.from(traderPublicKey),
      })
      .accounts({
        user: authority.publicKey,
        // @ts-ignore
        portfolio: portfolioPDA,
        solVault: solUserFundsVaultPDA,
        systemProgram: web3.SystemProgram.programId,
        remote: remotePDA,
        bannedAccount: bannedAccountPDA,
        endpointProgram: endpointProgram.program,
      })
      .preInstructions([modifyComputeLimitIx])
      .remainingAccounts([...quoteRemainingAccounts, ...sendRemainingAccounts])
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(
      green(`Deposited ${amount} SOL to ${solUserFundsVaultPDA}: ${tx}\n\n`)
    );
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const depositToAirdropVault = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const amount = Number(
    await getUserInput("Enter the amount of SOL to deposit: ")
  );
  try {
    spinner.start();
    const airdropVaultPDA = getAccountPubKey(program, [
      Buffer.from(AIRDROP_VAULT_SEED),
    ]);

    const [portfolioPDA] = pdaDeriver.portfolio();

    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const lamports = web3.LAMPORTS_PER_SOL * amount;

    const tx = await program.methods
      .depositAirdrop({ amount: new BN(lamports) })
      .accounts({
        authority: authority.publicKey,
        // @ts-ignore
        portfolio: portfolioPDA,
        airdropVault: airdropVaultPDA,
        systemProgram: web3.SystemProgram.programId,
        admin: adminPDA,
      })
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(
      green(`Deposited ${amount} SOL to ${airdropVaultPDA.toBase58()}\n\n`)
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const depositSPLToken = async (
  program: Program<Dexalot>,
  authority: Keypair,
  connection: Connection
) => {
  const tokenMintAddress = new PublicKey(
    await getUserInput("Enter the token mint address of the token: ")
  );

  const amount = Number(
    await getUserInput("Enter the amount of tokens to deposit: ")
  );

  const traderPublicKeyString = await getUserInput(
    "Enter trader public key (with 0x): "
  );

  const traderPublicKey = arrayify(hexZeroPad(traderPublicKeyString, 32));

  try {
    spinner.start();
    const tokenDetailsPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_DETAILS_SEED),
      tokenMintAddress.toBuffer(),
    ]);

    const splUserFundsVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_USER_FUNDS_VAULT_SEED),
    ]);

    const bannedAccountPDA = getAccountPubKey(program, [
      Buffer.from(BANNED_ACCOUNT_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const tokenDetails = await program.account.tokenDetails.fetch(
      tokenDetailsPDA
    );

    if (!tokenDetails.tokenAddress) {
      throw new Error("Token address not found!");
    }

    const userATA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      tokenDetails.tokenAddress,
      authority.publicKey, // User authority
      true, // User authority
      "finalized",
      { commitment: "finalized" }
    );

    // Fetch the program's vault associated token account
    const vaultATA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      tokenDetails.tokenAddress,
      splUserFundsVaultPDA,
      true,
      "finalized",
      { commitment: "finalized" }
    );
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
      srcEid,
      dstEid: DEST_ID,
      sender: hexlify(portfolioPDA.toBytes()),
      receiver: hexlify(remote.address),
    };

    const sendRemainingAccounts =
      await endpointProgram.getSendIXAccountMetaForCPI(
        connection as any,
        authority.publicKey,
        packetPath,
        msgLibProgram,
        "finalized"
      );

    const quoteRemainingAccounts =
      await endpointProgram.getQuoteIXAccountMetaForCPI(
        connection as any,
        authority.publicKey,
        packetPath,
        msgLibProgram
      );

    const lookupTableAddress = await generateLookupTable(
      connection,
      authority,
      [
        portfolioPDA,
        splUserFundsVaultPDA,
        tokenDetailsPDA,
        remotePDA,
        bannedAccountPDA,
        endpointProgram.program,
        web3.SystemProgram.programId,
      ]
    );
    const lookupTableAccount = await connection
      .getAddressLookupTable(lookupTableAddress)
      .then((res) => res.value);

    if (!lookupTableAccount) {
      throw new Error("Lookup table not found");
    }

    const modifyComputeLimitIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 500_000,
    });
    const depositIx = await program.methods
      .deposit({
        tokenMint: tokenMintAddress,
        amount: new BN(amount * 10 ** tokenDetails.decimals),
        trader: Array.from(traderPublicKey),
      })
      .accounts({
        user: authority.publicKey,
        // @ts-ignore
        portfolio: portfolioPDA,
        tokenDetails: tokenDetailsPDA,
        splUserFundsVault: splUserFundsVaultPDA,
        from: userATA.address,
        to: vaultATA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        bannedAccount: bannedAccountPDA,
        remote: remotePDA,
        endpointProgram: endpointProgram.program,
      })
      .preInstructions([modifyComputeLimitIx])
      .remainingAccounts([...quoteRemainingAccounts, ...sendRemainingAccounts])
      .instruction();

    const { blockhash } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: authority.publicKey,
      recentBlockhash: blockhash,
      instructions: [modifyComputeLimitIx, depositIx],
    }).compileToV0Message([lookupTableAccount]);

    const transaction = new VersionedTransaction(messageV0);

    // Sign the transaction
    transaction.sign([authority]);

    // Send the transaction
    const tx = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: "finalized",
    });

    spinner.stop();
    console.clear();
    console.log(
      green(
        `Deposited ${amount} of token ${tokenMintAddress.toBase58()}: ${tx}\n\n`
      )
    );
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
