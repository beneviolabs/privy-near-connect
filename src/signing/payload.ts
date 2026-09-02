import type { ConnectorAction } from '@hot-labs/near-connect/build/actions/types.js';
import { PublicKey } from '@near-js/crypto';
import { base58 } from '@scure/base';

import { InvalidSigningPayloadError } from '@/sign-page.errors';
import type { SigningPayload } from '@/types';

const NATIVE_ACTION_TYPES = {
  createAccount: 'CreateAccount',
  deployContract: 'DeployContract',
  functionCall: 'FunctionCall',
  transfer: 'Transfer',
  stake: 'Stake',
  addKey: 'AddKey',
  deleteKey: 'DeleteKey',
  deleteAccount: 'DeleteAccount',
  deployGlobalContract: 'DeployGlobalContract',
  useGlobalContract: 'UseGlobalContract',
} as const;

type UnknownRecord = Record<string, unknown>;

type CanonicalTransactionGroup = {
  receiverId: string;
  actions: ConnectorAction[];
};

/**
 * Validates action-bearing signing requests and converts every native NEAR
 * action to the connector representation used by both approval UI and signing.
 *
 * The popup message boundary cannot rely on class identity: `postMessage` uses
 * structured cloning, which strips prototypes from native `@near-js` actions.
 * Shape validation therefore happens before the request is shown or signed.
 *
 * @param value - Untrusted payload received from the opener window.
 * @returns A supported signing payload with canonical connector actions.
 * @throws {@link InvalidSigningPayloadError} When the payload or one of its actions is malformed or unsupported.
 */
export function canonicalizeSigningPayload(value: unknown): SigningPayload {
  const payload = record(value, 'request');
  const kind = string(payload.kind, 'request.kind');

  switch (kind) {
    case 'signAndSendTransaction': {
      const group = canonicalizeTransactionGroup(payload, 'request');
      return { ...payload, kind, ...group } as SigningPayload;
    }
    case 'signAndSendTransactions':
      return {
        ...payload,
        kind,
        transactions: canonicalizeTransactionGroups(payload.transactions, 'request.transactions'),
      } as SigningPayload;
    case 'signDelegateActions':
      return {
        ...payload,
        kind,
        delegateActions: canonicalizeTransactionGroups(
          payload.delegateActions,
          'request.delegateActions',
        ),
      } as SigningPayload;
    case 'signIn':
    case 'signInAndSignMessage':
    case 'signMessage':
      return { ...payload, kind } as SigningPayload;
    default:
      throw invalid(`unsupported request kind "${kind}"`);
  }
}

function canonicalizeTransactionGroups(value: unknown, path: string): CanonicalTransactionGroup[] {
  if (!Array.isArray(value)) throw invalid(`${path} must be an array`);
  return value.map((group, index) => canonicalizeTransactionGroup(group, `${path}[${index}]`));
}

function canonicalizeTransactionGroup(value: unknown, path: string): CanonicalTransactionGroup {
  const group = record(value, path);
  if (!Array.isArray(group.actions)) throw invalid(`${path}.actions must be an array`);

  return {
    ...group,
    receiverId: string(group.receiverId, `${path}.receiverId`),
    actions: group.actions.map((action, index) =>
      canonicalizeAction(action, `${path}.actions[${index}]`),
    ),
  };
}

function canonicalizeAction(value: unknown, path: string): ConnectorAction {
  const action = record(value, path);

  if ('type' in action) return canonicalizeConnectorAction(action, path);

  const nativeType = string(action.enum, `${path}.enum`);
  if (!Object.prototype.hasOwnProperty.call(NATIVE_ACTION_TYPES, nativeType)) {
    throw invalid(`${path} uses unsupported native action "${nativeType}"`);
  }

  const params = record(action[nativeType], `${path}.${nativeType}`);
  return canonicalizeKnownAction(
    NATIVE_ACTION_TYPES[nativeType as keyof typeof NATIVE_ACTION_TYPES],
    params,
    path,
    true,
  );
}

function canonicalizeConnectorAction(action: UnknownRecord, path: string): ConnectorAction {
  const type = string(action.type, `${path}.type`);
  const params = type === 'CreateAccount' ? {} : record(action.params, `${path}.params`);
  return canonicalizeKnownAction(type, params, path, false);
}

