import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

import { oappIDPDA } from "@layerzerolabs/lz-solana-sdk-v2";
import {
  COMPLETED_SWAPS_SEED,
  PENDING_SWAPS_SEED,
  PORTFOLIO_SEED,
  REMOTE_SEED,
} from "./consts";
import { keccak256 } from "@layerzerolabs/lz-v2-utilities";

const PORTFOLIO_PROGRAM_ID = new PublicKey(
  "9vTWrLsodcrUCnqFJmWMEbf4bA1dDar7gVVCoy8vGcQZ"
);
class PortfolioPDADeriver {
  constructor(public readonly program: PublicKey) {}

  portfolio(): [PublicKey, number] {
    return oappIDPDA(this.program, PORTFOLIO_SEED);
  }

  remote(dstChainId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(REMOTE_SEED),
        new BN(dstChainId).toArrayLike(Buffer, "be", 4),
      ],
      this.program
    );
  }

  completedSwapsEntry(
    nonce: Buffer,
    destTrader: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(COMPLETED_SWAPS_SEED),
        generateMapEntryKey(nonce, destTrader),
      ],
      this.program
    );
  }

  pendingSwapsEntry(nonce: Buffer, destTrader: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(PENDING_SWAPS_SEED), generateMapEntryKey(nonce, destTrader)],
      this.program
    );
  }
}

const generateMapEntryKey = (nonce: Buffer, destTrader: PublicKey): Buffer => {
  const traderBuffer = destTrader.toBuffer();

  // Concatenate buffers and hash
  const dataToHash = Buffer.concat([nonce, traderBuffer]);
  return Buffer.from(keccak256(dataToHash).slice(2), "hex");
};
export default new PortfolioPDADeriver(PORTFOLIO_PROGRAM_ID);
