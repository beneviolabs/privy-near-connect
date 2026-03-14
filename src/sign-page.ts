import type { ChannelMsg, SigningPayload } from './types.js';
import {
  AlreadySignedError,
  NoOpenerError,
  OpenerClosedError,
  TimeoutError,
} from './sign-page.errors.js';

const DEFAULT_SIGN_REQUEST_TIMEOUT_MS = 30_000;
const READY_MESSAGE = { type: 'READY' } as const satisfies ChannelMsg;
const INVALID_ORIGIN_ERROR_MESSAGE =
  'A specific target origin is required; wildcard origins are not allowed';

/** Options for configuring signing page handshake behavior. */
export type SignPageOptions = {
  /** Milliseconds to wait for `SIGN_REQUEST` before rejecting. */
  timeout?: number;
  /** Exact trusted origin to use for postMessage target and message filtering. */
  allowedOrigin?: string;
};

/** Session returned by `initSigningPage` after receiving a signing payload. */
export type SignPageSession = {
  /** Payload received from the opener via `SIGN_REQUEST`. */
  payload: SigningPayload;
  /** Signs the payload using Privy and posts the result to the opener exactly once. */
  sign: () => Promise<void>;
};

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

function buildSign(target: string, payload: SigningPayload): () => Promise<void> {
  let signed = false;
  return async () => {
    if (signed) throw new AlreadySignedError();
    signed = true;
    if (!window.opener) throw new OpenerClosedError();
    // TODO: call Privy signing implementation with payload
    throw new Error('Privy signing is not yet implemented');
  };
}

/**
 * Initializes the signing page handshake with the opener window.
 *
 * @param options - Optional timeout and trusted origin overrides.
 * @returns A session containing the received payload and a `sign` callback.
 * @throws {@link NoOpenerError} If `window.opener` is not available.
 * @throws {@link TimeoutError} If no `SIGN_REQUEST` arrives before timeout.
 */
export const initSigningPage = async (options?: SignPageOptions): Promise<SignPageSession> => {
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

  (window.opener as Window).postMessage(READY_MESSAGE, target);
  const payload = await waitForOpenerSignRequest(target, options?.timeout ?? DEFAULT_SIGN_REQUEST_TIMEOUT_MS);

  return { payload, sign: buildSign(target, payload) };
};
