import { Connection, Keypair, TransactionConfirmationStrategy } from "@solana/web3.js";
import { createSpinner, getUserInput } from "../utils";
import * as fs from "fs";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { AnchorProvider, Wallet, web3 } from "@coral-xyz/anchor";
import { green } from "kleur";

const spinner = createSpinner();

export const createKeypair = async (keyPath: string): Promise<Keypair> => {
    if (!keyPath) {
      console.clear();
      keyPath = await getUserInput("Enter the path to the wallet file: ");
    }
  
    if (fs.existsSync(keyPath)) {
      throw new Error("Wallet file already exists");
    }
  
    let keypair: Keypair = Keypair.generate();
  
    const secretKeyArray = Array.from(keypair.secretKey);
    fs.writeFileSync(keyPath, JSON.stringify(secretKeyArray));
  
    return keypair;
  };
  
  export const createKeypairFileFromSecretKey = async () => {
    const keypairName = await getUserInput("Enter the name of the keypair: ");
    const secretKey = await getUserInput("Enter the secret key: ");
    const keyPath = `./${keypairName}.json`;
  
    if (fs.existsSync(keyPath)) {
      throw new Error("Wallet file already exists");
    }
    const secretKeyArray = Array.from(bs58.decode(secretKey));
    fs.writeFileSync(keyPath, JSON.stringify(secretKeyArray));
  };
  
  export const loadKeypair = async (keyPath: string): Promise<Keypair> => {
    if (!keyPath) {
      console.clear();
      keyPath = await getUserInput("Enter the path to the wallet file: ");
    }
  
    if (!fs.existsSync(keyPath)) {
      throw new Error("Wallet file does not exist");
    }
  
    const secretKeyArray = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    const secretKey = new Uint8Array(secretKeyArray);
  
    return Keypair.fromSecretKey(secretKey);
  };
  
  export const printWallet = async (wallet: Wallet) => {
    console.clear();
    console.log(green(`Wallet address: ${wallet.publicKey.toString()}\n\n`));
  };
  
  export const airdrop = async (
    wallet: Wallet,
    provider: AnchorProvider,
    connection: Connection
  ) => {
    const amount = Number(
      await getUserInput("Enter the amount of SOL to airdrop: ")
    );
    try {
      spinner.start();
      const signature = await connection.requestAirdrop(
        wallet.publicKey,
        amount * web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(
        { signature } as TransactionConfirmationStrategy,
        "finalized"
      );
      spinner.stop();
      console.clear();
      console.log(green(`Airdrop request sent with signature: ${signature}\n\n`));
    } catch (err) {
      spinner.stop(true);
      throw err;
    }
  };
  
  export const showBalance = async (wallet: Wallet, provider: AnchorProvider) => {
    try {
      spinner.start();
      const balance = await provider.connection.getBalance(wallet.publicKey);
      spinner.stop();
      console.clear();
      console.log(green(`Balance: ${balance / web3.LAMPORTS_PER_SOL} SOL\n\n`));
    } catch (err) {
      spinner.stop(true);
      throw err;
    }
  };