import { Program, web3 } from "@coral-xyz/anchor";
import { Dexalot } from "../../target/types/dexalot";
import {
  createSpinner,
  getAccountPubKey,
  getUserInput,
  padSymbol,
  printTransactionEvents,
} from "../utils";
import {
  ADMIN_SEED,
  SPL_USER_FUNDS_VAULT_SEED,
  SPL_VAULT_SEED,
  TOKEN_DETAILS_SEED,
  TOKEN_LIST_SEED,
} from "../consts";
import { green } from "kleur";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  approve,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";

const spinner = createSpinner();

export const getTokenList = async (program: Program<Dexalot>) => {
  try {
    spinner.start();
    const tokenListPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_LIST_SEED),
      Buffer.from("0"),
    ]);
    let tokenListAccount = await program.account.tokenList.fetch(tokenListPDA);

    const tokens = tokenListAccount.tokens.map((tokenMintAddress) => {
      return tokenMintAddress.toBase58().replace(/\0/g, "");
    });
    spinner.stop();
    console.clear();
    console.log(green(`Supported tokens: ${tokens.join(", ")}\n\n`));
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getTokenDetails = async (program: Program<Dexalot>) => {
  const tokenMint = new PublicKey(
    await getUserInput("Enter the token mint address of the token: ")
  );

  try {
    spinner.start();
    const [tokenDetails, tokenDetailsBump] =
      web3.PublicKey.findProgramAddressSync(
        [Buffer.from(TOKEN_DETAILS_SEED), tokenMint.toBuffer()],
        program.programId
      );
    let tokenDetailsAccount = await program.account.tokenDetails.fetch(
      tokenDetails
    );
    spinner.stop();
    console.clear();
    console.log(
      green(
        `Token: ${Buffer.from(tokenDetailsAccount.symbol)
          .toString("utf8")
          .replace(/\0/g, "")}\nToken decimals: ${
          tokenDetailsAccount.decimals
        }\nToken address: ${tokenDetailsAccount.tokenAddress}\n`
      )
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const addToken = async (
  program: Program<Dexalot>,
  connection: Connection,
  authority: Keypair
) => {
  const tokenMintString = await getUserInput(
    "Enter the token mint address of the token: "
  );
  const tokenMint = new PublicKey(tokenMintString);

  const symbol = (
    await getUserInput("Enter the symbol of the token: ")
  ).toUpperCase();
  const symbolPadded = padSymbol(symbol);

  try {
    spinner.start();
    const mintAccount = await getMint(
      connection,
      tokenMint,
      "finalized",
      TOKEN_PROGRAM_ID
    );

    const tokenDecimals = mintAccount.decimals;

    // Derive PDAs using the helper function
    const adminPDA = getAccountPubKey(program, [
      Buffer.from(ADMIN_SEED),
      authority.publicKey.toBuffer(),
    ]);

    const tokenDetailsPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_DETAILS_SEED),
      tokenMint.toBuffer(),
    ]);

    const tokenListPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_LIST_SEED),
      Buffer.from("0"),
    ]);

    const splVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const splUserFundsVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_USER_FUNDS_VAULT_SEED),
    ]);

    await connection.getLatestBlockhash({ commitment: "finalized" });

    // Call the add_token instruction
    const tx = await program.methods
      .addToken({
        symbol: Array.from(symbolPadded),
        tokenAddress: tokenMint,
        decimals: tokenDecimals,
      })
      .accounts({
        authority: authority.publicKey,
        //@ts-ignore
        admin: adminPDA,
        splVault: splVaultPDA,
        splUserFundsVault: splUserFundsVaultPDA,
        tokenDetails: tokenDetailsPDA,
        tokenMint: tokenMint,
        splTokenAccount: await getAssociatedTokenAddress(
          tokenMint,
          splVaultPDA,
          true // allow owner off curve
        ),
        splUserFundsTokenAccount: await getAssociatedTokenAddress(
          tokenMint,
          splUserFundsVaultPDA,
          true // allow owner off curve
        ),
        systemProgram: web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: tokenListPDA, isSigner: false, isWritable: true },
      ])
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(
      green(
        `Token ${symbol} with Mint address ${tokenMint} was added successfully\n\n`
      )
    );
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const removeToken = async (
  program: Program<Dexalot>,
  authority: Keypair
) => {
  const tokenMint = new PublicKey(
    await getUserInput("Enter the token mint address of the token to remove: ")
  );

  try {
    spinner.start();
    // Derive PDAs
    const [adminPDA, adminBump] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(ADMIN_SEED), authority.publicKey.toBuffer()],
      program.programId
    );

    // Derive the sol_details PDA
    const [tokenDetails, solDetailsBump] =
      web3.PublicKey.findProgramAddressSync(
        [Buffer.from(TOKEN_DETAILS_SEED), tokenMint.toBuffer()],
        program.programId
      );

    const [tokenList, tokenListBump] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from(TOKEN_LIST_SEED), Buffer.from("0")],
      program.programId
    );

    const tx = await program.methods

      .removeToken({ tokenAddress: tokenMint })
      .accounts({
        authority: authority.publicKey, // Pass the authority (payer account)
        //@ts-ignore
        tokenDetails,
        admin: adminPDA,
        receiver: authority.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .remainingAccounts([
        {
          pubkey: tokenList,
          isWritable: true,
          isSigner: false,
        },
      ])
      .signers([authority])
      .rpc({ commitment: "finalized" });

    spinner.stop();
    console.clear();
    console.log(
      green(`Token ${tokenMint.toBase58()} removed successfully\n\n`)
    );
    await printTransactionEvents(program, tx);
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const mintSPLToken = async (
  program: Program<Dexalot>,
  authority: Keypair,
  connection: Connection
) => {
  const tokenMint = new PublicKey(
    await getUserInput("Enter the mint address of the token: ")
  );
  const amount = Number(
    await getUserInput("Enter the amount of tokens to mint: ")
  );

  try {
    spinner.start();
    const tokenDetailsPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_DETAILS_SEED),
      tokenMint.toBuffer(),
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
      authority.publicKey, // User authority,
      true,
      "finalized",
      { commitment: "finalized" }
    );

    await mintTo(
      connection,
      authority,
      tokenDetails.tokenAddress,
      userATA.address,
      authority.publicKey, // Mint authority
      amount * 10 ** tokenDetails.decimals // Amount in base units
    );

    spinner.stop();
    console.clear();
    console.log(green(`Minted ${amount} tokens to ${userATA.address}\n\n`));
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getSPLTokenBalanceOfActiveWallet = async (
  program: Program<Dexalot>,
  authority: Keypair,
  connection: Connection
) => {
  const tokenMint = new PublicKey(
    await getUserInput("Enter the token mint address of the token: ")
  );

  try {
    spinner.start();
    const tokenDetailsPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_DETAILS_SEED),
      tokenMint.toBuffer(),
    ]);

    const tokenDetails = await program.account.tokenDetails.fetch(
      tokenDetailsPDA
    );

    if (!tokenDetails.tokenAddress) {
      throw new Error("Token address not found!");
    }

    const tokenAccountAddress = await getAssociatedTokenAddress(
      tokenDetails.tokenAddress,
      authority.publicKey
    );

    // Fetch token account info
    const tokenAccount = await getAccount(connection, tokenAccountAddress);

    spinner.stop();
    console.clear();
    console.log(
      green(
        `Balance: ${
          Number(tokenAccount.amount) / 10 ** tokenDetails.decimals
        } of ${tokenMint.toBase58()}\n\n`
      )
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getSPLTokenBalanceOfPubkey = async (
  program: Program<Dexalot>,
  connection: Connection
) => {
  const tokenMint = new PublicKey(
    await getUserInput("Enter the token mint address of the token: ")
  );

  const user = new PublicKey(await getUserInput("Enter the user pubkey: "));

  try {
    spinner.start();
    const tokenDetailsPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_DETAILS_SEED),
      tokenMint.toBuffer(),
    ]);

    const tokenDetails = await program.account.tokenDetails.fetch(
      tokenDetailsPDA
    );

    if (!tokenDetails.tokenAddress) {
      throw new Error("Token address not found!");
    }

    const tokenAccountAddress = await getAssociatedTokenAddress(
      tokenDetails.tokenAddress,
      user
    );

    // Fetch token account info
    const tokenAccount = await getAccount(connection, tokenAccountAddress);

    spinner.stop();
    console.clear();
    console.log(
      green(
        `Balance: ${
          Number(tokenAccount.amount) / 10 ** tokenDetails.decimals
        } of ${tokenMint.toBase58()}\n\n`
      )
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getSPLTokenVaultBalance = async (
  program: Program<Dexalot>,
  authority: Keypair,
  connection: Connection
) => {
  const tokenMint = new PublicKey(
    await getUserInput("Enter the token mint address of the token: ")
  );

  try {
    spinner.start();
    const tokenDetailsPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_DETAILS_SEED),
      tokenMint.toBuffer(),
    ]);

    const splVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_VAULT_SEED),
    ]);

    const tokenDetails = await program.account.tokenDetails.fetch(
      tokenDetailsPDA
    );

    if (!tokenDetails.tokenAddress) {
      throw new Error("Token address not found!");
    }

    const vaultATA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      tokenDetails.tokenAddress,
      splVaultPDA,
      true,
      "finalized",
      { commitment: "finalized" }
    );

    const decimals = 10 ** tokenDetails.decimals;
    spinner.stop();
    console.clear();
    console.log(
      green(
        `Balance: ${
          Number(vaultATA.amount) / decimals
        } of ${tokenMint.toBase58()}\n\n`
      )
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const getSPLTokenUserFundsVaultBalance = async (
  program: Program<Dexalot>,
  authority: Keypair,
  connection: Connection
) => {
  const tokenMint = new PublicKey(
    await getUserInput("Enter the token mint address of the token: ")
  );

  try {
    spinner.start();
    const tokenDetailsPDA = getAccountPubKey(program, [
      Buffer.from(TOKEN_DETAILS_SEED),
      tokenMint.toBuffer(),
    ]);

    const splUserFundsVaultPDA = getAccountPubKey(program, [
      Buffer.from(SPL_USER_FUNDS_VAULT_SEED),
    ]);

    const tokenDetails = await program.account.tokenDetails.fetch(
      tokenDetailsPDA
    );

    if (!tokenDetails.tokenAddress) {
      throw new Error("Token address not found!");
    }

    const vaultATA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      tokenDetails.tokenAddress,
      splUserFundsVaultPDA,
      true,
      "finalized",
      { commitment: "finalized" }
    );

    const decimals = 10 ** tokenDetails.decimals;
    spinner.stop();
    console.clear();
    console.log(
      green(
        `Balance: ${
          Number(vaultATA.amount) / decimals
        } of ${tokenMint.toBase58()}\n\n`
      )
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};

export const createNewToken = async (
  connection: Connection,
  authority: Keypair
) => {
  const tokenSymbol = (
    await getUserInput("Enter the symbol of the new token: ")
  ).toUpperCase();
  const tokenDecimals = Number(
    await getUserInput("Enter the decimals of the new token (max 9): ")
  );

  if (tokenDecimals > 9) {
    throw new Error("Decimals must be less or equal to 9");
  }

  try {
    spinner.start();

    // Create a new SPL Token Mint for testing
    const newTokenMint = await createMint(
      connection,
      authority, // Payer
      authority.publicKey, // Mint authority
      null, // Freeze authority
      tokenDecimals // Decimals
    );

    // Append to tokens.txt file
    const tokenEntry = `${tokenSymbol} - ${newTokenMint.toBase58()}\n`;
    fs.appendFileSync("tokens.txt", tokenEntry);

    spinner.stop();
    console.clear();
    console.log(
      green(
        `Token ${tokenSymbol} created! Token mint address ${newTokenMint.toBase58()}\n\n`
      )
    );
  } catch (err) {
    spinner.stop(true);
    throw err;
  }
};
