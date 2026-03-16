// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Privy from '@privy-io/js-sdk-core';
import type { SignMessageParams, SignedMessage } from '@hot-labs/near-connect';

import {
  AlreadySignedError,
  UnsupportedSigningPayloadError,
  WindowOpenerClosedError,
} from '@/sign-page.errors';
import { signMessage } from '@/signing/message';
import { buildSignFn, type PrivyNearWallet } from '@/signing/signer';

vi.mock('@/signing/message', () => ({
  signMessage: vi.fn(),
}));

const OPENER_ORIGIN = 'https://app.example.com';
const TEST_TARGET = OPENER_ORIGIN;

const TEST_PAYLOAD: SignMessageParams = {
  message: 'hello',
  recipient: 'bob.near',
  nonce: new Uint8Array(32),
};

const TEST_WALLET: PrivyNearWallet = {
  type: 'wallet',
  chain_type: 'near',
  id: 'wallet-id',
  address: 'f2a01b1f803791c417cca65f7e872ccaf7a2ad42f36217c2709c1072f4c7500a',
};

const TEST_RESULT: SignedMessage = {
  accountId: TEST_WALLET.address,
  publicKey: 'ed25519:test-public-key',
  signature: 'dGVzdC1zaWduYXR1cmU=',
};

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

  it('throws AlreadySignedError when called a second time', async () => {
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    await sign();
    await expect(sign()).rejects.toBeInstanceOf(AlreadySignedError);
  });

  it('throws WindowOpenerClosedError when window.opener is gone at sign time', async () => {
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    vi.stubGlobal('opener', null);
    await expect(sign()).rejects.toBeInstanceOf(WindowOpenerClosedError);
  });

  it('throws UnsupportedSigningPayloadError for unsupported payloads', async () => {
    const unsupportedPayload = {
      signerId: 'alice.near',
      receiverId: 'bob.near',
      actions: [],
    };
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), unsupportedPayload as never, TEST_WALLET);

    await expect(sign()).rejects.toBeInstanceOf(UnsupportedSigningPayloadError);
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
});
