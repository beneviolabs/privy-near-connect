// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Privy from '@privy-io/js-sdk-core';
import type { FinalExecutionOutcome } from '@near-js/types';

import type {
  SignedMessage,
  SignDelegateActionsResponse,
} from '@hot-labs/near-connect/build/types/index.js';
import {
  NoNearWalletError,
  UnsupportedSigningPayloadError,
  WindowOpenerClosedError,
} from '@/signing/errors';
import { buildSignFn, type PrivyNearWallet } from '@/signing/signer';
import { AccountWithPrivySigner } from '@/signing/account';
import { channelMsg, type SigningPayload } from '@/types';

const OPENER_ORIGIN = 'https://app.example.com';
const TEST_TARGET = OPENER_ORIGIN;

const TEST_WALLET_ADDRESS = '718c0ad670786cc74ed01f50c063361531b42417f78d04f691b9c8e21923c5d8';

const TEST_PAYLOAD: SigningPayload = {
  kind: 'signMessage',
  message: 'hello',
  recipient: 'bob.near',
  nonce: new Uint8Array(32),
};

const TEST_WALLET: PrivyNearWallet = {
  type: 'wallet',
  chain_type: 'near',
  id: 'wallet-id',
  address: TEST_WALLET_ADDRESS,
} as PrivyNearWallet;

const TEST_RESULT: SignedMessage = {
  accountId: TEST_WALLET_ADDRESS,
  publicKey: 'ed25519:11111111111111111111111111111111',
  signature: 'AQID',
};

const TEST_TX_PAYLOAD: SigningPayload = {
  kind: 'signAndSendTransaction',
  receiverId: 'bob.near',
  actions: [],
};

const TEST_DELEGATE_PAYLOAD: SigningPayload = {
  kind: 'signDelegateActions',
  network: 'mainnet',
  delegateActions: [{ receiverId: 'bob.near', actions: [] }],
};

const TEST_DELEGATE_RESULT: SignDelegateActionsResponse = {
  signedDelegateActions: ['base64action=='],
};

const TEST_TXS_PAYLOAD = {
  transactions: [
    { receiverId: 'bob.near', actions: [] },
    { receiverId: 'carol.near', actions: [] },
  ],
};

const TEST_BATCH_PAYLOAD: SigningPayload = {
  kind: 'signAndSendTransactions',
  ...TEST_TXS_PAYLOAD,
};

const TEST_TX_RESULT = {
  status: { SuccessValue: '' },
  transaction: {},
  transaction_outcome: {},
  receipts_outcome: [],
} as unknown as FinalExecutionOutcome;

const TEST_TX_RESULTS = [TEST_TX_RESULT, TEST_TX_RESULT] as FinalExecutionOutcome[];

let mockAccountInstance: {
  ncSignMessage: ReturnType<typeof vi.fn>;
  signAndSendTransaction: ReturnType<typeof vi.fn>;
  signAndSendTransactions: ReturnType<typeof vi.fn>;
  ncSignDelegateActions: ReturnType<typeof vi.fn>;
};

type MockPrivy = Privy & {
  logout: ReturnType<typeof vi.fn>;
};

vi.mock('@/signing/account', async () => {
  const actual = await vi.importActual('@/signing/account');
  // Must use `function`, not an arrow function — vitest v4 requires a constructable implementation.
  const MockAccountWithPrivySigner = vi.fn(function () {
    return mockAccountInstance;
  });
  return { ...actual, AccountWithPrivySigner: MockAccountWithPrivySigner };
});

function mockOpener() {
  const opener = { postMessage: vi.fn(), origin: OPENER_ORIGIN };
  vi.stubGlobal('opener', opener);
  return opener;
}

