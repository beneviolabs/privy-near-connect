// @vitest-environment happy-dom
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { NearWalletBase } from '@hot-labs/near-connect/build/types/index.js';

// ---- popup factory -------------------------------------------------------

type FakePopup = {
  postMessage: ReturnType<typeof vi.fn>;
  readonly closed: boolean;
  close(): void;
};

function makePopup(): FakePopup {
  let closed = false;
  return {
    postMessage: vi.fn(),
    get closed() {
      return closed;
    },
    close() {
      closed = true;
    },
  };
}

// ---- helpers -------------------------------------------------------

/** Dispatch a ChannelMsg from the sign page into the main window. */
function send(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

// ---- setup -------------------------------------------------------

let wallet: NearWalletBase;
let mockWindowOpen: ReturnType<typeof vi.fn>;
let popup: FakePopup;

beforeAll(async () => {
  popup = makePopup();
  mockWindowOpen = vi.fn().mockReturnValue(popup);

  vi.stubGlobal('selector', {
    ready: (w: NearWalletBase) => {
      wallet = w;
    },
    open: mockWindowOpen,
    location: 'https://example.com/',
  });

  await import('@/executor');
});

afterEach(() => {
  // Drain any lingering message listeners from unresolved promises.
  send({ type: 'ERROR', message: 'afterEach cleanup' });
  vi.clearAllMocks();
  vi.useRealTimers();
  // Fresh popup for next test.
  popup = makePopup();
  mockWindowOpen.mockReturnValue(popup);
});

// ---- tests -------------------------------------------------------

describe('registration', () => {
  it('calls window.selector.ready with the wallet on module load', () => {
    expect(wallet).toBeDefined();
  });
});

describe('requestWallet', () => {
  const PARAMS = {
    message: 'hello',
    recipient: 'bob.near',
    nonce: new Uint8Array(32),
  };

  it('opens the sign page popup', () => {
    wallet.signMessage(PARAMS).catch(() => {});
    expect(mockWindowOpen).toHaveBeenCalledWith(
      new URL('#privy-sign', window.selector.location).href,
    );
  });

  it('posts SIGN_REQUEST to the popup on READY', async () => {
    const promise = wallet.signMessage(PARAMS);
    send({ type: 'READY' });
    await Promise.resolve();

    expect(popup.postMessage).toHaveBeenCalledWith({
      type: 'SIGN_REQUEST',
      payload: { kind: 'signMessage', ...PARAMS },
    });

    send({ type: 'ERROR', message: 'cleanup' });
    await promise.catch(() => {});
  });

  it('resolves with the result from RESULT', async () => {
    const result = { accountId: 'bob.near', publicKey: 'ed25519:abc', signature: 'sig' };
    const promise = wallet.signMessage(PARAMS);
    send({ type: 'READY' });
    send({ type: 'RESULT', result });
    await expect(promise).resolves.toEqual(result);
  });

  it('rejects with the message from ERROR', async () => {
    const promise = wallet.signMessage(PARAMS);
    send({ type: 'ERROR', message: 'user rejected' });
    await expect(promise).rejects.toThrow('user rejected');
  });

  it('rejects when popup closes before a result arrives', async () => {
    vi.useFakeTimers();
    const promise = wallet.signMessage(PARAMS);
    popup.close();
    vi.advanceTimersByTime(300);
    await expect(promise).rejects.toThrow('Privy Sign window closed');
  });

  it('ignores unrecognised message types', async () => {
    vi.useFakeTimers();
    const promise = wallet.signMessage(PARAMS);
    send({ type: 'UNKNOWN', data: 'whatever' });
    // No resolve/reject yet — promise is still pending.
    vi.advanceTimersByTime(0);
    expect(popup.postMessage).not.toHaveBeenCalled();
    // Clean up.
    send({ type: 'ERROR', message: 'cleanup' });
    await promise.catch(() => {});
  });
});

describe('payload kind routing', () => {
  it('signAndSendTransaction sends kind: signAndSendTransaction', async () => {
    const params = { receiverId: 'contract.near', actions: [] };
    const promise = wallet.signAndSendTransaction(params);
    send({ type: 'READY' });
    await Promise.resolve();
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'signAndSendTransaction' }),
      }),
    );
    send({ type: 'RESULT', result: {} });
    await promise;
  });

  it('signAndSendTransactions sends kind: signAndSendTransactions', async () => {
    const params = { transactions: [] };
    const promise = wallet.signAndSendTransactions(params);
    send({ type: 'READY' });
    await Promise.resolve();
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'signAndSendTransactions' }),
      }),
    );
    send({ type: 'RESULT', result: [] });
    await promise;
  });

  it('signDelegateActions sends kind: signDelegateActions', async () => {
    const params = { delegateActions: [] };
    const promise = wallet.signDelegateActions(params);
    send({ type: 'READY' });
    await Promise.resolve();
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'signDelegateActions' }),
      }),
    );
    send({ type: 'RESULT', result: { signedDelegateActions: [] } });
    await promise;
  });
});
