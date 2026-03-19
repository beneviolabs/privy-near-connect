// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rawSign } from '@privy-io/js-sdk-core';
import type Privy from '@privy-io/js-sdk-core';
import type { SignAndSendTransactionParams } from '@hot-labs/near-connect';
import type { FinalExecutionOutcome } from '@near-js/types';
import { getTransactionLastResult } from '@near-js/utils';

import * as transactions from '@/signing/transactions';

vi.mock('@privy-io/js-sdk-core', async () => {
  const actual = await vi.importActual('@privy-io/js-sdk-core');

  return {
    ...actual,
    rawSign: vi.fn(),
  };
});

const TEST_PARAMS: SignAndSendTransactionParams = {
  network: 'testnet',
  signerId: 'alice.testnet',
  receiverId: 'guest-book.testnet',
  actions: [
    {
      type: 'FunctionCall',
      params: {
        methodName: 'add_message',
        args: { text: 'Hello from transaction 1' },
        gas: '30000000000000',
        deposit: '0',
      },
    },
    {
      type: 'FunctionCall',
      params: {
        methodName: 'add_message',
        args: { text: 'Hello from transaction 2' },
        gas: '30000000000000',
        deposit: '0',
      },
    },
  ],
};

const TEST_WALLET_ADDRESS = '718c0ad670786cc74ed01f50c063361531b42417f78d04f691b9c8e21923c5d8';
const TEST_WALLET_ID = 'wallet-id';
const TEST_SIGNED_TRANSACTION = new Uint8Array([1, 2, 3]);
const TEST_NETWORK: SignAndSendTransactionParams['network'] = 'testnet';
const TEST_OUTCOME = {
  status: { SuccessValue: 'e30=' },
  transaction: {},
  transaction_outcome: {},
  receipts_outcome: [],
} as unknown as FinalExecutionOutcome;

// A 44-char base58 string representing a mock NEAR block hash (32 bytes)
const MOCK_BLOCK_HASH = 'GkdxkzUeNhg9QZSr1Y9yrjXgDzs1oiLRhBNF5M9JHbmv';

function mockPrivy(): Privy {
  return {} as unknown as Privy;
}

function mockRpcFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { method: string };

      if (body.method === 'query') {
        // view_access_key response — provides the current nonce
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              result: { nonce: 0, permission: 'FullAccess', block_hash: MOCK_BLOCK_HASH, block_height: 1 },
            }),
        });
      }

      if (body.method === 'block') {
        // block response — provides the recent block hash for the transaction
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              result: { header: { hash: MOCK_BLOCK_HASH } },
            }),
        });
      }

      return Promise.reject(new Error(`Unexpected RPC method: ${body.method}`));
    }),
  );
}

describe('signTransaction()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpcFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs a two-action transaction with Privy rawSign using a bytes payload', async () => {
    vi.mocked(rawSign).mockResolvedValue({
      data: { encoding: 'hex', signature: `0x${'11'.repeat(64)}` },
      method: 'raw_sign',
    } as never);

    await transactions.signTransaction(
      TEST_PARAMS,
      TEST_WALLET_ADDRESS,
      mockPrivy(),
      TEST_WALLET_ID,
    );

    const [, callback, input] = vi.mocked(rawSign).mock.calls[0]!;
    expect(callback).toEqual(expect.any(Function));
    expect(input).toMatchObject({
      wallet_id: TEST_WALLET_ID,
      params: {
        hash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
      },
    });
    expect(TEST_PARAMS.actions).toHaveLength(2);
  });

  it('propagates Privy signing errors', async () => {
    vi.mocked(rawSign).mockRejectedValue(new Error('rawSign failed'));

    await expect(
      transactions.signTransaction(TEST_PARAMS, TEST_WALLET_ADDRESS, mockPrivy(), TEST_WALLET_ID),
    ).rejects.toThrow('rawSign failed');
  });
});

describe('sendTransaction()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits the signed transaction through the testnet RPC and returns the final outcome', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ result: TEST_OUTCOME }),
    } as never);

    const result = await transactions.sendTransaction(TEST_SIGNED_TRANSACTION, TEST_NETWORK);

    expect(fetch).toHaveBeenCalledWith(
      'https://rpc.testnet.near.org',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: expect.stringContaining('broadcast_tx_commit'),
      }),
    );
    expect(getTransactionLastResult(result)).toEqual({});
    expect(result).toBe(TEST_OUTCOME);
  });

  it('propagates NEAR RPC submission errors', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ error: { message: 'RPC failed' } }),
    } as never);

    await expect(
      transactions.sendTransaction(TEST_SIGNED_TRANSACTION, TEST_NETWORK),
    ).rejects.toThrow('RPC failed');
  });
});

describe('signAndSendTransaction()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(transactions.transactionOperations, 'signTransaction').mockResolvedValue(
      TEST_SIGNED_TRANSACTION,
    );
    vi.spyOn(transactions.transactionOperations, 'sendTransaction').mockResolvedValue(TEST_OUTCOME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs the transaction and submits the signed bytes', async () => {
    const result = await transactions.signAndSendTransaction(
      TEST_PARAMS,
      TEST_WALLET_ADDRESS,
      mockPrivy(),
      TEST_WALLET_ID,
    );

    expect(transactions.transactionOperations.signTransaction).toHaveBeenCalledWith(
      TEST_PARAMS,
      TEST_WALLET_ADDRESS,
      expect.any(Object),
      TEST_WALLET_ID,
      undefined,
    );
    expect(transactions.transactionOperations.sendTransaction).toHaveBeenCalledWith(
      TEST_SIGNED_TRANSACTION,
      TEST_PARAMS.network,
      undefined,
    );
    expect(result).toBe(TEST_OUTCOME);
  });

  it('propagates failures', async () => {
    vi.mocked(transactions.transactionOperations.signTransaction).mockRejectedValue(
      new Error('signTransaction failed'),
    );

    await expect(
      transactions.signAndSendTransaction(
        TEST_PARAMS,
        TEST_WALLET_ADDRESS,
        mockPrivy(),
        TEST_WALLET_ID,
      ),
    ).rejects.toThrow('signTransaction failed');
    expect(transactions.transactionOperations.sendTransaction).not.toHaveBeenCalled();
  });
});
