import type Privy from '@privy-io/js-sdk-core';

import { NoOpenerError, TimeoutError } from '@/sign-page.errors';
import { buildSignFn } from '@/signing/signer';
import type { PrivyNearWallet, RpcOptions } from '@/signing/signer';
import type { ChannelMsg, SigningPayload } from '@/types';
import { LOG_PREFIX } from '@/log';

const DEFAULT_SIGN_REQUEST_TIMEOUT_MS = 30_000;
const READY_MESSAGE = { type: 'READY' } as const satisfies ChannelMsg;
const INVALID_ORIGIN_ERROR_MESSAGE =
  'A specific target origin is required; wildcard origins are not allowed';

/** Options for configuring signing page handshake behavior. */
export type SignPageOptions = {
  /** Milliseconds to wait for `SIGN_REQUEST` before rejecting. */
  timeout?: number;
  /** Exact trusted origin to use for postMessage target and message filtering. Defaults to `window.opener.location.origin` when same-origin access is available. */
  allowedOrigin?: string;
  /** Privy NEAR wallet to use during signing. If omitted, the wallet is fetched from `privy.user.get()` during signing. */
  wallet?: PrivyNearWallet;
  /** RPC connection options forwarded to {@link signAndSendTransaction} for transaction payloads. Defaults to the public RPC for the payload's network. */
  rpcOptions?: RpcOptions;
};

/** Session returned by `initSigningPage` after receiving a signing payload. */
export type SignPageSession = {
  /** Payload received from the opener via `SIGN_REQUEST`. */
  payload: SigningPayload;
  /** Signs the payload using Privy and posts the result to the opener. */
  sign: () => Promise<void>;
};

let cleanupMountedIframe: (() => void) | undefined;

function mountPrivyIframe(privy: Privy): Promise<() => void> {
  return new Promise((resolve) => {
    const mountedIframe = document.querySelector('iframe[data-privy-embed]');
    if (mountedIframe && cleanupMountedIframe) {
      console.debug(LOG_PREFIX, '↺ Reusing existing Privy iframe');
      resolve(cleanupMountedIframe);
      return;
    }

    console.debug(LOG_PREFIX, '↻ Mounting Privy iframe');
    cleanupMountedIframe = undefined;

    const iframe = document.createElement('iframe');
    iframe.dataset.privyEmbed = '';
    iframe.src = privy.embeddedWallet.getURL();
    iframe.style.display = 'none';

    let cleanedUp = false;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      privy.embeddedWallet.onMessage(event.data);
    };

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      console.debug(LOG_PREFIX, '↻ Cleaning up existing Privy iframe');
      window.removeEventListener('message', onMessage);
      iframe.remove();
      if (cleanupMountedIframe === cleanup) cleanupMountedIframe = undefined;
    };

    iframe.addEventListener(
      'load',
      () => {
        privy.setMessagePoster({
          postMessage: (msg, origin, transfer) =>
            iframe.contentWindow!.postMessage(msg, origin, transfer ? [transfer] : undefined),
          reload: () => {
            iframe.src = privy.embeddedWallet.getURL();
          },
        });
        console.debug(LOG_PREFIX, '✓ Privy iframe loaded and message poster set');
        cleanupMountedIframe = cleanup;
        resolve(cleanup);
      },
      { once: true },
    );

    window.addEventListener('message', onMessage);

    document.body.appendChild(iframe);
  });
}

function waitForOpenerSignRequest(allowedOrigin: string, timeout: number): Promise<SigningPayload> {
  return new Promise((resolve, reject) => {
    console.debug(LOG_PREFIX, '… Waiting for SIGN_REQUEST', { allowedOrigin, timeout });

    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== allowedOrigin) return;
      const msg = event.data as ChannelMsg;
      if (!msg || msg.type !== 'SIGN_REQUEST') return;
      cleanup();
      console.debug(LOG_PREFIX, '← SIGN_REQUEST received', msg.payload);
      resolve(msg.payload);
    };

    window.addEventListener('message', onMessage);

    const timeoutId = setTimeout(() => {
      cleanup();
      console.debug(LOG_PREFIX, '✗ SIGN_REQUEST timed out', { timeout });
      reject(new TimeoutError(timeout));
    }, timeout);
  });
}

/**
 * Mounts the Privy embedded wallet iframe and initializes the signing page
 * handshake with the opener window.
 *
 * @param privy - An instantiated and initialized Privy client.
 * @param options - Optional timeout and trusted origin overrides. Provide `allowedOrigin` when the opener is cross-origin.
 * @returns A session containing the received payload and a `sign` callback.
 * @throws {@link NoOpenerError} If `window.opener` is not available.
 * @throws {@link TimeoutError} If no `SIGN_REQUEST` arrives before timeout.
 */
export const initSigningPage = async (
  privy: Privy,
  options?: SignPageOptions,
): Promise<SignPageSession> => {
  console.debug(LOG_PREFIX, '→ initSigningPage start');
  if (!window.opener) throw new NoOpenerError();

  let target = options?.allowedOrigin;
  if (!target) {
    try {
      target = window.opener.location.origin;
    } catch {
      throw new Error(INVALID_ORIGIN_ERROR_MESSAGE);
    }
  }
  if (!target || target === '*') throw new Error(INVALID_ORIGIN_ERROR_MESSAGE);

  await mountPrivyIframe(privy);

  (window.opener as Window).postMessage(READY_MESSAGE, target);
  console.debug(LOG_PREFIX, '→ READY posted to', target);

  const payload = await waitForOpenerSignRequest(
    target,
    options?.timeout ?? DEFAULT_SIGN_REQUEST_TIMEOUT_MS,
  );

  return {
    payload,
    sign: buildSignFn(target, privy, payload, options?.wallet, options?.rpcOptions),
  };
};
