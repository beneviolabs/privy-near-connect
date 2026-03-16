// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Privy from '@privy-io/js-sdk-core';
import type { SignAndSendTransactionParams } from '@hot-labs/near-connect';
import type { FinalExecutionOutcome } from '@near-js/types';

import * as transactions from '@/signing/transactions';

const TEST_PARAMS: SignAndSendTransactionParams = {
  receiverId: 'bob.near',
  actions: [],
};

const TEST_WALLET_ADDRESS = '718c0ad670786cc74ed01f50c063361531b42417f78d04f691b9c8e21923c5d8';
const TEST_WALLET_ID = 'wallet-id';
const TEST_SIGNED_TRANSACTION = new Uint8Array([1, 2, 3]);
const TEST_NETWORK: SignAndSendTransactionParams['network'] = 'testnet';
const TEST_OUTCOME = {
  status: { SuccessValue: '' },
  transaction: {},
  transaction_outcome: {},
  receipts_outcome: [],
} as unknown as FinalExecutionOutcome;

function mockPrivy(): Privy {
  return {} as unknown as Privy;
}

describe('signTransaction()', () => {
  it('throws "not yet implemented"', async () => {
    await expect(
      transactions.signTransaction(TEST_PARAMS, TEST_WALLET_ADDRESS, mockPrivy(), TEST_WALLET_ID),
    ).rejects.toThrow('signTransaction: not yet implemented');
  });

  it.todo('builds a transaction with the expected signer, receiver, nonce, and recent block hash');
  it.todo('serializes function-call actions with args, gas, and deposit intact');
  it.todo('supports multi-action transactions without reordering or dropping actions');
  it.todo('uses params.signerId and params.network when they are provided');
  it.todo('signs the serialized transaction bytes with the selected Privy wallet');
  it.todo('propagates access-key lookup failures');
  it.todo('propagates Privy signing errors');
});

describe('sendTransaction()', () => {
  it('throws "not yet implemented"', async () => {
    await expect(
      transactions.sendTransaction(TEST_SIGNED_TRANSACTION, TEST_NETWORK),
    ).rejects.toThrow('sendTransaction: not yet implemented');
  });

  it.todo('submits the signed transaction through the NEAR provider');
  it.todo('returns the FinalExecutionOutcome from the provider on success');
  it.todo('uses the requested network when one is provided');
  it.todo('propagates NEAR RPC submission errors');
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
    );
    expect(transactions.transactionOperations.sendTransaction).toHaveBeenCalledWith(
      TEST_SIGNED_TRANSACTION,
      TEST_PARAMS.network,
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
