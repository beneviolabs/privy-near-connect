// @vitest-environment happy-dom
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { Account, NearWalletBase } from '@hot-labs/near-connect/build/types/index.js';

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
let mockStorageGet: ReturnType<typeof vi.fn>;
let mockStorageSet: ReturnType<typeof vi.fn>;
let mockStorageRemove: ReturnType<typeof vi.fn>;

const TEST_ACCOUNT_ID = '718c0ad670786cc74ed01f50c063361531b42417f78d04f691b9c8e21923c5d8';
const TEST_ACCOUNT: Account = {
  accountId: TEST_ACCOUNT_ID,
};
const TEST_SIGNED_ACCOUNT = {
  accountId: TEST_ACCOUNT_ID,
  signedMessage: {
    accountId: TEST_ACCOUNT_ID,
    publicKey: 'ed25519:abc',
    signature: 'sig',
  },
};

beforeAll(async () => {
  popup = makePopup();
  mockWindowOpen = vi.fn().mockReturnValue(popup);
  mockStorageGet = vi.fn();
  mockStorageSet = vi.fn().mockResolvedValue(undefined);
  mockStorageRemove = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal('selector', {
    ready: (w: NearWalletBase) => {
      wallet = w;
    },
    open: mockWindowOpen,
    location: 'https://example.com/',
    storage: {
      get: mockStorageGet,
      set: mockStorageSet,
      remove: mockStorageRemove,
      keys: vi.fn(),
    },
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
      new URL('#privy-sign', 'http://localhost:5173').href,
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
  it('signIn sends kind: signIn and stores the first account ID', async () => {
    const promise = wallet.signIn();
    send({ type: 'READY' });
    send({ type: 'RESULT', result: [TEST_ACCOUNT] });
    await Promise.resolve();
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'signIn' }),
      }),
    );
    await expect(promise).resolves.toEqual([TEST_ACCOUNT]);
    expect(mockStorageSet).toHaveBeenCalledWith('privy-near-connect:account-id', TEST_ACCOUNT_ID);
  });

  it('signInAndSignMessage sends kind: signInAndSignMessage and stores the first account ID', async () => {
    const params = {
      messageParams: {
        message: 'hello',
        recipient: 'bob.near',
        nonce: new Uint8Array(32),
      },
    };
    const promise = wallet.signInAndSignMessage(params);
    send({ type: 'READY' });
    send({ type: 'RESULT', result: [TEST_SIGNED_ACCOUNT] });
    await Promise.resolve();
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ kind: 'signInAndSignMessage', ...params }),
      }),
    );
    await expect(promise).resolves.toEqual([TEST_SIGNED_ACCOUNT]);
    expect(mockStorageSet).toHaveBeenCalledWith('privy-near-connect:account-id', TEST_ACCOUNT_ID);
  });

  it('getAccounts returns the stored account', async () => {
    mockStorageGet.mockResolvedValue(TEST_ACCOUNT_ID);

    await expect(wallet.getAccounts({ network: 'testnet' })).resolves.toEqual([TEST_ACCOUNT]);
    expect(mockStorageGet).toHaveBeenCalledWith('privy-near-connect:account-id');
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  it('getAccounts returns an empty array when no account is stored', async () => {
    mockStorageGet.mockResolvedValue('');

    await expect(wallet.getAccounts()).resolves.toEqual([]);
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

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
