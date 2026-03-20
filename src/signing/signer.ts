import type Privy from '@privy-io/js-sdk-core';
import type { SignMessageParams } from '@hot-labs/near-connect';

import {
  NoNearWalletError,
  UnsupportedSigningPayloadError,
  WindowOpenerClosedError,
} from '@/signing/errors';
import { signMessage } from '@/signing/message';
import type { ChannelMsg, SigningPayload } from '@/types';
import type { LinkedAccountEmbeddedWallet } from '@privy-io/api-types';

/** Linked Privy NEAR wallet metadata used by the sign-page signer. */
export type PrivyNearWallet = LinkedAccountEmbeddedWallet & {
  chain_type: 'near';
  id: string;
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

/**
 * Builds a signer callback for a received signing payload.
 *
 * @param target - postMessage target origin for opener communication.
 * @param privy - Initialized Privy client used for embedded-wallet signing.
 * @param payload - Payload received from opener via `SIGN_REQUEST`.
 * @param wallet - Optional preselected Privy NEAR wallet metadata.
 * @returns An async signer callback that signs the payload, posts `RESULT`, and closes the popup.
 * @throws {@link WindowOpenerClosedError} If `window.opener` is no longer available when the returned signer runs.
 * @throws {@link UnsupportedSigningPayloadError} If the payload is not a NEP-413 message payload.
 * @throws {@link NoNearWalletError} If no linked NEAR wallet is available and no wallet was provided.
 * @throws {@link PrivyApiError} This comes from the Privy lib and is thrown if an error occurs during API calls.
 */
export function buildSignFn(
  target: string,
  privy: Privy,
  payload: SigningPayload,
  wallet?: PrivyNearWallet,
): () => Promise<void> {
  return async () => {
    if (!window.opener) throw new WindowOpenerClosedError();
    if (!isSignMessagePayload(payload)) throw new UnsupportedSigningPayloadError();

    const walletToUse = wallet ?? (await getUserNearWallet(privy));

    const result = await signMessage(payload, walletToUse.address, privy, walletToUse.id);
    (window.opener as Window).postMessage({ type: 'RESULT', result } satisfies ChannelMsg, target);
    window.close();
  };
}
