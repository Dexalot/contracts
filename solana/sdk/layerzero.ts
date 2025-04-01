import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  EndpointProgram,
  ExecutorPDADeriver,
  SetConfigType,
  SimpleMessageLibProgram,
  UlnProgram,
} from "@layerzerolabs/lz-solana-sdk-v2";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { sendAndConfirm } from "./utils";
import pdaDeriver from "./pda-deriver";

export const remotePeers: { [key in EndpointId]?: string } = {
  [EndpointId.AMOY_V2_TESTNET]: "0x24B36B9BAF30be0427aA254c694F8cc92d765257",
  // [EndpointId.HOLESKY_V2_TESTNET]: "0x29458DD2E6c402D166aa926739dEC6EBD3d3eeAf",
};
export const endpointProgram = new EndpointProgram.Endpoint(
  new PublicKey("76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6")
);

const ulnProgram = new UlnProgram.Uln(
  new PublicKey("7a4WjyR8VZ7yZz5XJAKm39BUGn5iT9CKcv2pmG9tdXVH")
);
const executorProgram = new PublicKey(
  "6doghB248px58JSSwG4qejQ46kFMW4AMj7vzJnWZHNZn"
);

export async function setSendLibrary(
  connection: Connection,
  admin: Keypair,
  remote: EndpointId
): Promise<void> {
  const [id] = pdaDeriver.portfolio();
  const sendLib = await endpointProgram.getSendLibrary(
    connection as any,
    id,
    remote
  );
  const current = sendLib ? sendLib.msgLib.toBase58() : "";

  const [expectedSendLib] = ulnProgram.deriver.messageLib();

  const expected = expectedSendLib.toBase58();
  if (current === expected) {
    return Promise.resolve();
  }
  const ix = await endpointProgram.setSendLibrary(
    admin.publicKey,
    id,
    ulnProgram.program,
    remote
  );
  await sendAndConfirm(connection, [admin], [ix]);
}

export async function initSendLibrary(
  connection: Connection,
  admin: Keypair,
  remote: EndpointId
): Promise<void> {
  const [id] = pdaDeriver.portfolio();
  const ix = await endpointProgram.initSendLibrary(admin.publicKey, id, remote);
  if (ix == null) {
    return Promise.resolve();
  }
  await sendAndConfirm(connection, [admin], [ix]);
}

export async function setReceiveLibrary(
  connection: Connection,
  admin: Keypair,
  remote: EndpointId
): Promise<void> {
  const [id] = pdaDeriver.portfolio();
  const receiveLib = await endpointProgram.getReceiveLibrary(
    connection as any,
    id,
    remote
  );
  const current = receiveLib ? receiveLib.msgLib.toBase58() : "";
  const [expectedMessageLib] = ulnProgram.deriver.messageLib();
  const expected = expectedMessageLib.toBase58();
  if (current === expected) {
    return Promise.resolve();
  }

  const ix = await endpointProgram.setReceiveLibrary(
    admin.publicKey,
    id,
    ulnProgram.program,
    remote
  );
  await sendAndConfirm(connection, [admin], [ix]);
}

export async function initReceiveLibrary(
  connection: Connection,
  admin: Keypair,
  remote: EndpointId
): Promise<void> {
  const [id] = pdaDeriver.portfolio();
  const ix = await endpointProgram.initReceiveLibrary(
    admin.publicKey,
    id,
    remote
  );
  if (ix == null) {
    return Promise.resolve();
  }
  await sendAndConfirm(connection, [admin], [ix]);
}

export async function initOappNonce(
  connection: Connection,
  admin: Keypair,
  remote: EndpointId,
  remotePeer: Uint8Array
): Promise<void> {
  const [id] = pdaDeriver.portfolio();
  const ix = await endpointProgram.initOAppNonce(
    admin.publicKey,
    remote,
    id,
    remotePeer
  );
  if (ix === null) return Promise.resolve();
  const current = false;
  try {
    const nonce = await endpointProgram.getNonce(
      connection as any,
      id,
      remote,
      remotePeer
    );
    if (nonce) {
      console.log("nonce already set");
      return Promise.resolve();
    }
  } catch (e) {
    /*nonce not init*/
  }
  await sendAndConfirm(connection, [admin], [ix]);
}

export async function setOappExecutor(
  connection: Connection,
  admin: Keypair,
  remote: EndpointId
): Promise<void> {
  const [id] = pdaDeriver.portfolio();
  const defaultOutboundMaxMessageSize = 10000;

  const [executorPda] = new ExecutorPDADeriver(executorProgram).config();
  const expected: UlnProgram.types.ExecutorConfig = {
    maxMessageSize: defaultOutboundMaxMessageSize,
    executor: executorPda,
  };

  const current = (
    await ulnProgram.getSendConfigState(connection as any, id, remote)
  )?.executor;

  const ix = await endpointProgram.setOappConfig(
    connection as any,
    admin.publicKey,
    id,
    ulnProgram.program,
    remote,
    {
      configType: SetConfigType.EXECUTOR,
      value: expected,
    }
  );
  if (
    current &&
    current.executor.toBase58() === expected.executor.toBase58() &&
    current.maxMessageSize === expected.maxMessageSize
  ) {
    return Promise.resolve();
  }
  await sendAndConfirm(connection, [admin], [ix]);
}

export async function initUlnConfig(
  connection: Connection,
  payer: Keypair,
  admin: Keypair,
  remote: EndpointId
): Promise<void> {
  const [id] = pdaDeriver.portfolio();

  const current = await ulnProgram.getSendConfigState(
    connection as any,
    id,
    remote
  );
  if (current) {
    return Promise.resolve();
  }
  const ix = await endpointProgram.initOAppConfig(
    admin.publicKey,
    ulnProgram,
    payer.publicKey,
    id,
    remote
  );
  await sendAndConfirm(connection, [admin], [ix]);
}

export async function getSendLibraryProgram(
  connection: Connection,
  payer: PublicKey,
  dstEid: number,
  endpoint?: EndpointProgram.Endpoint
): Promise<SimpleMessageLibProgram.SimpleMessageLib | UlnProgram.Uln> {
  const [id] = pdaDeriver.portfolio();
  const sendLibInfo = await endpointProgram.getSendLibrary(
    connection as any,
    id,
    dstEid
  );
  if (!sendLibInfo?.programId) {
    throw new Error("Send library not initialized or blocked message library");
  }
  const { programId: msgLibProgram } = sendLibInfo;
  const msgLibVersion = await endpointProgram.getMessageLibVersion(
    connection as any,
    payer,
    msgLibProgram
  );
  if (
    msgLibVersion?.major.toString() === "0" &&
    msgLibVersion.minor == 0 &&
    msgLibVersion.endpointVersion == 2
  ) {
    return new SimpleMessageLibProgram.SimpleMessageLib(msgLibProgram);
  } else if (
    msgLibVersion?.major.toString() === "3" &&
    msgLibVersion.minor == 0 &&
    msgLibVersion.endpointVersion == 2
  ) {
    return new UlnProgram.Uln(msgLibProgram);
  }

  throw new Error(
    `Unsupported message library version: ${JSON.stringify(
      msgLibVersion,
      null,
      2
    )}`
  );
}

export async function getEndpoint(
  endpointProgramID: PublicKey
): Promise<EndpointProgram.Endpoint> {
  const endpoint = new EndpointProgram.Endpoint(endpointProgramID);
  return endpoint;
}
