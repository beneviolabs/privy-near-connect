// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rawSign } from '@privy-io/js-sdk-core';
import type Privy from '@privy-io/js-sdk-core';
import type { SignInAndSignMessageParams, SignMessageParams } from '@hot-labs/near-connect';
import { KeyPairEd25519, keyToImplicitAddress } from '@near-js/crypto';

import { CustomAccount, PrivySigner, createProvider, type PrivyConfig } from '@/signing/account';
import type { PrivyNearWallet } from '@/signing/signer';
import { publicKeyFromImplicit } from '@/signing/utils';

vi.mock('@privy-io/js-sdk-core', async () => {
  const actual = await vi.importActual('@privy-io/js-sdk-core');
  return {
    ...actual,
    rawSign: vi.fn(),
  };
});

const TEST_WALLET_ADDRESS = '718c0ad670786cc74ed01f50c063361531b42417f78d04f691b9c8e21923c5d8';
const TEST_WALLET_ID = 'wallet-id';
const TEST_MESSAGE_PARAMS: SignMessageParams = {
  message: 'hello',
  recipient: 'bob.near',
  nonce: new Uint8Array(32),
};
const TEST_SIGN_IN_AND_SIGN_MESSAGE_PARAMS: SignInAndSignMessageParams = {
  messageParams: TEST_MESSAGE_PARAMS,
};
const TEST_MESSAGE_HASH = '0xade28275749cd3c9891ba4f07f972662b1dbfd124767d94cc7cd45b3ffead154';

function mockPrivy(): Privy {
  return {
    embeddedWallet: { signWithUserSigner: vi.fn() },
  } as unknown as Privy;
}

function makeConfig(walletAddress = TEST_WALLET_ADDRESS): PrivyConfig {
  return {
    privyClient: mockPrivy(),
    wallet: {
      type: 'wallet',
      chain_type: 'near',
      id: TEST_WALLET_ID,
      address: walletAddress,
    } as PrivyNearWallet,
  };
}

describe('PrivySigner', () => {
  describe('getPublicKey()', () => {
    it('returns an ed25519 public key derived from the wallet address', async () => {
      const signer = new PrivySigner(makeConfig());
      const key = await signer.getPublicKey();
      expect(key.toString()).toMatch(/^ed25519:/);
    });
  });

  describe('signHash()', () => {
    it('calls rawSign with the hash and returns signature bytes', async () => {
      vi.mocked(rawSign).mockResolvedValue({
        data: { encoding: 'hex', signature: `0x${'ab'.repeat(64)}` },
        method: 'raw_sign',
      } as never);

      const signer = new PrivySigner(makeConfig());
      const result = await signer.signHash(`0x${'aa'.repeat(32)}`);

      const [, , input] = vi.mocked(rawSign).mock.calls[0]!;
      expect(input).toMatchObject({
        wallet_id: TEST_WALLET_ID,
        params: { hash: `0x${'aa'.repeat(32)}` },
      });
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toHaveLength(64);
    });

    it('propagates rawSign errors', async () => {
      vi.mocked(rawSign).mockRejectedValue(new Error('rawSign failed'));
      const signer = new PrivySigner(makeConfig());
      await expect(signer.signHash(`0x${'aa'.repeat(32)}`)).rejects.toThrow('rawSign failed');
    });
  });
});

describe('ncSignMessage()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serializes the NEP-413 fixture into the expected hash', async () => {
    vi.mocked(rawSign).mockResolvedValue({
      data: { signature: '0x010203' },
      method: 'raw_sign',
    } as never);

    const walletAddress = keyToImplicitAddress(KeyPairEd25519.fromRandom().publicKey);
    const account = new CustomAccount(makeConfig(walletAddress), createProvider());
    await account.ncSignMessage(TEST_MESSAGE_PARAMS);

    const [, , input] = vi.mocked(rawSign).mock.calls[0]!;
    expect(input).toMatchObject({ wallet_id: TEST_WALLET_ID, params: { hash: TEST_MESSAGE_HASH } });
  });

  it('maps raw-sign output into SignedMessage fields', async () => {
    vi.mocked(rawSign).mockResolvedValue({
      data: { signature: '0x010203' },
      method: 'raw_sign',
    } as never);

    const walletAddress = keyToImplicitAddress(KeyPairEd25519.fromRandom().publicKey);
    const account = new CustomAccount(makeConfig(walletAddress), createProvider());
    const result = await account.ncSignMessage(TEST_MESSAGE_PARAMS);

    expect(result).toEqual({
      accountId: walletAddress,
      publicKey: publicKeyFromImplicit(walletAddress).toString(),
      signature: 'AQID',
    });
  });

  it('propagates rawSign errors', async () => {
    vi.mocked(rawSign).mockRejectedValue(new Error('rawSign failed'));
    const account = new CustomAccount(makeConfig(), createProvider());

    await expect(account.ncSignMessage(TEST_MESSAGE_PARAMS)).rejects.toThrow('rawSign failed');
  });
});

describe('ncSignIn()', () => {
  it('returns the implicit account info for the configured wallet', async () => {
    const account = new CustomAccount(makeConfig(), createProvider());
    const result = await account.ncSignIn();

    expect(result).toEqual([
      {
        accountId: TEST_WALLET_ADDRESS,
        publicKey: publicKeyFromImplicit(TEST_WALLET_ADDRESS).toString(),
      },
    ]);
  });

  it('adds a function-call access key before returning when addFunctionCallKey is provided', async () => {
    const addKey = vi
      .spyOn(CustomAccount.prototype, 'addFunctionCallAccessKey')
      .mockResolvedValue({} as never);
    const account = new CustomAccount(makeConfig(), createProvider());

    const result = await account.ncSignIn({
      addFunctionCallKey: {
        contractId: 'guest-book.near',
        publicKey: 'ed25519:11111111111111111111111111111111',
        allowMethods: { anyMethod: false, methodNames: ['add_message'] },
        gasAllowance: { kind: 'limited', amount: '250000000000000000000000' },
      },
    });

    expect(addKey).toHaveBeenCalledWith({
      contractId: 'guest-book.near',
      publicKey: 'ed25519:11111111111111111111111111111111',
      methodNames: ['add_message'],
      allowance: BigInt('250000000000000000000000'),
    });
    expect(result).toEqual([
      {
        accountId: TEST_WALLET_ADDRESS,
        publicKey: 'ed25519:11111111111111111111111111111111',
      },
    ]);

    addKey.mockRestore();
  });
});

describe('ncSignInAndSignMessage()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the signed-in account with a signed message', async () => {
    vi.mocked(rawSign).mockResolvedValue({
      data: { signature: '0x010203' },
      method: 'raw_sign',
    } as never);

    const walletAddress = keyToImplicitAddress(KeyPairEd25519.fromRandom().publicKey);
    const account = new CustomAccount(makeConfig(walletAddress), createProvider());
    const result = await account.ncSignInAndSignMessage(TEST_SIGN_IN_AND_SIGN_MESSAGE_PARAMS);

    expect(result).toEqual([
      {
        accountId: walletAddress,
        publicKey: publicKeyFromImplicit(walletAddress).toString(),
        signedMessage: {
          accountId: walletAddress,
          publicKey: publicKeyFromImplicit(walletAddress).toString(),
          signature: 'AQID',
        },
      },
    ]);
  });
});

describe('signOut()', () => {
  it('resolves with void (no-op)', async () => {
    const account = new CustomAccount(makeConfig(), createProvider());
    await expect(account.signOut()).resolves.toBeUndefined();
  });
});
