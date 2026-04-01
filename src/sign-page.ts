import type Privy from '@privy-io/js-sdk-core';

import { NoOpenerError, TimeoutError, WildcardOriginError } from '@/sign-page.errors';
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
  allowedOrigins: string[] | undefined,
  timeout: number,
): Promise<{ payload: SigningPayload; targetOrigin: string }> {
  return new Promise((resolve, reject) => {
    console.debug(LOG_PREFIX, '… Waiting for SIGN_REQUEST', { allowedOrigins, timeout });

    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
    };

    const onMessage = (event: MessageEvent) => {
      if (allowedOrigins && !allowedOrigins.includes(event.origin)) {
        console.debug(
          LOG_PREFIX,
          '✗ Ignoring message from disallowed origin',
          event.data,
          event.origin,
        );
        return;
      }
      const msg = event.data as ChannelMsg;
      if (!msg || msg.type !== 'SIGN_REQUEST') {
        console.debug(LOG_PREFIX, '✗ Ignoring non-SIGN_REQUEST message', msg);
        return;
      }
      cleanup();
      console.debug(LOG_PREFIX, '← SIGN_REQUEST received', msg.payload);
      resolve({ payload: msg.payload, targetOrigin: event.origin });
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
 * Sends `READY` to the opener with a wildcard target (`*`). Once a `SIGN_REQUEST`
 * arrives, its sender's origin becomes the exclusive `targetOrigin` used for all
 * subsequent messages. If `allowedOrigins` is provided, only requests from those
 * origins are accepted; otherwise any origin may initiate the request.
 *
 * @param privy - An instantiated and initialized Privy client.
 * @param options - Optional timeout and origin allowlist overrides.
 * @returns A session containing the received payload and a `sign` callback.
 * @throws {@link NoOpenerError} If `window.opener` is not available.
 * @throws {@link WildcardOriginError} If `allowedOrigins` contains `'*'`.
 * @throws {@link TimeoutError} If no `SIGN_REQUEST` arrives before timeout.
 */
export const initSigningPage = async (
  privy: Privy,
  options?: SignPageOptions,
): Promise<SignPageSession> => {
  console.debug(LOG_PREFIX, '→ initSigningPage start');
  if (!window.opener) throw new NoOpenerError();
  if (options?.allowedOrigins?.includes('*')) throw new WildcardOriginError();

  await mountPrivyIframe(privy);

  (window.opener as Window).postMessage(READY_MESSAGE, '*');
  console.debug(LOG_PREFIX, '→ READY posted to *');

  const { payload, targetOrigin } = await waitForOpenerSignRequest(
    options?.allowedOrigins,
    options?.timeout ?? DEFAULT_SIGN_REQUEST_TIMEOUT_MS,
  );

  return {
    payload,
    sign: buildSignFn(targetOrigin, privy, payload, options?.wallet, options?.rpcOptions),
  };
};
