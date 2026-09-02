import type Privy from '@privy-io/js-sdk-core';

import {
  MissingAllowedOriginsError,
  NoOpenerError,
  TimeoutError,
  WildcardOriginError,
} from '@/sign-page.errors';
import { buildSignFn } from '@/signing/signer';
import { canonicalizeSigningPayload } from '@/signing/payload';
import { channelMsg, CHANNEL_SOURCE } from '@/types';
import type { ChannelMsg, SignPageOptions, SignPageSession, SigningPayload } from '@/types';
import { LOG_PREFIX } from '@/log';

export type { SignPageOptions, SignPageSession } from '@/types';

const DEFAULT_SIGN_REQUEST_TIMEOUT_MS = 30_000;
const READY_MESSAGE = channelMsg.ready();
let cleanupMountedIframe: (() => void) | undefined;

function mountPrivyIframe(privy: Privy, signal?: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

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
      signal?.removeEventListener('abort', onAbort);
      iframe.remove();
      if (cleanupMountedIframe === cleanup) cleanupMountedIframe = undefined;
    };

    const onAbort = () => {
      console.debug(LOG_PREFIX, '✗ Privy iframe mount aborted');
      cleanup();
      reject(abortReason(signal));
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
        signal?.removeEventListener('abort', onAbort);
        cleanupMountedIframe = cleanup;
        resolve(cleanup);
      },
      { once: true },
    );

    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort);

    document.body.appendChild(iframe);
  });
}

function waitForOpenerSignRequest(
  allowedOrigins: string[] | 'dangerouslyAllowAllOrigins',
  timeout: number,
  signal?: AbortSignal,
): Promise<{ payload: SigningPayload; targetOrigin: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    console.debug(LOG_PREFIX, '… Waiting for SIGN_REQUEST', { allowedOrigins, timeout });

    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      console.debug(LOG_PREFIX, '✗ SIGN_REQUEST wait aborted');
      reject(abortReason(signal));
    };

    const onMessage = (event: MessageEvent) => {
      if (
        allowedOrigins !== 'dangerouslyAllowAllOrigins' &&
        !allowedOrigins.includes(event.origin)
      ) {
        console.debug(
          LOG_PREFIX,
          '✗ Ignoring message from disallowed origin',
          event.data,
          event.origin,
        );
        return;
      }
      const msg = event.data as ChannelMsg;
      if (!msg || msg.source !== CHANNEL_SOURCE || msg.type !== 'SIGN_REQUEST') {
        console.debug(LOG_PREFIX, '✗ Ignoring non-SIGN_REQUEST message', msg);
        return;
      }
      cleanup();
      console.debug(LOG_PREFIX, '← SIGN_REQUEST received', msg.payload);
      resolve({ payload: msg.payload, targetOrigin: event.origin });
    };

    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort);

    const timeoutId = setTimeout(() => {
      cleanup();
      console.debug(LOG_PREFIX, '✗ SIGN_REQUEST timed out', { timeout });
      reject(new TimeoutError(timeout));
    }, timeout);
  });
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException('The signing handshake was aborted', 'AbortError');
}

/**
 * Mounts the Privy embedded wallet iframe and initializes the signing page
 * handshake with the opener window.
 *
 * Sends `READY` to the opener with a wildcard target (`*`). Once a `SIGN_REQUEST`
 * arrives, its sender's origin becomes the exclusive `targetOrigin` used for all
 * subsequent messages. `allowedOrigins` must always be supplied explicitly:
 * either a concrete origin list or `'dangerouslyAllowAllOrigins'` to accept any origin.
 *
 * @param privy - An instantiated and initialized Privy client.
 * @param options - Timeout, origin policy, and signing overrides.
 * @returns A session containing the validated, canonical payload and a `sign` callback.
 * @throws {@link NoOpenerError} If `window.opener` is not available.
 * @throws {@link MissingAllowedOriginsError} If `allowedOrigins` was omitted.
 * @throws {@link WildcardOriginError} If `allowedOrigins` contains `'*'`.
 * @throws {@link TimeoutError} If no `SIGN_REQUEST` arrives before timeout.
 * @throws An `InvalidSigningPayloadError` if the request kind or one of its actions is malformed or unsupported.
 */
export const initSigningPage = async (
  privy: Privy,
  options: SignPageOptions,
): Promise<SignPageSession> => {
  console.debug(LOG_PREFIX, '→ initSigningPage start');
  if (!window.opener) throw new NoOpenerError();
  if (options.allowedOrigins === undefined) throw new MissingAllowedOriginsError();
  if (Array.isArray(options.allowedOrigins) && options.allowedOrigins.includes('*')) {
    throw new WildcardOriginError();
  }

  if (options.signal?.aborted) throw abortReason(options.signal);

  await mountPrivyIframe(privy, options.signal);

  (window.opener as Window).postMessage(READY_MESSAGE, '*');
  console.debug(LOG_PREFIX, '→ READY posted to *');

  const { payload: receivedPayload, targetOrigin } = await waitForOpenerSignRequest(
    options.allowedOrigins,
    options.timeout ?? DEFAULT_SIGN_REQUEST_TIMEOUT_MS,
    options.signal,
  );
  const payload = canonicalizeSigningPayload(receivedPayload);

  return {
    payload,
    targetOrigin,
    sign: buildSignFn(targetOrigin, privy, payload, options.wallet, options.rpcOptions),
  };
};
