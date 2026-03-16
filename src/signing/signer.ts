import type Privy from '@privy-io/js-sdk-core';
import type { SignMessageParams } from '@hot-labs/near-connect';

import type { ChannelMsg } from '../types';
import {
  AlreadySignedError,
  UnsupportedSigningPayloadError,
  WindowOpenerClosedError,
} from '../sign-page.errors';
import { signMessage } from './message';

const NO_NEAR_WALLET_ERROR_MESSAGE = 'No linked Privy NEAR wallet found for this user';
type SigningPayload = Extract<ChannelMsg, { type: 'SIGN_REQUEST' }>['payload'];

/** Linked Privy NEAR wallet metadata used by the sign-page signer. */
export type PrivyNearWallet = {
  /** Linked-account kind from Privy user profile. */
  type: 'wallet';
  /** Wallet chain type. */
  chain_type: 'near';
  /** Privy wallet identifier used by Wallet API raw signing. */
  id: string;
  /** NEAR implicit account address used as signer accountId. */
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

  throw new Error(NO_NEAR_WALLET_ERROR_MESSAGE);
}

/**
 * Builds a one-shot `sign` callback for a received signing payload.
 *
 * @param target - postMessage target origin for opener communication.
 * @param privy - Initialized Privy client used for embedded-wallet signing.
 * @param payload - Payload received from opener via `SIGN_REQUEST`.
 * @param wallet - Optional preselected Privy NEAR wallet metadata.
 * @returns An async callback that signs once, posts `RESULT`, and closes the popup.
 */
export function buildSignFn(
  target: string,
  privy: Privy,
  payload: SigningPayload,
  wallet?: PrivyNearWallet,
): () => Promise<void> {
  let signed = false;
  return async () => {
    if (signed) throw new AlreadySignedError();
    signed = true;
    if (!window.opener) throw new WindowOpenerClosedError();
    if (!isSignMessagePayload(payload)) throw new UnsupportedSigningPayloadError();

    const walletToUse = wallet ?? (await getUserNearWallet(privy));

    const result = await signMessage(payload, walletToUse.address, privy, walletToUse.id);
    (window.opener as Window).postMessage({ type: 'RESULT', result } satisfies ChannelMsg, target);
    window.close();
  };
}
