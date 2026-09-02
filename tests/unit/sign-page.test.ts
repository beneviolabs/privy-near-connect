// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Privy from '@privy-io/js-sdk-core';
import { PublicKey } from '@near-js/crypto';
import { actionCreators } from '@near-js/transactions';
import type { SignPageOptions, SigningPayload } from '@/types';
import { channelMsg } from '@/types';

import {
  InvalidSigningPayloadError,
  MissingAllowedOriginsError,
  NoOpenerError,
  TimeoutError,
  WildcardOriginError,
} from '@/sign-page.errors';
import { initSigningPage } from '@/sign-page';
import { buildSignFn } from '@/signing/signer';
import { buildTransactionView } from '@/sign-page-plugin/screens/TransactionSections';
import { summarizeAction } from '@/sign-page-plugin/utils/actions';

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

const DEFAULT_OPTIONS: SignPageOptions = {
  allowedOrigins: [OPENER_ORIGIN],
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
    new MessageEvent('message', {
      origin,
      data: channelMsg.signRequest(payload),
    }),
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
      await expect(initSigningPage(mockPrivy(), DEFAULT_OPTIONS)).rejects.toBeInstanceOf(
        NoOpenerError,
      );
    });
  });

  describe('allowedOrigins guard', () => {
    it('throws MissingAllowedOriginsError when allowedOrigins is omitted', async () => {
      mockOpener();
      await expect(initSigningPage(mockPrivy(), {} as SignPageOptions)).rejects.toBeInstanceOf(
        MissingAllowedOriginsError,
      );
    });

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
      const promise = initSigningPage(mockPrivy(), DEFAULT_OPTIONS);

      await flushPrivyIframeLoad();
      expect(opener.postMessage).toHaveBeenCalledWith(channelMsg.ready(), '*');

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
      expect(opener.postMessage).toHaveBeenCalledWith(channelMsg.ready(), '*');

      vi.runAllTimers();
      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    });

    it('reuses the existing iframe instead of mounting a new one', async () => {
      const firstPrivy = mockPrivy();
      const secondPrivy = mockPrivy();

      mockOpener();
      const firstPromise = initSigningPage(firstPrivy, { ...DEFAULT_OPTIONS, timeout: 1000 });
      await flushPrivyIframeLoad();
      const firstIframe = document.querySelector('iframe[data-privy-embed]') as HTMLIFrameElement;

      const secondPromise = initSigningPage(secondPrivy, { ...DEFAULT_OPTIONS, timeout: 1000 });
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

  describe('mount abort', () => {
    it('aborts while the iframe is still mounting, tearing it down and never posting READY', async () => {
      const opener = mockOpener();
      const controller = new AbortController();
      const promise = initSigningPage(mockPrivy(), {
        ...DEFAULT_OPTIONS,
        signal: controller.signal,
      });

      // The iframe is in the DOM but has not fired `load`, so the mount is still pending.
      await Promise.resolve();
      expect(document.querySelector('iframe[data-privy-embed]')).not.toBeNull();

      const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await rejection;

      // READY is never posted, so the opener never fires a SIGN_REQUEST into a dead listener.
      expect(opener.postMessage).not.toHaveBeenCalled();
      // The not-yet-loaded iframe is removed rather than orphaned.
      expect(document.querySelector('iframe[data-privy-embed]')).toBeNull();
    });

    it('mounts a fresh iframe after a mid-mount abort instead of reusing the orphan', async () => {
      mockOpener();
      const controller = new AbortController();
      const aborted = initSigningPage(mockPrivy(), {
        ...DEFAULT_OPTIONS,
        signal: controller.signal,
      });

      await Promise.resolve();
      const firstIframe = document.querySelector('iframe[data-privy-embed]');
      expect(firstIframe).not.toBeNull();

      const rejection = expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await rejection;

      // The next handshake mounts a brand-new iframe and completes normally.
      const promise = initSigningPage(mockPrivy(), DEFAULT_OPTIONS);
      await flushPrivyIframeLoad();
      expect(document.querySelector('iframe[data-privy-embed]')).not.toBe(firstIframe);

      dispatchSignRequest();
      await expect(promise).resolves.toMatchObject({ payload: TEST_PAYLOAD });
    });
  });

  describe('SIGN_REQUEST handling', () => {
    it('resolves with the payload when SIGN_REQUEST arrives', async () => {
      mockOpener();
      const promise = initSigningPage(mockPrivy(), DEFAULT_OPTIONS);
      await flushPrivyIframeLoad();
      dispatchSignRequest();

      const session = await promise;
      expect(session.payload).toEqual(TEST_PAYLOAD);
      expect(session.sign).toEqual(expect.any(Function));
    });

    it('canonicalizes structured-cloned native function-call, transfer, and full-access AddKey actions once for display and signing', async () => {
      const publicKey = PublicKey.fromString('ed25519:11111111111111111111111111111111');
      const nativePayload = structuredClone({
        kind: 'signAndSendTransaction',
        receiverId: 'trading.near',
        actions: [
          actionCreators.functionCall(
            'add_full_access_key_and_register_with_intents',
            { public_key: publicKey.toString() },
            20_000_000_000_000n,
            1n,
          ),
          actionCreators.transfer(2_000_000_000_000_000_000_000_000n),
          actionCreators.addKey(publicKey, actionCreators.fullAccessKey()),
        ],
      }) as SigningPayload;
      mockOpener();
      const promise = initSigningPage(mockPrivy(), DEFAULT_OPTIONS);
      await flushPrivyIframeLoad();
      dispatchSignRequest(nativePayload);

      const session = await promise;
      expect(session.payload).not.toBe(nativePayload);
      expect(
        vi.mocked(buildSignFn).mock.calls[vi.mocked(buildSignFn).mock.calls.length - 1]?.[2],
      ).toBe(session.payload);
      expect(session.payload).toMatchObject({
        kind: 'signAndSendTransaction',
        actions: [
          {
            type: 'FunctionCall',
            params: {
              methodName: 'add_full_access_key_and_register_with_intents',
              gas: '20000000000000',
              deposit: '1',
            },
          },
          { type: 'Transfer', params: { deposit: '2000000000000000000000000' } },
          {
            type: 'AddKey',
            params: {
              publicKey: publicKey.toString(),
              accessKey: { nonce: 0, permission: 'FullAccess' },
            },
          },
        ],
      });

      if (session.payload.kind !== 'signAndSendTransaction') throw new Error('wrong payload kind');
      const request = buildTransactionView(session.payload, 'owner.near');
      const functionCall = summarizeAction(request.transactions[0]!.actions[0]!);
      const transfer = summarizeAction(request.transactions[0]!.actions[1]!);
      expect(functionCall).toMatchObject({
        type: 'FunctionCall',
        method: 'add_full_access_key_and_register_with_intents',
        deposit: '<0.000001',
        gas: '20 TGas',
      });
      expect(functionCall.paramsJson).toContain(publicKey.toString());
      expect(transfer).toMatchObject({ type: 'Transfer', amount: '2' });
      expect(request.fullAccessKeys).toEqual([publicKey.toString()]);
      expect(request.peerfolioSignerFullAccess).toBe(true);
    });

    it('canonicalizes the structured-cloned export-like batch sent through the popup', async () => {
      const publicKey = PublicKey.fromString('ed25519:11111111111111111111111111111111');
      const exportPayload = structuredClone({
        kind: 'signAndSendTransactions',
        transactions: [
          {
            receiverId: 'trading.near',
            actions: [
              actionCreators.functionCall(
                'add_full_access_key_and_register_with_intents',
                { public_key: publicKey.toString() },
                20_000_000_000_000n,
                1n,
              ),
            ],
          },
          {
            receiverId: 'owner.near',
            actions: [actionCreators.addKey(publicKey, actionCreators.fullAccessKey())],
          },
          {
            receiverId: 'intents.near',
            actions: [
              actionCreators.functionCall(
                'add_public_key',
                { public_key: publicKey.toString() },
                20_000_000_000_000n,
                1n,
              ),
            ],
          },
        ],
      }) as SigningPayload;
      mockOpener();
      const promise = initSigningPage(mockPrivy(), DEFAULT_OPTIONS);
      await flushPrivyIframeLoad();
      dispatchSignRequest(exportPayload);

      const session = await promise;
      if (session.payload.kind !== 'signAndSendTransactions') throw new Error('wrong payload kind');
      const request = buildTransactionView(session.payload, 'owner.near');
      expect(request.transactions.map((transaction) => transaction.actions[0]?.type)).toEqual([
        'FunctionCall',
        'AddKey',
        'FunctionCall',
      ]);
      expect(request.fullAccessKeys).toEqual([publicKey.toString()]);
      expect(request.peerfolioSignerFullAccess).toBe(true);
      expect(
        vi.mocked(buildSignFn).mock.calls[vi.mocked(buildSignFn).mock.calls.length - 1]?.[2],
      ).toBe(session.payload);
    });

    it('canonicalizes the structured-cloned onboarding batch sent through the popup', async () => {
      const onboardingPayload = structuredClone({
        kind: 'signAndSendTransactions',
        transactions: [
          {
            receiverId: 'wrap.near',
            actions: [
              actionCreators.functionCall(
                'storage_deposit',
                { account_id: 'trading.near', registration_only: true },
                20_000_000_000_000n,
                1_250_000_000_000_000_000_000n,
              ),
            ],
          },
          {
            receiverId: 'trading.near',
            actions: [
              actionCreators.functionCall(
                'add_full_access_key_and_register_with_intents',
                { public_key: 'ed25519:11111111111111111111111111111111' },
                20_000_000_000_000n,
                1n,
              ),
              actionCreators.functionCall(
                'add_authorized_user',
                { account_id: 'agent.near' },
                20_000_000_000_000n,
                0n,
              ),
            ],
          },
          {
            receiverId: 'deposit.near',
            actions: [actionCreators.transfer(3_000_000_000_000_000_000_000_000n)],
          },
        ],
      }) as SigningPayload;
      mockOpener();
      const promise = initSigningPage(mockPrivy(), DEFAULT_OPTIONS);
      await flushPrivyIframeLoad();
      dispatchSignRequest(onboardingPayload);

      const session = await promise;
      if (session.payload.kind !== 'signAndSendTransactions') throw new Error('wrong payload kind');
      const request = buildTransactionView(session.payload, 'owner.near');
      expect(request.transactions.flatMap((transaction) => transaction.actions)).toHaveLength(4);
      expect(request.peerfolioSignerFullAccess).toBe(true);
      expect(summarizeAction(request.transactions[2]!.actions[0]!)).toMatchObject({ amount: '3' });
    });

    it.each([
      {
        name: 'malformed connector action',
        action: { type: 'FunctionCall', params: { methodName: 'method', gas: '1', deposit: '0' } },
      },
      { name: 'unsupported native action', action: { enum: 'signedDelegate', signedDelegate: {} } },
    ])('rejects a $name before it can be displayed or signed', async ({ action }) => {
      mockOpener();
      const promise = initSigningPage(mockPrivy(), DEFAULT_OPTIONS);
      await flushPrivyIframeLoad();
      dispatchSignRequest({
        kind: 'signAndSendTransaction',
        receiverId: 'contract.near',
        actions: [action],
      } as unknown as SigningPayload);

      await expect(promise).rejects.toBeInstanceOf(InvalidSigningPayloadError);
      expect(buildSignFn).not.toHaveBeenCalled();
    });

    it('accepts SIGN_REQUEST from any origin when allowedOrigins is dangerouslyAllowAllOrigins', async () => {
      mockOpener();
      const promise = initSigningPage(mockPrivy(), {
        allowedOrigins: 'dangerouslyAllowAllOrigins',
      });
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
      const promise = initSigningPage(mockPrivy(), { ...DEFAULT_OPTIONS, timeout: 1000 });

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
      const promise = initSigningPage(mockPrivy(), { ...DEFAULT_OPTIONS, timeout: 1000 });

      await flushPrivyIframeLoad();
      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toBeInstanceOf(TimeoutError);
      expect(document.querySelector('iframe[data-privy-embed]')).not.toBeNull();
    });

    it('ignores a second SIGN_REQUEST sent after the first was accepted', async () => {
      mockOpener();
      const promise = initSigningPage(mockPrivy(), DEFAULT_OPTIONS);
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

    it('rejects and ignores later SIGN_REQUESTs once the abort signal fires', async () => {
      mockOpener();
      const controller = new AbortController();
      const promise = initSigningPage(mockPrivy(), {
        ...DEFAULT_OPTIONS,
        signal: controller.signal,
      });
      await flushPrivyIframeLoad();

      const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await rejection;

      // Listener was removed on abort: a later SIGN_REQUEST must not resolve a stale session.
      dispatchSignRequest();
      await Promise.resolve();
    });

    it('rejects immediately when the signal is already aborted', async () => {
      mockOpener();
      await expect(
        initSigningPage(mockPrivy(), { ...DEFAULT_OPTIONS, signal: AbortSignal.abort() }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('locks targetOrigin to the first SIGN_REQUEST sender — later senders cannot hijack it', async () => {
      mockOpener();
      const promise = initSigningPage(mockPrivy(), {
        allowedOrigins: 'dangerouslyAllowAllOrigins',
      });
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
