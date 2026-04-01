// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Privy from '@privy-io/js-sdk-core';
import type { SigningPayload } from '@/types';

import { NoOpenerError, TimeoutError, WildcardOriginError } from '@/sign-page.errors';
import { initSigningPage } from '@/sign-page';
import { buildSignFn } from '@/signing/signer';

vi.mock('@/signing/signer', () => ({
  buildSignFn: vi.fn().mockReturnValue(vi.fn()),
}));

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
    vi.clearAllMocks();
    document.querySelectorAll('iframe[data-privy-embed]').forEach((el) => el.remove());
  });

  describe('opener guard', () => {
    it('throws NoOpenerError when window.opener is null', async () => {
      vi.stubGlobal('opener', null);
      await expect(initSigningPage(mockPrivy())).rejects.toBeInstanceOf(NoOpenerError);
    });
  });

  describe('allowedOrigins guard', () => {
    it('throws WildcardOriginError when allowedOrigins contains *', async () => {
      mockOpener();
      await expect(initSigningPage(mockPrivy(), { allowedOrigins: ['*'] })).rejects.toBeInstanceOf(
        WildcardOriginError,
      );
    });

    it('throws WildcardOriginError when * is mixed with valid origins', async () => {
      mockOpener();
      await expect(
        initSigningPage(mockPrivy(), { allowedOrigins: ['https://app.example.com', '*'] }),
      ).rejects.toBeInstanceOf(WildcardOriginError);
    });
  });

  describe('READY handshake', () => {
    it('posts READY to opener with wildcard target', async () => {
      vi.useFakeTimers();
      const opener = mockOpener();
      const promise = initSigningPage(mockPrivy());

      await flushPrivyIframeLoad();
      expect(opener.postMessage).toHaveBeenCalledWith({ type: 'READY' }, '*');

      vi.runAllTimers();
      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('posts READY with wildcard target even when allowedOrigins is provided', async () => {
      vi.useFakeTimers();
      const opener = mockOpener();
      const promise = initSigningPage(mockPrivy(), {
        allowedOrigins: ['https://custom.example.com'],
      });

      await flushPrivyIframeLoad();
      expect(opener.postMessage).toHaveBeenCalledWith({ type: 'READY' }, '*');

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

    it('accepts SIGN_REQUEST from any origin when allowedOrigins is not configured', async () => {
      mockOpener();
      const promise = initSigningPage(mockPrivy());
      await flushPrivyIframeLoad();
      dispatchSignRequest(TEST_PAYLOAD, 'https://any-origin.example.com');

      const session = await promise;
      expect(session.payload).toEqual(TEST_PAYLOAD);
    });

    it('ignores messages from origins not in allowedOrigins', async () => {
      mockOpener();
      vi.useFakeTimers();
      const promise = initSigningPage(mockPrivy(), {
        allowedOrigins: [OPENER_ORIGIN],
        timeout: 1000,
      });

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

    it('ignores a second SIGN_REQUEST sent after the first was accepted', async () => {
      mockOpener();
      const promise = initSigningPage(mockPrivy());
      await flushPrivyIframeLoad();

      const secondPayload: SigningPayload = {
        kind: 'signMessage',
        message: 'evil',
        recipient: 'attacker.near',
        nonce: new Uint8Array(32),
      };

      dispatchSignRequest(TEST_PAYLOAD);
      dispatchSignRequest(secondPayload); // listener already removed — ignored

      const session = await promise;
      expect(session.payload).toEqual(TEST_PAYLOAD);
    });

    it('locks targetOrigin to the first SIGN_REQUEST sender — later senders cannot hijack it', async () => {
      mockOpener();
      const promise = initSigningPage(mockPrivy());
      await flushPrivyIframeLoad();

      dispatchSignRequest(TEST_PAYLOAD, OPENER_ORIGIN);
      dispatchSignRequest(TEST_PAYLOAD, 'https://evil.com'); // ignored

      await promise;

      expect(vi.mocked(buildSignFn)).toHaveBeenCalledWith(
        OPENER_ORIGIN,
        expect.anything(),
        TEST_PAYLOAD,
        undefined,
        undefined,
      );
    });
  });
});