function mockPrivy(): MockPrivy {
  return {
    logout: vi.fn().mockResolvedValue(undefined),
    user: {
      get: vi.fn().mockResolvedValue({
        user: {
          linked_accounts: [
            {
              type: 'wallet',
              chain_type: 'near',
              id: TEST_WALLET.id,
              address: TEST_WALLET.address,
            },
          ],
        },
      }),
    },
    embeddedWallet: {
      getURL: vi.fn(),
      onMessage: vi.fn(),
      signWithUserSigner: vi.fn(),
    },
    setMessagePoster: vi.fn(),
  } as unknown as MockPrivy;
}

describe('buildSignFn()', () => {
  beforeEach(() => {
    mockAccountInstance = {
      ncSignMessage: vi.fn().mockResolvedValue(TEST_RESULT),
      signAndSendTransaction: vi.fn().mockResolvedValue(TEST_TX_RESULT),
      signAndSendTransactions: vi.fn().mockResolvedValue(TEST_TX_RESULTS),
      ncSignDelegateActions: vi.fn().mockResolvedValue(TEST_DELEGATE_RESULT),
    };
    vi.mocked(AccountWithPrivySigner).mockImplementation(function () {
      return mockAccountInstance as never;
    });
    mockOpener();
    vi.stubGlobal('close', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('posts RESULT and closes the window after signing', async () => {
    const opener = mockOpener();
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    await sign();

    expect(mockAccountInstance.ncSignMessage).toHaveBeenCalledWith(TEST_PAYLOAD);
    expect(opener.postMessage).toHaveBeenCalledWith(
      channelMsg.result(TEST_RESULT),
      TEST_TARGET,
    );
    expect(window.close).toHaveBeenCalled();
  });

  it('can be called more than once and signs each time', async () => {
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    await sign();
    await sign();

    expect(mockAccountInstance.ncSignMessage).toHaveBeenCalledTimes(2);
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

  it('routes a transaction payload to account.signAndSendTransaction and posts RESULT', async () => {
    const opener = mockOpener();
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_TX_PAYLOAD, TEST_WALLET);

    await sign();

    expect(mockAccountInstance.signAndSendTransaction).toHaveBeenCalled();
    expect(opener.postMessage).toHaveBeenCalledWith(
      channelMsg.result(TEST_TX_RESULT),
      TEST_TARGET,
    );
    expect(window.close).toHaveBeenCalled();
  });

  it('routes batch transaction payloads to sequential account signing', async () => {
    const opener = mockOpener();
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_BATCH_PAYLOAD, TEST_WALLET);

    await sign();

    expect(mockAccountInstance.signAndSendTransactions).toHaveBeenCalledTimes(1);
    expect(opener.postMessage).toHaveBeenCalledWith(
      channelMsg.result(TEST_TX_RESULTS),
      TEST_TARGET,
    );
  });

  it('routes signDelegateActions payload to account.ncSignDelegateActions and posts RESULT', async () => {
    const opener = mockOpener();
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_DELEGATE_PAYLOAD, TEST_WALLET);

    await sign();

    expect(mockAccountInstance.ncSignDelegateActions).toHaveBeenCalledWith(TEST_DELEGATE_PAYLOAD);
    expect(opener.postMessage).toHaveBeenCalledWith(
      channelMsg.result(TEST_DELEGATE_RESULT),
      TEST_TARGET,
    );
    expect(window.close).toHaveBeenCalled();
  });

  it('fetches the user wallet only when wallet is not provided', async () => {
    const privy = mockPrivy();
    const sign = buildSignFn(TEST_TARGET, privy, TEST_PAYLOAD);

    await sign();

    expect(privy.user.get).toHaveBeenCalledTimes(1);
    expect(mockAccountInstance.ncSignMessage).toHaveBeenCalledWith(TEST_PAYLOAD);
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
    mockAccountInstance.ncSignMessage.mockRejectedValue(new Error('signMessage failed'));
    const sign = buildSignFn(TEST_TARGET, mockPrivy(), TEST_PAYLOAD, TEST_WALLET);

    await expect(sign()).rejects.toThrow('signMessage failed');
    expect(opener.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RESULT' }),
      TEST_TARGET,
    );
    expect(window.close).not.toHaveBeenCalled();
  });
});
