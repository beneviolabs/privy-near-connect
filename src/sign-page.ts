import type Privy from '@privy-io/js-sdk-core';

import {
  MissingAllowedOriginsError,
  NoOpenerError,
  TimeoutError,
  WildcardOriginError,
} from '@/sign-page.errors';
import { buildSignFn } from '@/signing/signer';
import { channelMsg, CHANNEL_SOURCE } from '@/types';
import type { ChannelMsg, SignPageOptions, SignPageSession, SigningPayload } from '@/types';
import { createLogger, LOG_PREFIX, type Logger } from '@/log';

export type { SignPageOptions, SignPageSession } from '@/types';

const DEFAULT_SIGN_REQUEST_TIMEOUT_MS = 30_000;
const READY_MESSAGE = channelMsg.ready();
let cleanupMountedIframe: (() => void) | undefined;

function mountPrivyIframe(
  privy: Privy,
  signal: AbortSignal | undefined,
  logger: Logger,
): Promise<() => void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

    const mountedIframe = document.querySelector('iframe[data-privy-embed]');
    if (mountedIframe && cleanupMountedIframe) {
      logger.debug('↺ Reusing existing Privy iframe');
      resolve(cleanupMountedIframe);
      return;
    }

    logger.debug('↻ Mounting Privy iframe');
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
      logger.debug('↻ Cleaning up existing Privy iframe');
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      iframe.remove();
      if (cleanupMountedIframe === cleanup) cleanupMountedIframe = undefined;
    };

    const onAbort = () => {
      logger.debug('✗ Privy iframe mount aborted');
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
        logger.debug('✓ Privy iframe loaded and message poster set');
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
  logger: Logger,
  signal?: AbortSignal,
): Promise<{ payload: SigningPayload; targetOrigin: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    logger.debug('… Waiting for SIGN_REQUEST', { allowedOrigins, timeout });

    const cleanup = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      logger.debug('✗ SIGN_REQUEST wait aborted');
      reject(abortReason(signal));
    };

    const onMessage = (event: MessageEvent) => {
      if (
        allowedOrigins !== 'dangerouslyAllowAllOrigins' &&
        !allowedOrigins.includes(event.origin)
      ) {
        logger.debug('✗ Ignoring message from disallowed origin', event.data, event.origin);
        return;
      }
      const msg = event.data as ChannelMsg;
      if (!msg || msg.source !== CHANNEL_SOURCE || msg.type !== 'SIGN_REQUEST') {
        logger.debug('✗ Ignoring non-SIGN_REQUEST message', msg);
        return;
      }
      cleanup();
      logger.debug('← SIGN_REQUEST received', msg.payload);
      resolve({ payload: msg.payload, targetOrigin: event.origin });
    };

    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort);

    const timeoutId = setTimeout(() => {
      cleanup();
      logger.debug('✗ SIGN_REQUEST timed out', { timeout });
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
 * @returns A session containing the received payload and a `sign` callback.
 * @throws {@link NoOpenerError} If `window.opener` is not available.
 * @throws {@link MissingAllowedOriginsError} If `allowedOrigins` was omitted.
 * @throws {@link WildcardOriginError} If `allowedOrigins` contains `'*'`.
 * @throws {@link TimeoutError} If no `SIGN_REQUEST` arrives before timeout.
 */
export const initSigningPage = async (
  privy: Privy,
  options: SignPageOptions,
): Promise<SignPageSession> => {
  const logger = createLogger(LOG_PREFIX, options.debug);
  logger.debug('→ initSigningPage start');
  if (!window.opener) throw new NoOpenerError();
  if (options.allowedOrigins === undefined) throw new MissingAllowedOriginsError();
  if (Array.isArray(options.allowedOrigins) && options.allowedOrigins.includes('*')) {
    throw new WildcardOriginError();
  }

  if (options.signal?.aborted) throw abortReason(options.signal);

  await mountPrivyIframe(privy, options.signal, logger);

  (window.opener as Window).postMessage(READY_MESSAGE, '*');
  logger.debug('→ READY posted to *');

  const { payload, targetOrigin } = await waitForOpenerSignRequest(
    options.allowedOrigins,
    options.timeout ?? DEFAULT_SIGN_REQUEST_TIMEOUT_MS,
    logger,
    options.signal,
  );

  return {
    payload,
    targetOrigin,
    sign: buildSignFn(
      targetOrigin,
      privy,
      payload,
      options.wallet,
      options.rpcOptions,
      options.debug,
    ),
  };
};
