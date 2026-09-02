import { PublicKey } from '@near-js/crypto';
import {
  AccessKey,
  AccessKeyPermission,
  actionCreators,
  FunctionCallPermission,
  GlobalContractIdentifier,
} from '@near-js/transactions';
import { base58 } from '@scure/base';
import { describe, expect, it } from 'vitest';

import { canonicalizeSigningPayload } from '@/signing/payload';
import { toNearAction } from '@/signing/utils';

const PUBLIC_KEY = PublicKey.fromString('ed25519:11111111111111111111111111111111');
const CODE_HASH = Uint8Array.from({ length: 32 }, (_, index) => index);

describe('canonical action semantics', () => {
  it('preserves AddKey nonce and allowance when rebuilding a native action', () => {
    const nonce = 42n;
    const allowance = 123456789012345678901234n;
    const nativeAction = actionCreators.addKey(
      PUBLIC_KEY,
      new AccessKey({
        nonce,
        permission: new AccessKeyPermission({
          functionCall: new FunctionCallPermission({
            receiverId: 'contract.near',
            methodNames: ['method'],
            allowance,
          }),
        }),
      }),
    );

    const payload = canonicalizeSigningPayload(
      structuredClone({
        kind: 'signAndSendTransaction',
        receiverId: 'contract.near',
        actions: [nativeAction],
      }),
    );

    if (payload.kind !== 'signAndSendTransaction') throw new Error('wrong payload kind');
    const action = toNearAction(payload.actions[0]);
    const accessKey = action.addKey?.accessKey;

    expect(accessKey?.nonce).toBe(nonce);
    expect(accessKey?.permission.functionCall).toMatchObject({
      receiverId: 'contract.near',
      methodNames: ['method'],
      allowance,
    });
  });

  it('round-trips native and connector global-contract identifiers as the same bytes', () => {
    const encodedCodeHash = base58.encode(CODE_HASH);
    const nativePayload = canonicalizeSigningPayload(
      structuredClone({
        kind: 'signAndSendTransaction',
        receiverId: 'contract.near',
        actions: [
          actionCreators.useGlobalContract(new GlobalContractIdentifier({ CodeHash: CODE_HASH })),
        ],
      }),
    );
    const connectorPayload = canonicalizeSigningPayload({
      kind: 'signAndSendTransaction',
      receiverId: 'contract.near',
      actions: [
        {
          type: 'UseGlobalContract',
          params: { contractIdentifier: { codeHash: encodedCodeHash } },
        },
      ],
    });

    if (nativePayload.kind !== 'signAndSendTransaction')
      throw new Error('wrong native payload kind');
    if (connectorPayload.kind !== 'signAndSendTransaction') {
      throw new Error('wrong connector payload kind');
    }

    expect(nativePayload.actions[0]).toMatchObject({
      type: 'UseGlobalContract',
      params: { contractIdentifier: { codeHash: encodedCodeHash } },
    });
    expect(connectorPayload.actions[0]).toEqual(nativePayload.actions[0]);

    const nativeAction = toNearAction(nativePayload.actions[0]);
    const connectorAction = toNearAction(connectorPayload.actions[0]);
    expect(Array.from(nativeAction.useGlobalContract?.contractIdentifier.CodeHash ?? [])).toEqual(
      Array.from(CODE_HASH),
    );
    expect(
      Array.from(connectorAction.useGlobalContract?.contractIdentifier.CodeHash ?? []),
    ).toEqual(Array.from(CODE_HASH));
  });

  it('rejects ambiguous or inherited global-contract identifier fields', () => {
    const encodedCodeHash = base58.encode(CODE_HASH);
    const inheritedIdentifier = Object.assign(Object.create({ codeHash: encodedCodeHash }), {});

    expect(() =>
      canonicalizeSigningPayload({
        kind: 'signAndSendTransaction',
        receiverId: 'contract.near',
        actions: [
          {
            type: 'UseGlobalContract',
            params: { contractIdentifier: inheritedIdentifier },
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      canonicalizeSigningPayload({
        kind: 'signAndSendTransaction',
        receiverId: 'contract.near',
        actions: [
          {
            type: 'UseGlobalContract',
            params: {
              contractIdentifier: { accountId: 'contract.near', codeHash: encodedCodeHash },
            },
          },
        ],
      }),
    ).toThrow();
  });
});
