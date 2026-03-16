// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Privy from '@privy-io/js-sdk-core';
import type { SignMessageParams } from '@hot-labs/near-connect';

import { NoOpenerError, TimeoutError } from '@/sign-page.errors';
import { initSigningPage } from '@/sign-page';

// ---------- helpers ----------

const OPENER_ORIGIN = 'https://app.example.com';

const TEST_PAYLOAD: SignMessageParams = {
  message: 'hello',
  recipient: 'bob.near',
  nonce: new Uint8Array(32),
};

function mockOpener() {
  const opener = { postMessage: vi.fn(), origin: OPENER_ORIGIN };
  vi.stubGlobal('opener', opener);
  return opener;
}

function mockPrivy(): Privy {
  return {
    embeddedWallet: {
      getURL: vi.fn().mockReturnValue('about:blank'),
      onMessage: vi.fn(),
    },
    setMessagePoster: vi.fn(),
  } as unknown as Privy;
}

/** Flush the microtask queue then fire the load event on the Privy embedded wallet iframe. */
async function flushPrivyIframeLoad() {
  await Promise.resolve();
  document.querySelector('iframe[data-privy-embed]')?.dispatchEvent(new Event('load'));
}

function dispatchSignRequest(payload = TEST_PAYLOAD, origin = OPENER_ORIGIN) {
  window.dispatchEvent(
    new MessageEvent('message', { origin, data: { type: 'SIGN_REQUEST', payload } }),
  );
}

describe('initSigningPage()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.querySelectorAll('iframe[data-privy-embed]').forEach((el) => el.remove());
  });

  describe('opener guard', () => {
    it('throws NoOpenerError when window.opener is null', async () => {
      vi.stubGlobal('opener', null);
      await expect(initSigningPage(mockPrivy())).rejects.toBeInstanceOf(NoOpenerError);
    });
  });

  describe('origin guard', () => {
    it('rejects explicit wildcard allowedOrigin', async () => {
      mockOpener();
      await expect(initSigningPage(mockPrivy(), { allowedOrigin: '*' })).rejects.toThrow();
    });
  });

  describe('READY handshake', () => {
    it('posts READY to opener using opener.origin as target', async () => {
      vi.useFakeTimers();
      const opener = mockOpener();
      const promise = initSigningPage(mockPrivy());

      await flushPrivyIframeLoad();
      expect(opener.postMessage).toHaveBeenCalledWith({ type: 'READY' }, OPENER_ORIGIN);

      vi.runAllTimers();
      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('uses allowedOrigin as postMessage target when provided', async () => {
      vi.useFakeTimers();
      const opener = mockOpener();
      const allowed = 'https://custom.example.com';
      const promise = initSigningPage(mockPrivy(), { allowedOrigin: allowed });

      await flushPrivyIframeLoad();
      expect(opener.postMessage).toHaveBeenCalledWith({ type: 'READY' }, allowed);

      vi.runAllTimers();
      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  describe('SIGN_REQUEST handling', () => {
    it('resolves with the payload when SIGN_REQUEST arrives from the correct origin', async () => {
      mockOpener();
      const promise = initSigningPage(mockPrivy());
      await flushPrivyIframeLoad();
      dispatchSignRequest();

      const session = await promise;
      expect(session.payload).toEqual(TEST_PAYLOAD);
      expect(session.sign).toEqual(expect.any(Function));
    });

    it('ignores messages from an unexpected origin', async () => {
      mockOpener();
      vi.useFakeTimers();
      const promise = initSigningPage(mockPrivy(), { timeout: 1000 });

      await flushPrivyIframeLoad();
      dispatchSignRequest(TEST_PAYLOAD, 'https://evil.com');
      vi.runAllTimers();

      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('ignores messages with an unrecognized type', async () => {
      mockOpener();
      vi.useFakeTimers();
      const promise = initSigningPage(mockPrivy(), { timeout: 1000 });

      await flushPrivyIframeLoad();
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: OPENER_ORIGIN,
          data: { type: 'UNKNOWN', payload: TEST_PAYLOAD },
        }),
      );
      vi.runAllTimers();

      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('rejects with TimeoutError when SIGN_REQUEST does not arrive in time', async () => {
      mockOpener();
      vi.useFakeTimers();
      const promise = initSigningPage(mockPrivy(), { timeout: 1000 });

      await flushPrivyIframeLoad();
      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });
  });
});
