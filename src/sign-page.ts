import type Privy from '@privy-io/js-sdk-core';
import type { LinkedAccountEmbeddedWallet } from '@privy-io/api-types';

import { signMessage } from './sign-message.js';
import type { ChannelMsg, SignMessageParams, SigningPayload } from './types.js';
import {
  AlreadySignedError,
  NoOpenerError,
  TimeoutError,
  UnsupportedSigningPayloadError,
  WindowOpenerClosedError,
} from './sign-page.errors.js';

const DEFAULT_SIGN_REQUEST_TIMEOUT_MS = 30_000;
const READY_MESSAGE = { type: 'READY' } as const satisfies ChannelMsg;
const INVALID_ORIGIN_ERROR_MESSAGE =
  'A specific target origin is required; wildcard origins are not allowed';
const NO_NEAR_WALLET_ERROR_MESSAGE = 'No linked Privy NEAR wallet found for this user';

type PrivyNearWallet = LinkedAccountEmbeddedWallet & {
  chain_type: 'near';
  id: string;
  address: string;
};

/** Options for configuring signing page handshake behavior. */
export type SignPageOptions = {
  /** Milliseconds to wait for `SIGN_REQUEST` before rejecting. */
  timeout?: number;
  /** Exact trusted origin to use for postMessage target and message filtering. Defaults to the current window origin. */
  allowedOrigin?: string;
  /** Wallet to use during signing. If omitted, it is fetched from `privy.user.get()` during signing. */
  wallet?: PrivyNearWallet;
};

/** Session returned by `initSigningPage` after receiving a signing payload. */
export type SignPageSession = {
  /** Payload received from the opener via `SIGN_REQUEST`. */
  payload: SigningPayload;
  /** Signs the payload using Privy and posts the result to the opener exactly once. */
  sign: () => Promise<void>;
};

function mountPrivyIframe(privy: Privy): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.dataset.privyEmbed = '';
    iframe.src = privy.embeddedWallet.getURL();
    iframe.style.display = 'none';

    iframe.addEventListener('load', () => {
      privy.setMessagePoster({
        postMessage: (msg, origin, transfer) =>
          iframe.contentWindow!.postMessage(msg, origin, transfer ? [transfer] : undefined),
        reload: () => {
          iframe.src = privy.embeddedWallet.getURL();
        },
      });
      resolve();
    });

    window.addEventListener('message', (event) => {
      if (event.source !== iframe.contentWindow) return;
      privy.embeddedWallet.onMessage(event.data);
    });

    document.body.appendChild(iframe);
  });
}

function waitForOpenerSignRequest(allowedOrigin: string, timeout: number): Promise<SigningPayload> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== allowedOrigin) return;
      const msg = event.data as ChannelMsg;
      if (!msg || msg.type !== 'SIGN_REQUEST') return;
      cleanup();
      resolve(msg.payload);
    };

    window.addEventListener('message', onMessage);

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new TimeoutError(timeout));
    }, timeout);
  });
}

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

function buildSignFn(
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

/**
 * Mounts the Privy embedded wallet iframe and initializes the signing page
 * handshake with the opener window.
 *
 * @param privy - An instantiated and initialized Privy client.
 * @param options - Optional timeout and trusted origin overrides.
 * @returns A session containing the received payload and a `sign` callback.
 * @throws {@link NoOpenerError} If `window.opener` is not available.
 * @throws {@link TimeoutError} If no `SIGN_REQUEST` arrives before timeout.
 */
export const initSigningPage = async (
  privy: Privy,
  options?: SignPageOptions,
): Promise<SignPageSession> => {
  if (!window.opener) throw new NoOpenerError();
  if (options?.allowedOrigin === '*') throw new Error(INVALID_ORIGIN_ERROR_MESSAGE);

  let target = options?.allowedOrigin;
  if (!target) {
    try {
      target = (window.opener as Window).origin;
    } catch {
      throw new Error(INVALID_ORIGIN_ERROR_MESSAGE);
    }
  }
  if (!target || target === '*') throw new Error(INVALID_ORIGIN_ERROR_MESSAGE);

  await mountPrivyIframe(privy);

  (window.opener as Window).postMessage(READY_MESSAGE, target);
  const payload = await waitForOpenerSignRequest(
    target,
    options?.timeout ?? DEFAULT_SIGN_REQUEST_TIMEOUT_MS,
  );

  return {
    payload,
    sign: buildSignFn(target, privy, payload, options?.wallet),
  };
};
