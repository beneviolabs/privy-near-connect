import type Privy from '@privy-io/js-sdk-core';
import type { SignAndSendTransactionParams, SignMessageParams } from '@hot-labs/near-connect';
import type { LinkedAccountEmbeddedWallet } from '@privy-io/api-types';
import type { Network } from '@hot-labs/near-connect/build/types/index.js';

import {
  NoNearWalletError,
  UnsupportedSigningPayloadError,
  WindowOpenerClosedError,
} from '@/signing/errors';
import { createProvider, CustomAccount } from '@/signing/account';
import type { PrivyConfig, RpcOptions } from '@/signing/account';
import { toNearAction } from '@/signing/utils';
import type {
  ChannelMsg,
  SignAndSendTransactionsPayload,
  SignInPayload,
  SignOutPayload,
  SigningPayload,
  SigningResult,
} from '@/types';

export type { RpcOptions } from '@/signing/account';

/** Linked Privy NEAR wallet metadata. */
export type PrivyNearWallet = LinkedAccountEmbeddedWallet & {
  chain_type: 'near';
  /** Privy wallet ID. */
  id: string;
  /** Implicit account address (hex-encoded public key). */
  address: string;
};

function isSignMessagePayload(payload: SigningPayload): payload is SignMessageParams {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'message' in payload &&
    'nonce' in payload &&
    'recipient' in payload
  );
}

function isSignAndSendTransactionPayload(
  payload: SigningPayload,
): payload is SignAndSendTransactionParams {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'receiverId' in payload &&
    'actions' in payload
  );
}

function isSignInPayload(payload: SigningPayload): payload is SignInPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    payload.kind === 'signIn'
  );
}

function isSignOutPayload(payload: SigningPayload): payload is SignOutPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    payload.kind === 'signOut'
  );
}

function isSignAndSendTransactionsPayload(
  payload: SigningPayload,
): payload is SignAndSendTransactionsPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    payload.kind === 'signAndSendTransactions'
  );
}

function isPrivyNearWallet(account: unknown): account is PrivyNearWallet {
  if (typeof account !== 'object' || account === null) return false;

  const typedAccount = account as {
    type?: unknown;
    chain_type?: unknown;
    id?: unknown;
    address?: unknown;
  };

  return (
    typedAccount.type === 'wallet' &&
    typedAccount.chain_type === 'near' &&
    typeof typedAccount.id === 'string' &&
    typeof typedAccount.address === 'string'
  );
}

async function getUserNearWallet(privy: Privy): Promise<PrivyNearWallet> {
  const { user } = await privy.user.get();
  for (const account of user.linked_accounts) {
    if (isPrivyNearWallet(account)) return account;
  }

  throw new NoNearWalletError();
}

function getNetworkFromPayload(payload: SigningPayload): Network | undefined {
  if (isSignAndSendTransactionPayload(payload)) return payload.network;
  if (isSignAndSendTransactionsPayload(payload)) return payload.params.network;
  if (isSignInPayload(payload)) return payload.params?.network;
  if (isSignOutPayload(payload)) return payload.params.network;
  return undefined;
}

/**
 * Builds a signer callback for a received signing payload.
 *
 * @param target - postMessage target origin for opener communication.
 * @param privy - Initialized Privy client used for embedded-wallet signing.
 * @param payload - Payload received from opener via `SIGN_REQUEST`.
 * @param wallet - Optional preselected Privy NEAR wallet metadata. When omitted, the wallet is fetched from `privy.user.get()` during signing.
 * @param rpcOptions - Optional RPC connection options forwarded to transaction signing.
 * @returns An async signer callback that signs the payload, posts `RESULT`, and closes the popup.
 * @throws {@link WindowOpenerClosedError} If `window.opener` is no longer available when the returned signer runs.
 * @throws {@link UnsupportedSigningPayloadError} If the payload is not a supported signer request.
 * @throws {@link NoNearWalletError} If no linked NEAR wallet is available and no `wallet` was provided.
 * @throws {@link PrivyApiError} This comes from the Privy lib and is thrown if an error occurs during API calls.
 */
export function buildSignFn(
  target: string,
  privy: Privy,
  payload: SigningPayload,
  wallet?: PrivyNearWallet,
  rpcOptions?: RpcOptions,
): () => Promise<void> {
  return async () => {
    if (!window.opener) throw new WindowOpenerClosedError();
    if (
      !isSignMessagePayload(payload) &&
      !isSignAndSendTransactionPayload(payload) &&
      !isSignInPayload(payload) &&
      !isSignOutPayload(payload) &&
      !isSignAndSendTransactionsPayload(payload)
    ) {
      throw new UnsupportedSigningPayloadError();
    }

    const walletToUse = wallet ?? (await getUserNearWallet(privy));
    const walletConfig: PrivyConfig = {
      privyClient: privy,
      wallet: walletToUse,
    };
    const account = new CustomAccount(
      walletConfig,
      createProvider(getNetworkFromPayload(payload), rpcOptions),
    );

    let result: SigningResult;
    if (isSignInPayload(payload)) {
      result = await account.signIn();
    } else if (isSignOutPayload(payload)) {
      result = await account.signOut(payload.params);
    } else {
      if (isSignMessagePayload(payload)) {
        result = await account.signMessage(payload);
      } else if (isSignAndSendTransactionPayload(payload)) {
        result = (await account.signAndSendTransaction(payload)) as unknown as SigningResult;
      } else {
        result = (await account.signAndSendTransactions({
          transactions: payload.params.transactions.map((transaction) => ({
            receiverId: transaction.receiverId,
            actions: transaction.actions.map(toNearAction),
          })),
        })) as unknown as SigningResult;
      }
    }

    (window.opener as Window).postMessage({ type: 'RESULT', result } satisfies ChannelMsg, target);
    window.close();
  };
}
