// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Privy from '@privy-io/js-sdk-core';
import type { SigningPayload } from '@/types';

import { NoOpenerError, TimeoutError } from '@/sign-page.errors';
import { initSigningPage } from '@/sign-page';

// ---------- helpers ----------

const OPENER_ORIGIN = 'https://app.example.com';

const TEST_PAYLOAD: SigningPayload = {
  kind: 'signMessage',
  message: 'hello',
  recipient: 'bob.near',
  nonce: new Uint8Array(32),
};

function mockOpener() {
  const opener = { postMessage: vi.fn(), location: { origin: OPENER_ORIGIN } };
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

function dispatchPrivyIframeMessage(iframe: HTMLIFrameElement, data: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      source: iframe.contentWindow,
    }),
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
    it('posts READY to opener using opener.location.origin as target', async () => {
      vi.useFakeTimers();
      const opener = mockOpener();
      const promise = initSigningPage(mockPrivy());

      await flushPrivyIframeLoad();
      expect(opener.postMessage).toHaveBeenCalledWith({ type: 'READY' }, OPENER_ORIGIN);

      vi.runAllTimers();
      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('rejects when allowedOrigin is omitted and opener origin is not readable', async () => {
      vi.stubGlobal('opener', {
        postMessage: vi.fn(),
        get location() {
          throw new DOMException(
            'Blocked a frame with origin from accessing a cross-origin frame.',
          );
        },
      });

      await expect(initSigningPage(mockPrivy())).rejects.toThrow(
        'Could not resolve a target origin: window.opener.location.origin is not readable (cross-origin opener). ' +
          'Pass an explicit allowedOrigin to initSigningPage.',
      );
    });

    it('rejects explicit wildcard allowedOrigin with a distinct message', async () => {
      mockOpener();
      await expect(initSigningPage(mockPrivy(), { allowedOrigin: '*' })).rejects.toThrow(
        'A wildcard origin (*) is not allowed as a postMessage target',
      );
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

    it('reuses the existing iframe instead of mounting a new one', async () => {
      const firstPrivy = mockPrivy();
      const secondPrivy = mockPrivy();

      mockOpener();
      const firstPromise = initSigningPage(firstPrivy, { timeout: 1000 });
      await flushPrivyIframeLoad();
      const firstIframe = document.querySelector('iframe[data-privy-embed]') as HTMLIFrameElement;

      const secondPromise = initSigningPage(secondPrivy, { timeout: 1000 });
      const iframes = document.querySelectorAll('iframe[data-privy-embed]');

      expect(iframes).toHaveLength(1);
      expect(iframes[0]).toBe(firstIframe);

      dispatchPrivyIframeMessage(firstIframe, { stale: true });

      expect(firstPrivy.embeddedWallet.onMessage).toHaveBeenCalledWith({ stale: true });
      expect(secondPrivy.embeddedWallet.onMessage).not.toHaveBeenCalled();

      await Promise.resolve();
      dispatchSignRequest();

      await expect(firstPromise).resolves.toMatchObject({ payload: TEST_PAYLOAD });
      await expect(secondPromise).resolves.toMatchObject({ payload: TEST_PAYLOAD });
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
      expect(document.querySelector('iframe[data-privy-embed]')).not.toBeNull();
    });
  });
});
