import { sha256 } from '@noble/hashes/sha2';
import { rawSign } from '@privy-io/js-sdk-core';
import { toHex } from 'viem';
import type Privy from '@privy-io/js-sdk-core';
import type { SignAndSendTransactionParams } from '@hot-labs/near-connect';
import type { Network } from '@hot-labs/near-connect/build/types/index.js';
import type { FinalExecutionOutcome } from '@near-js/types';
import {
  Account,
  JsonRpcProvider,
  PublicKey,
  Signature,
  SignedTransaction,
  actions,
  encodeTransaction,
} from 'near-api-js';
import type { Action } from 'near-api-js';

import { base64 } from '@scure/base';

import { hexSignatureToBytes, publicKeyFromImplicit } from '@/signing/utils';

/** RPC connection options for {@link JsonRpcProvider}. */
export type RpcOptions = {
  /** RPC endpoint URL. */
  url: string;
  /** Optional headers included with every RPC request. */
  headers?: Record<string, string | number>;
};

/** Maps NEAR network names to their default public RPC URLs. */
const NEAR_RPC_URLS: Record<Network, string> = {
  mainnet: 'https://rpc.mainnet.near.org',
  testnet: 'https://rpc.testnet.near.org',
};

function createProvider(network?: Network, rpcOptions?: RpcOptions): JsonRpcProvider {
  return new JsonRpcProvider({ url: rpcOptions?.url ?? NEAR_RPC_URLS[network ?? 'mainnet'] });
}

type ActionItem = SignAndSendTransactionParams['actions'][number];

function toNearAction(action: ActionItem): Action {
  // ConnectorAction has a `type` string; native near-api-js Actions do not
  if (!('type' in action)) return action as Action;

  switch (action.type) {
    case 'CreateAccount':
      return actions.createAccount();
    case 'DeployContract':
      return actions.deployContract(action.params.code);
    case 'FunctionCall':
      return actions.functionCall(
        action.params.methodName,
        action.params.args,
        BigInt(action.params.gas),
        BigInt(action.params.deposit),
      );
    case 'Transfer':
      return actions.transfer(BigInt(action.params.deposit));
    case 'Stake':
      return actions.stake(
        BigInt(action.params.stake),
        PublicKey.fromString(action.params.publicKey),
      );
    case 'AddKey': {
      const pk = PublicKey.fromString(action.params.publicKey);
      const { permission } = action.params.accessKey;
      if (permission === 'FullAccess') return actions.addFullAccessKey(pk);
      return actions.addFunctionCallAccessKey(
        pk,
        permission.receiverId,
        permission.methodNames ?? [],
        permission.allowance !== undefined ? BigInt(permission.allowance) : undefined,
      );
    }
    case 'DeleteKey':
      return actions.deleteKey(PublicKey.fromString(action.params.publicKey));
    case 'DeleteAccount':
      return actions.deleteAccount(action.params.beneficiaryId);
    case 'UseGlobalContract': {
      const id = action.params.contractIdentifier;
      return actions.useGlobalContract(
        'accountId' in id ? { accountId: id.accountId } : { codeHash: id.codeHash },
      );
    }
    case 'DeployGlobalContract':
      return actions.deployGlobalContract(
        action.params.code,
        action.params.deployMode === 'CodeHash' ? 'codeHash' : 'accountId',
      );
    default:
      throw new Error(`Unsupported action type: ${(action as { type: string }).type}`);
  }
}

/**
 * Signs a NEAR transaction with a Privy embedded wallet and returns the signed transaction bytes.
 *
 * @param params - Transaction parameters including `receiverId` and `actions`.
 * @param walletAddress - The signer's implicit account address.
 * @param privy - Privy instance used for embedded-wallet transaction signing.
 * @param walletId - Privy wallet id used by the Wallet API signing call.
 * @param rpcOptions - Optional RPC connection options. Defaults to the public RPC for `params.network`.
 * @returns The signed transaction bytes ready for submission to the NEAR network.
 */
export async function signTransaction(
  params: SignAndSendTransactionParams,
  walletAddress: string,
  privy: Privy,
  walletId: string,
  rpcOptions?: RpcOptions,
): Promise<Uint8Array> {
  const provider = createProvider(params.network, rpcOptions);
  const signerId = params.signerId ?? walletAddress;
  const publicKey = publicKeyFromImplicit(walletAddress);
  const nearActionsList = params.actions.map(toNearAction);

  const account = new Account(signerId, provider);
  const transaction = await account.createTransaction({
    receiverId: params.receiverId,
    actions: nearActionsList,
    publicKey: publicKey.toString(),
  });

  const serializedTx = encodeTransaction(transaction);
  const txHashHex = toHex(sha256(serializedTx));

  const {
    data: { signature: hexSignature },
  } = await rawSign(
    privy,
    (requestOptions) => privy.embeddedWallet.signWithUserSigner(requestOptions),
    {
      wallet_id: walletId,
      params: {
        hash: txHashHex,
      },
    },
  );

  const signatureBytes = hexSignatureToBytes(hexSignature);
  const signedTx = new SignedTransaction({
    transaction,
    signature: new Signature({ keyType: transaction.publicKey.keyType, data: signatureBytes }),
  });

  return encodeTransaction(signedTx);
}

/**
 * Submits signed transaction bytes to the NEAR network via `broadcast_tx_commit`.
 *
 * @param signedTransaction - The signed transaction bytes to submit.
 * @param network - NEAR network to broadcast to. Defaults to `mainnet`.
 * @param rpcOptions - Optional RPC connection options. Defaults to the public RPC for `network`.
 * @returns The final execution outcome from the NEAR RPC.
 */
export async function sendTransaction(
  signedTransaction: Uint8Array,
  network?: Network,
  rpcOptions?: RpcOptions,
): Promise<FinalExecutionOutcome> {
  const url = rpcOptions?.url ?? NEAR_RPC_URLS[network ?? 'mainnet'];
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (rpcOptions?.headers) {
    for (const [k, v] of Object.entries(rpcOptions.headers)) {
      headers[k] = String(v);
    }
  }

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'broadcast_tx_commit',
    params: [base64.encode(signedTransaction)],
  });

  const response = await fetch(url, { method: 'POST', headers, body });
  const json = (await response.json()) as {
    result?: FinalExecutionOutcome;
    error?: { message: string };
  };

  if (json.error) throw new Error(json.error.message);
  return json.result!;
}

/** Transaction operations used by {@link signAndSendTransaction}. Exposed for testing. */
export const transactionOperations = {
  signTransaction,
  sendTransaction,
};

/**
 * Signs and submits a NEAR transaction using a Privy embedded wallet.
 *
 * @param params - Transaction parameters including `receiverId` and `actions`.
 * @param walletAddress - The signer's implicit account address.
 * @param privy - Privy instance used for embedded-wallet transaction signing.
 * @param walletId - Privy wallet id used by the Wallet API signing call.
 * @param rpcOptions - Optional RPC connection options forwarded to signing and submission.
 * @returns The final execution outcome from the NEAR network.
 */
export async function signAndSendTransaction(
  params: SignAndSendTransactionParams,
  walletAddress: string,
  privy: Privy,
  walletId: string,
  rpcOptions?: RpcOptions,
): Promise<FinalExecutionOutcome> {
  const signedTransaction = await transactionOperations.signTransaction(
    params,
    walletAddress,
    privy,
    walletId,
    rpcOptions,
  );
  return transactionOperations.sendTransaction(signedTransaction, params.network, rpcOptions);
}
