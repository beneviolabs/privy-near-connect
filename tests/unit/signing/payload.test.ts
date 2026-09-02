import { PublicKey } from '@near-js/crypto';
import {
  actionCreators,
  GlobalContractDeployMode,
  GlobalContractIdentifier,
} from '@near-js/transactions';
import { describe, expect, it } from 'vitest';

import { InvalidSigningPayloadError } from '@/sign-page.errors';
import { canonicalizeSigningPayload } from '@/signing/payload';
import type { SigningPayload } from '@/types';

const PUBLIC_KEY = PublicKey.fromString('ed25519:11111111111111111111111111111111');

describe('canonicalizeSigningPayload()', () => {
  it('accepts every supported structured-cloned native @near-js action shape', () => {
    const nativeActions = [
      actionCreators.createAccount(),
      actionCreators.deployContract(new Uint8Array([1, 2, 3])),
      actionCreators.functionCall('method', { enabled: true }, 10n, 2n),
      actionCreators.transfer(3n),
      actionCreators.stake(4n, PUBLIC_KEY),
      actionCreators.addKey(PUBLIC_KEY, actionCreators.fullAccessKey()),
      actionCreators.addKey(
        PUBLIC_KEY,
        actionCreators.functionCallAccessKey('contract.near', ['method'], 5n),
      ),
      actionCreators.deleteKey(PUBLIC_KEY),
      actionCreators.deleteAccount('beneficiary.near'),
      actionCreators.deployGlobalContract(
        new Uint8Array([4, 5, 6]),
        new GlobalContractDeployMode({ CodeHash: null }),
      ),
      actionCreators.useGlobalContract(new GlobalContractIdentifier({ AccountId: 'global.near' })),
    ];

    const payload = canonicalizeSigningPayload(
      structuredClone({
        kind: 'signAndSendTransaction',
        receiverId: 'receiver.near',
        actions: nativeActions,
      }),
    );

    if (payload.kind !== 'signAndSendTransaction') throw new Error('wrong payload kind');
    expect(payload.actions.map((action) => ('type' in action ? action.type : null))).toEqual([
      'CreateAccount',
      'DeployContract',
      'FunctionCall',
      'Transfer',
      'Stake',
      'AddKey',
      'AddKey',
      'DeleteKey',
      'DeleteAccount',
      'DeployGlobalContract',
      'UseGlobalContract',
    ]);
    expect(payload.actions[5]).toMatchObject({
      type: 'AddKey',
      params: { accessKey: { permission: 'FullAccess' } },
    });
    expect(payload.actions[6]).toMatchObject({
      type: 'AddKey',
      params: {
        accessKey: {
          permission: {
            receiverId: 'contract.near',
            methodNames: ['method'],
            allowance: '5',
          },
        },
      },
    });
  });

  it('accepts canonical connector actions in transaction, batch, and delegate payloads', () => {
    const actions: Extract<SigningPayload, { kind: 'signAndSendTransaction' }>['actions'] = [
      { type: 'CreateAccount' },
      { type: 'DeployContract', params: { code: new Uint8Array([1]) } },
      {
        type: 'FunctionCall',
        params: { methodName: 'method', args: {}, gas: '10', deposit: '0' },
      },
      { type: 'Transfer', params: { deposit: '1' } },
      { type: 'Stake', params: { stake: '2', publicKey: PUBLIC_KEY.toString() } },
      {
        type: 'AddKey',
        params: {
          publicKey: PUBLIC_KEY.toString(),
          accessKey: {
            permission: { receiverId: 'contract.near', methodNames: [], allowance: '3' },
          },
        },
      },
      { type: 'DeleteKey', params: { publicKey: PUBLIC_KEY.toString() } },
      { type: 'DeleteAccount', params: { beneficiaryId: 'beneficiary.near' } },
      {
        type: 'DeployGlobalContract',
        params: { code: new Uint8Array([2]), deployMode: 'AccountId' },
      },
      {
        type: 'UseGlobalContract',
        params: { contractIdentifier: { codeHash: '11111111111111111111111111111111' } },
      },
    ];

    const transaction = canonicalizeSigningPayload({
      kind: 'signAndSendTransaction',
      receiverId: 'receiver.near',
      actions,
    });
    const batch = canonicalizeSigningPayload({
      kind: 'signAndSendTransactions',
      transactions: [{ receiverId: 'receiver.near', actions }],
    });
    const delegate = canonicalizeSigningPayload({
      kind: 'signDelegateActions',
      delegateActions: [{ receiverId: 'receiver.near', actions }],
    });

    expect(transaction).toMatchObject({
      kind: 'signAndSendTransaction',
      receiverId: 'receiver.near',
    });
    expect(batch).toMatchObject({ kind: 'signAndSendTransactions' });
    expect(delegate).toMatchObject({ kind: 'signDelegateActions' });
  });

  it.each([
    null,
    {},
    { kind: 'unsupported' },
    { kind: 'signAndSendTransactions', transactions: null },
    { kind: 'signDelegateActions', delegateActions: [{}] },
    {
      kind: 'signAndSendTransaction',
      receiverId: 'receiver.near',
      actions: [{ type: 'Unknown' }],
    },
    {
      kind: 'signAndSendTransaction',
      receiverId: 'receiver.near',
      actions: [{ enum: 'signedDelegate', signedDelegate: {} }],
    },
    {
      kind: 'signAndSendTransaction',
      receiverId: 'receiver.near',
      actions: [
        {
          type: 'AddKey',
          params: {
            publicKey: 'not-a-key',
            accessKey: { permission: 'FullAccess' },
          },
        },
      ],
    },
  ])('rejects malformed or unsupported signable input %#', (payload) => {
    expect(() => canonicalizeSigningPayload(payload)).toThrow(InvalidSigningPayloadError);
  });
});