function canonicalizeKnownAction(
  type: string,
  params: UnknownRecord,
  path: string,
  native: boolean,
): ConnectorAction {
  switch (type) {
    case 'CreateAccount':
      return { type };
    case 'DeployContract':
      return { type, params: { code: bytes(params.code, `${path}.code`) } };
    case 'FunctionCall':
      return {
        type,
        params: {
          methodName: string(params.methodName, `${path}.methodName`),
          args: object(params.args, `${path}.args`),
          gas: unsignedInteger(params.gas, `${path}.gas`),
          deposit: unsignedInteger(params.deposit, `${path}.deposit`),
        },
      };
    case 'Transfer':
      return {
        type,
        params: { deposit: unsignedInteger(params.deposit, `${path}.deposit`) },
      };
    case 'Stake':
      return {
        type,
        params: {
          stake: unsignedInteger(params.stake, `${path}.stake`),
          publicKey: publicKey(params.publicKey, `${path}.publicKey`),
        },
      };
    case 'AddKey':
      return canonicalizeAddKey(params, path, native);
    case 'DeleteKey':
      return {
        type,
        params: { publicKey: publicKey(params.publicKey, `${path}.publicKey`) },
      };
    case 'DeleteAccount':
      return {
        type,
        params: { beneficiaryId: string(params.beneficiaryId, `${path}.beneficiaryId`) },
      };
    case 'UseGlobalContract':
      return canonicalizeUseGlobalContract(params, path, native);
    case 'DeployGlobalContract':
      return canonicalizeDeployGlobalContract(params, path, native);
    default:
      throw invalid(`${path} uses unsupported connector action "${type}"`);
  }
}

function canonicalizeAddKey(
  params: UnknownRecord,
  path: string,
  native: boolean,
): Extract<ConnectorAction, { type: 'AddKey' }> {
  const accessKey = record(params.accessKey, `${path}.accessKey`);
  const permission = native
    ? canonicalizeNativePermission(accessKey.permission, `${path}.accessKey.permission`)
    : canonicalizeConnectorPermission(accessKey.permission, `${path}.accessKey.permission`);
  const nonce =
    accessKey.nonce === undefined
      ? undefined
      : safeNumber(accessKey.nonce, `${path}.accessKey.nonce`);

  return {
    type: 'AddKey',
    params: {
      publicKey: publicKey(params.publicKey, `${path}.publicKey`),
      accessKey: { ...(nonce === undefined ? {} : { nonce }), permission },
    },
  };
}

function canonicalizeNativePermission(
  value: unknown,
  path: string,
): Extract<ConnectorAction, { type: 'AddKey' }>['params']['accessKey']['permission'] {
  const permission = record(value, path);
  const kind = string(permission.enum, `${path}.enum`);
  if (kind === 'fullAccess') return 'FullAccess';
  if (kind !== 'functionCall') throw invalid(`${path} uses unsupported permission "${kind}"`);
  return canonicalizeFunctionCallPermission(
    record(permission.functionCall, `${path}.functionCall`),
    path,
  );
}

function canonicalizeConnectorPermission(
  value: unknown,
  path: string,
): Extract<ConnectorAction, { type: 'AddKey' }>['params']['accessKey']['permission'] {
  if (value === 'FullAccess') return value;
  return canonicalizeFunctionCallPermission(record(value, path), path);
}

function canonicalizeFunctionCallPermission(
  permission: UnknownRecord,
  path: string,
): Exclude<
  Extract<ConnectorAction, { type: 'AddKey' }>['params']['accessKey']['permission'],
  'FullAccess'
> {
  const methodNames = permission.methodNames;
  if (methodNames !== undefined && !isStringArray(methodNames)) {
    throw invalid(`${path}.methodNames must be an array of strings`);
  }

  return {
    receiverId: string(permission.receiverId, `${path}.receiverId`),
    ...(permission.allowance === undefined
      ? {}
      : { allowance: unsignedInteger(permission.allowance, `${path}.allowance`) }),
    ...(methodNames === undefined ? {} : { methodNames }),
  };
}

