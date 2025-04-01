import { startAnchor } from "solana-bankrun";
import { PublicKey } from "@solana/web3.js";
import { endpointProgram } from "../sdk/layerzero";
import { web3 } from "@coral-xyz/anchor";

export const DEXALOT_PROGRAM_ID = new PublicKey(
  "2wF7VoXvkMwvMpN1GYETaUvaWth3CqyTyiYQqTFYhgx7"
);
export const LZ_MOCK_PROGRAM_ID = endpointProgram.program;

export const MOCK_CALLER_PROGRAM_ID = new PublicKey(
  "8F8sMLA7as3v2KQvQruDWvZtvaz8bXvv6iUCNYTdQv3H"
);

export const contextPromise = startAnchor(
  ".",
  [
    {
      name: "dexalot",
      programId: DEXALOT_PROGRAM_ID,
    },
    {
      name: "lz_mock",
      programId: LZ_MOCK_PROGRAM_ID,
    },
    {
      name: "caller_mock",
      programId: MOCK_CALLER_PROGRAM_ID,
    },
  ],
  [
    {
      address: new PublicKey("9eMjv1ZD7q1Kz1B1zQiC2sbKAxbnBdgouksreWisw3Te"),
      info: {
        data: Buffer.from([]),
        owner: web3.SystemProgram.programId,
        executable: false,
        lamports: 100_000_000_000, // 100 sol
      },
    },
    {
      address: new PublicKey("4GF8vAApT9jEvMCz3JtXTjLfvqLeMieL9yoCSz5XxrMN"),
      info: {
        data: Buffer.from([]),
        owner: web3.SystemProgram.programId,
        executable: false,
        lamports: 100_000_000_000, // 100 sol
      },
    },
  ]
);
