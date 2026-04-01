import type Privy from '@privy-io/js-sdk-core';
import type { LinkedAccountEmbeddedWallet } from '@privy-io/api-types';

import {
  NoNearWalletError,
  UnsupportedSigningPayloadError,
  WindowOpenerClosedError,
} from '@/signing/errors';
import { createProvider, AccountWithPrivySigner } from '@/signing/account';
import type { PrivyConfig, RpcOptions } from '@/signing/account';
import type { ChannelMsg, SigningPayload, SigningResult } from '@/types';
import { LOG_PREFIX } from '@/log';

export type { RpcOptions } from '@/signing/account';

/** Linked Privy NEAR wallet metadata. */
export type PrivyNearWallet = LinkedAccountEmbeddedWallet & {
  chain_type: 'near';
  /** Privy wallet ID. */
  id: string;
  /** Implicit account address (hex-encoded public key). */
  address: string;
};

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
  console.debug(LOG_PREFIX, 'User linked accounts fetched', { accounts: user.linked_accounts });
  for (const account of user.linked_accounts) {
    if (isPrivyNearWallet(account)) return account;
  }

  throw new NoNearWalletError();
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
    console.debug(LOG_PREFIX, '→ sign() start', { target, kind: payload.kind });
    if (!window.opener) throw new WindowOpenerClosedError();
    if (typeof payload !== 'object' || payload === null || !('kind' in payload)) {
      throw new UnsupportedSigningPayloadError();
    }

    const walletToUse = wallet ?? (await getUserNearWallet(privy));
    const walletConfig: PrivyConfig = {
      privyClient: privy,
      wallet: walletToUse,
    };
    const account = new AccountWithPrivySigner(
      walletConfig,
      createProvider(payload.network, rpcOptions),
    );

    let result: SigningResult;
    switch (payload.kind) {
      case 'signMessage':
        result = await account.ncSignMessage(payload);
        break;
      case 'signAndSendTransaction':
        result = (await account.signAndSendTransaction(payload)) as unknown as SigningResult;
        break;
      case 'signAndSendTransactions':
        result = (await account.signAndSendTransactions(payload)) as unknown as SigningResult;
        break;
      case 'signDelegateActions':
        result = await account.ncSignDelegateActions(payload);
        break;
      default:
        throw new UnsupportedSigningPayloadError();
    }

    const resultMsg = { type: 'RESULT', result } satisfies ChannelMsg;
    console.debug(LOG_PREFIX, '→ RESULT posted', resultMsg);
    (window.opener as Window).postMessage(resultMsg, target);
    window.close();
  };
}