function canonicalizeUseGlobalContract(
  params: UnknownRecord,
  path: string,
  native: boolean,
): Extract<ConnectorAction, { type: 'UseGlobalContract' }> {
  const identifier = record(params.contractIdentifier, `${path}.contractIdentifier`);
  if (!native) {
    if ('accountId' in identifier) {
      return {
        type: 'UseGlobalContract',
        params: {
          contractIdentifier: {
            accountId: string(identifier.accountId, `${path}.contractIdentifier.accountId`),
          },
        },
      };
    }
    return {
      type: 'UseGlobalContract',
      params: {
        contractIdentifier: {
          codeHash: string(identifier.codeHash, `${path}.contractIdentifier.codeHash`),
        },
      },
    };
  }

  if ('accountId' in identifier || 'codeHash' in identifier) {
    return canonicalizeUseGlobalContract(params, path, false);
  }

  const kind = string(identifier.enum, `${path}.contractIdentifier.enum`);
  if (kind === 'AccountId') {
    return {
      type: 'UseGlobalContract',
      params: {
        contractIdentifier: {
          accountId: string(identifier.AccountId, `${path}.contractIdentifier.AccountId`),
        },
      },
    };
  }
  if (kind === 'CodeHash') {
    return {
      type: 'UseGlobalContract',
      params: {
        contractIdentifier: {
          codeHash: base58.encode(
            bytes(identifier.CodeHash, `${path}.contractIdentifier.CodeHash`),
          ),
        },
      },
    };
  }
  throw invalid(`${path}.contractIdentifier uses unsupported kind "${kind}"`);
}

function canonicalizeDeployGlobalContract(
  params: UnknownRecord,
  path: string,
  native: boolean,
): Extract<ConnectorAction, { type: 'DeployGlobalContract' }> {
  const rawMode =
    native && typeof params.deployMode === 'object'
      ? record(params.deployMode, `${path}.deployMode`).enum
      : params.deployMode;
  const mode = string(rawMode, `${path}.deployMode`);
  const canonicalMode =
    mode === 'CodeHash' || mode === 'codeHash'
      ? 'CodeHash'
      : mode === 'AccountId' || mode === 'accountId'
        ? 'AccountId'
        : null;
  if (!canonicalMode) throw invalid(`${path}.deployMode uses unsupported mode "${mode}"`);
  return {
    type: 'DeployGlobalContract',
    params: { code: bytes(params.code, `${path}.code`), deployMode: canonicalMode },
  };
}

function publicKey(value: unknown, path: string): string {
  if (typeof value === 'string') {
    try {
      return PublicKey.fromString(value).toString();
    } catch {
      throw invalid(`${path} must be a valid NEAR public key`);
    }
  }

  const key = record(value, path);
  const kind = string(key.enum, `${path}.enum`);
  const encodedKey = record(key[kind], `${path}.${kind}`);
  const data = bytes(encodedKey.data, `${path}.${kind}.data`);
  if (kind === 'ed25519Key' && data.length === 32) return `ed25519:${base58.encode(data)}`;
  if (kind === 'secp256k1Key' && data.length === 64) return `secp256k1:${base58.encode(data)}`;
  throw invalid(`${path} must be a valid NEAR public key`);
}

function unsignedInteger(value: unknown, path: string): string {
  if (typeof value === 'bigint' && value >= 0n) return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value.toString();
  }
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return value;
  throw invalid(`${path} must be an unsigned integer`);
}

function safeNumber(value: unknown, path: string): number {
  const normalized = unsignedInteger(value, path);
  const numberValue = Number(normalized);
  if (!Number.isSafeInteger(numberValue)) throw invalid(`${path} exceeds the safe integer range`);
  return numberValue;
}

function bytes(value: unknown, path: string): Uint8Array {
  if (!(value instanceof Uint8Array)) throw invalid(`${path} must be a Uint8Array`);
  return value;
}

function object(value: unknown, path: string): object {
  if (typeof value !== 'object' || value === null) throw invalid(`${path} must be an object`);
  return value;
}

function record(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(`${path} must be an object`);
  }
  return value as UnknownRecord;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(`${path} must be a string`);
  return value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function invalid(reason: string): InvalidSigningPayloadError {
  return new InvalidSigningPayloadError(reason);
}
