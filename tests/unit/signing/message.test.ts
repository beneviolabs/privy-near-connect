// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rawSign } from '@privy-io/js-sdk-core';
import type Privy from '@privy-io/js-sdk-core';
import type { SignMessageParams } from '@hot-labs/near-connect';
import { KeyPairEd25519, keyToImplicitAddress } from '@near-js/crypto';

import { SignatureVerificationError } from '@/signing/errors';
import { signMessage } from '@/signing/message';
import { publicKeyFromImplicit } from '@/signing/utils';

vi.mock('@privy-io/js-sdk-core', async () => {
  const actual = await vi.importActual('@privy-io/js-sdk-core');
  return {
    ...actual,
    rawSign: vi.fn(),
  };
});

const TEST_WALLET_ID = 'wallet-id';
const TEST_PARAMS: SignMessageParams = {
  message: 'hello',
  recipient: 'bob.near',
  nonce: new Uint8Array(32),
};
const TEST_MESSAGE_HASH = '0xade28275749cd3c9891ba4f07f972662b1dbfd124767d94cc7cd45b3ffead154';

function mockPrivy(): Privy {
  return {
    embeddedWallet: {
      signWithUserSigner: vi.fn(),
    },
  } as unknown as Privy;
}

describe('signMessage()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serializes the known NEP-413 fixture into the expected hash', async () => {
    vi.mocked(rawSign).mockResolvedValue({
      data: { signature: '0x010203' },
      method: 'raw_sign',
    } as never);

    await signMessage(
      TEST_PARAMS,
      keyToImplicitAddress(KeyPairEd25519.fromRandom().publicKey),
      mockPrivy(),
      TEST_WALLET_ID,
    );

    const [, , input] = vi.mocked(rawSign).mock.calls[0]!;
    expect(input).toMatchObject({
      wallet_id: TEST_WALLET_ID,
      params: {
        hash: TEST_MESSAGE_HASH,
      },
    });
  });

  it('maps Privy raw-sign output into SignedMessage fields', async () => {
    const walletAddress = keyToImplicitAddress(KeyPairEd25519.fromRandom().publicKey);
    vi.mocked(rawSign).mockResolvedValue({
      data: { signature: '0x010203' },
      method: 'raw_sign',
    } as never);

    const result = await signMessage(TEST_PARAMS, walletAddress, mockPrivy(), TEST_WALLET_ID);

    expect(result).toEqual({
      accountId: walletAddress,
      publicKey: publicKeyFromImplicit(walletAddress).toString(),
      signature: 'AQID',
    });
  });

  it('throws when verify=true and the returned signature is invalid', async () => {
    const walletAddress = keyToImplicitAddress(KeyPairEd25519.fromRandom().publicKey);
    vi.mocked(rawSign).mockResolvedValue({
      data: { signature: `0x${'00'.repeat(64)}` },
      method: 'raw_sign',
    } as never);

    await expect(
      signMessage(TEST_PARAMS, walletAddress, mockPrivy(), TEST_WALLET_ID, true),
    ).rejects.toBeInstanceOf(SignatureVerificationError);
  });

  it('does not throw when verify=false and the returned signature is invalid', async () => {
    const walletAddress = keyToImplicitAddress(KeyPairEd25519.fromRandom().publicKey);
    vi.mocked(rawSign).mockResolvedValue({
      data: { signature: `0x${'00'.repeat(64)}` },
      method: 'raw_sign',
    } as never);

    await expect(
      signMessage(TEST_PARAMS, walletAddress, mockPrivy(), TEST_WALLET_ID, false),
    ).resolves.not.toThrow();
  });

  it('propagates Privy rawSign errors', async () => {
    const walletAddress = keyToImplicitAddress(KeyPairEd25519.fromRandom().publicKey);
    vi.mocked(rawSign).mockRejectedValue(new Error('rawSign failed'));

    await expect(
      signMessage(TEST_PARAMS, walletAddress, mockPrivy(), TEST_WALLET_ID),
    ).rejects.toThrow('rawSign failed');
  });
});
