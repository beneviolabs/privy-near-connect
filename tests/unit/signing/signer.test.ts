// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Privy from '@privy-io/js-sdk-core';
import type { SignAndSendTransactionParams, SignMessageParams, SignedMessage } from '@hot-labs/near-connect';
import type { FinalExecutionOutcome } from '@near-js/types';

import {
  NoNearWalletError,
  UnsupportedSigningPayloadError,
  WindowOpenerClosedError,
} from '@/signing/errors';
import { signMessage } from '@/signing/message';
import { signAndSendTransaction } from '@/signing/transactions';
import { buildSignFn, type PrivyNearWallet } from '@/signing/signer';

vi.mock('@/signing/message', () => ({
  signMessage: vi.fn(),
}));

vi.mock('@/signing/transactions', () => ({
  signAndSendTransaction: vi.fn(),
}));

const OPENER_ORIGIN = 'https://app.example.com';
const TEST_TARGET = OPENER_ORIGIN;

const TEST_PAYLOAD: SignMessageParams = {
  message: 'hello',
  recipient: 'bob.near',
  nonce: new Uint8Array(32),
};

const TEST_WALLET = {
  type: 'wallet',
  chain_type: 'near',
  id: 'wallet-id',
  address: '718c0ad670786cc74ed01f50c063361531b42417f78d04f691b9c8e21923c5d8',
} as PrivyNearWallet;

const TEST_RESULT: SignedMessage = {
  accountId: TEST_WALLET.address,
  publicKey: 'ed25519:test-public-key',
  signature: 'dGVzdC1zaWduYXR1cmU=',
};

const TEST_TX_PAYLOAD: SignAndSendTransactionParams = {
  receiverId: 'bob.near',
  actions: [],
};

const TEST_TX_RESULT = {
  status: { SuccessValue: '' },
  transaction: {},
  transaction_outcome: {},
  receipts_outcome: [],
} as unknown as FinalExecutionOutcome;

function mockOpener() {
  const opener = { postMessage: vi.fn(), origin: OPENER_ORIGIN };
  vi.stubGlobal('opener', opener);
  return opener;
}

function mockPrivy(): Privy {
  return {
    user: {
      get: vi.fn().mockResolvedValue({ user: { linked_accounts: [TEST_WALLET] } }),
    },
    embeddedWallet: {
      getURL: vi.fn(),
      onMessage: vi.fn(),
      signWithUserSigner: vi.fn(),
    },
    setMessagePoster: vi.fn(),
  } as unknown as Privy;
}

describe('buildSignFn()', () => {
  beforeEach(() => {
    mockOpener();
    vi.stubGlobal('close', vi.fn());
    vi.mocked(signMessage).mockResolvedValue(TEST_RESULT);
    vi.mocked(signAndSendTransaction).mockResolvedValue(TEST_TX_RESULT);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('posts RESULT and closes the window after signing', async () => {
    const opener = mockOpener();
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    await sign();

    expect(signMessage).toHaveBeenCalledWith(
      TEST_PAYLOAD,
      TEST_WALLET.address,
      expect.any(Object),
      TEST_WALLET.id,
    );
    expect(opener.postMessage).toHaveBeenCalledWith(
      { type: 'RESULT', result: TEST_RESULT },
      TEST_TARGET,
    );
    expect(window.close).toHaveBeenCalled();
  });

  it('can be called more than once and signs each time', async () => {
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    await sign();
    await sign();

    expect(signMessage).toHaveBeenCalledTimes(2);
  });

  it('throws WindowOpenerClosedError when window.opener is gone at sign time', async () => {
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    vi.stubGlobal('opener', null);
    await expect(sign()).rejects.toBeInstanceOf(WindowOpenerClosedError);
  });

  it('throws UnsupportedSigningPayloadError for unsupported payloads', async () => {
    const unsupportedPayload = { foo: 'bar' };
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), unsupportedPayload as never, TEST_WALLET);

    await expect(sign()).rejects.toBeInstanceOf(UnsupportedSigningPayloadError);
  });

  it('routes a transaction payload to signAndSendTransaction and posts RESULT', async () => {
    const opener = mockOpener();
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_TX_PAYLOAD, TEST_WALLET);

    await sign();

    expect(signAndSendTransaction).toHaveBeenCalledWith(
      TEST_TX_PAYLOAD,
      TEST_WALLET.address,
      expect.any(Object),
      TEST_WALLET.id,
    );
    expect(opener.postMessage).toHaveBeenCalledWith(
      { type: 'RESULT', result: TEST_TX_RESULT },
      TEST_TARGET,
    );
    expect(window.close).toHaveBeenCalled();
  });

  it('fetches the user wallet only when one is not provided', async () => {
    const privy = mockPrivy();
    const sign = buildSignFn(TEST_TARGET, privy, TEST_PAYLOAD);

    await sign();

    expect(privy.user.get).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(
      TEST_PAYLOAD,
      TEST_WALLET.address,
      privy,
      TEST_WALLET.id,
    );
  });

  it('throws NoNearWalletError when no linked NEAR wallet exists', async () => {
    const privy = {
      ...mockPrivy(),
      user: {
        get: vi.fn().mockResolvedValue({ user: { linked_accounts: [] } }),
      },
    } as unknown as Privy;
    const sign = buildSignFn(TEST_TARGET, privy, TEST_PAYLOAD);

    await expect(sign()).rejects.toBeInstanceOf(NoNearWalletError);
  });

  it('propagates signMessage failures without posting RESULT or closing the window', async () => {
    const opener = mockOpener();
    vi.mocked(signMessage).mockRejectedValue(new Error('signMessage failed'));
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    await expect(sign()).rejects.toThrow('signMessage failed');
    expect(opener.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RESULT' }),
      TEST_TARGET,
    );
    expect(window.close).not.toHaveBeenCalled();
  });
});
