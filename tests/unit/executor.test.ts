// @vitest-environment happy-dom
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { NearWalletBase } from '@hot-labs/near-connect/build/types/index.js';
import { channelMsg, type ChannelMsg } from '@/types';

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
function send(data: ChannelMsg) {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function sendReady() {
  send(channelMsg.ready());
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
      new URL('#privy-sign', 'http://localhost:5173').href,
    );
  });

  it('posts SIGN_REQUEST to the popup on READY', async () => {
    const promise = wallet.signMessage(PARAMS);
    sendReady();
    await Promise.resolve();

    expect(popup.postMessage).toHaveBeenCalledWith(
      channelMsg.signRequest({ kind: 'signMessage', ...PARAMS }),
    );

    send(channelMsg.error('cleanup'));
    await promise.catch(() => {});
  });

  it('resolves with the result from RESULT', async () => {
    const result = { accountId: 'bob.near', publicKey: 'ed25519:abc', signature: 'sig' };
    const promise = wallet.signMessage(PARAMS);
    sendReady();
    send(channelMsg.result(result));
    await expect(promise).resolves.toEqual(result);
  });

  it('rejects with the message from ERROR', async () => {
    const promise = wallet.signMessage(PARAMS);
    sendReady();
    send(channelMsg.error('user rejected'));
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
    vi.advanceTimersByTime(0);
    // UNKNOWN didn't trigger a SIGN_REQUEST to the popup
    expect(popup.postMessage).not.toHaveBeenCalled();

    // Clean up
    sendReady();
    await Promise.resolve();
    send(channelMsg.error('cleanup'));
    await promise.catch(() => {});
  });
});

describe('payload kind routing', () => {
  it('signAndSendTransaction sends kind: signAndSendTransaction', async () => {
    const params = { receiverId: 'contract.near', actions: [] };
    const promise = wallet.signAndSendTransaction(params);
    sendReady();
    await Promise.resolve();
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'signAndSendTransaction' }),
      }),
    );
    send(channelMsg.result({}));
    await promise;
  });

  it('signAndSendTransactions sends kind: signAndSendTransactions', async () => {
    const params = { transactions: [] };
    const promise = wallet.signAndSendTransactions(params);
    sendReady();
    await Promise.resolve();
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'signAndSendTransactions' }),
      }),
    );
    send(channelMsg.result([]));
    await promise;
  });

  it('signDelegateActions sends kind: signDelegateActions', async () => {
    const params = { delegateActions: [] };
    const promise = wallet.signDelegateActions(params);
    sendReady();
    await Promise.resolve();
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'signDelegateActions' }),
      }),
    );
    send(channelMsg.result({ signedDelegateActions: [] }));
    await promise;
  });
});
