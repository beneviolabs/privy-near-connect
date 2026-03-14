// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AlreadySignedError,
  NoOpenerError,
  WindowOpenerClosedError,
  TimeoutError,
} from '../../src/sign-page.errors.js';
import { initSigningPage } from '../../src/sign-page.js';
import type { SignMessageParams } from '../../src/types.js';

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

function dispatchSignRequest(payload = TEST_PAYLOAD, origin = OPENER_ORIGIN) {
  window.dispatchEvent(
    new MessageEvent('message', { origin, data: { type: 'SIGN_REQUEST', payload } }),
  );
}

// ---------- tests ----------

describe('initSigningPage()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('opener guard', () => {
    it('throws NoOpenerError when window.opener is null', async () => {
      vi.stubGlobal('opener', null);
      await expect(initSigningPage()).rejects.toBeInstanceOf(NoOpenerError);
    });
  });

  describe('origin guard', () => {
    it('rejects explicit wildcard allowedOrigin', async () => {
      mockOpener();
      await expect(initSigningPage({ allowedOrigin: '*' })).rejects.toThrow();
    });
  });

  describe('READY handshake', () => {
    it('posts READY to opener using opener.origin as target', async () => {
      vi.useFakeTimers();
      const opener = mockOpener();
      const promise = initSigningPage();

      expect(opener.postMessage).toHaveBeenCalledWith({ type: 'READY' }, OPENER_ORIGIN);

      vi.runAllTimers();
      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('uses allowedOrigin as postMessage target when provided', async () => {
      vi.useFakeTimers();
      const opener = mockOpener();
      const allowed = 'https://custom.example.com';
      const promise = initSigningPage({ allowedOrigin: allowed });

      expect(opener.postMessage).toHaveBeenCalledWith({ type: 'READY' }, allowed);

      vi.runAllTimers();
      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  describe('SIGN_REQUEST handling', () => {
    it('resolves with the payload when SIGN_REQUEST arrives from the correct origin', async () => {
      mockOpener();
      const promise = initSigningPage();
      dispatchSignRequest();

      const session = await promise;
      expect(session.payload).toEqual(TEST_PAYLOAD);
    });

    it('ignores messages from an unexpected origin', async () => {
      mockOpener();
      vi.useFakeTimers();
      const promise = initSigningPage({ timeout: 1000 });

      dispatchSignRequest(TEST_PAYLOAD, 'https://evil.com');
      vi.runAllTimers();

      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('ignores messages with an unrecognized type', async () => {
      mockOpener();
      vi.useFakeTimers();
      const promise = initSigningPage({ timeout: 1000 });

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
      const promise = initSigningPage({ timeout: 1000 });

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });
  });
});

describe('sign()', () => {
  beforeEach(() => mockOpener());
  afterEach(() => vi.unstubAllGlobals());

  async function getSign() {
    const promise = initSigningPage();
    dispatchSignRequest();
    const { sign } = await promise;
    return sign;
  }

  it('throws AlreadySignedError when called a second time', async () => {
    const sign = await getSign();
    await sign().catch(() => {}); // first call — will throw "not implemented", ignore
    await expect(sign()).rejects.toBeInstanceOf(AlreadySignedError);
  });

  it('throws WindowOpenerClosedError when window.opener is gone at sign time', async () => {
    const sign = await getSign();
    vi.stubGlobal('opener', null);
    await expect(sign()).rejects.toBeInstanceOf(WindowOpenerClosedError);
  });
});
