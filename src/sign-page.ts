import type Privy from '@privy-io/js-sdk-core';

import { NoOpenerError, TimeoutError } from '@/sign-page.errors';
import { buildSignFn } from '@/signing/signer';
import type { ChannelMsg, SignPageOptions, SignPageSession, SigningPayload } from '@/types';
import { LOG_PREFIX } from '@/log';

export type { SignPageOptions, SignPageSession } from '@/types';

const DEFAULT_SIGN_REQUEST_TIMEOUT_MS = 30_000;
const READY_MESSAGE = { type: 'READY' } as const satisfies ChannelMsg;

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

function waitForOpenerSignRequest(
  allowedOrigins: string[],
  timeout: number,
): Promise<SigningPayload> {
  return new Promise((resolve, reject) => {
    console.debug(LOG_PREFIX, '… Waiting for SIGN_REQUEST', { allowedOrigins, timeout });

    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
    };

    const onMessage = (event: MessageEvent) => {
      if (!allowedOrigins.includes(event.origin)) return;
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
 * @param options - Optional timeout and additional trusted origins besides `window.opener.location.origin`.
 * @returns A session containing the received payload and a `sign` callback.
 * @throws {@link NoOpenerError} If `window.opener` is `null`.
 * @throws {DOMException} If `window.opener.location.origin` is not readable (cross-origin opener).
 * @throws {@link TimeoutError} If no `SIGN_REQUEST` arrives before timeout.
 */
export const initSigningPage = async (
  privy: Privy,
  options?: SignPageOptions,
): Promise<SignPageSession> => {
  console.debug(LOG_PREFIX, '→ initSigningPage start with options:', options);
  if (!window.opener) throw new NoOpenerError();

  const target = window.opener.location.origin;
  const configuredAllowedOrigins = options?.allowedOrigins ?? [];
  const allowedOrigins = Array.from(new Set([target, ...configuredAllowedOrigins]));

  await mountPrivyIframe(privy);

  (window.opener as Window).postMessage(READY_MESSAGE, target);
  console.debug(LOG_PREFIX, '→ READY posted to', target);

  const payload = await waitForOpenerSignRequest(
    allowedOrigins,
    options?.timeout ?? DEFAULT_SIGN_REQUEST_TIMEOUT_MS,
  );

  return {
    payload,
    sign: buildSignFn(target, privy, payload, options?.wallet, options?.rpcOptions),
  };
};
