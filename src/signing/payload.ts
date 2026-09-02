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
  const kind = field(payload, 'kind', 'request', string);

  switch (kind) {
    case 'signAndSendTransaction': {
      const group = canonicalizeTransactionGroup(payload, 'request');
      return { ...payload, kind, ...group } as SigningPayload;
    }
    case 'signAndSendTransactions':
      return {
        ...payload,
        kind,
        transactions: field(payload, 'transactions', 'request', canonicalizeTransactionGroups),
      } as SigningPayload;
    case 'signDelegateActions':
      return {
        ...payload,
        kind,
        delegateActions: field(
          payload,
          'delegateActions',
          'request',
          canonicalizeTransactionGroups,
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
  return array(value, path).map((group, index) =>
    canonicalizeTransactionGroup(group, `${path}[${index}]`),
  );
}

function canonicalizeTransactionGroup(value: unknown, path: string): CanonicalTransactionGroup {
  const group = record(value, path);
  return {
    ...group,
    receiverId: field(group, 'receiverId', path, string),
    actions: field(group, 'actions', path, (value, actionsPath) =>
      array(value, actionsPath).map((action, index) =>
        canonicalizeAction(action, `${actionsPath}[${index}]`),
      ),
    ),
  };
}

function canonicalizeAction(value: unknown, path: string): ConnectorAction {
  const action = record(value, path);

  if (hasOwn(action, 'type')) return canonicalizeConnectorAction(action, path);

  const nativeType = field(action, 'enum', path, string);
  if (!Object.prototype.hasOwnProperty.call(NATIVE_ACTION_TYPES, nativeType)) {
    throw invalid(`${path} uses unsupported native action "${nativeType}"`);
  }

  const params = field(action, nativeType, path, record);
  return canonicalizeKnownAction(
    NATIVE_ACTION_TYPES[nativeType as keyof typeof NATIVE_ACTION_TYPES],
    params,
    path,
    true,
  );
}

function canonicalizeConnectorAction(action: UnknownRecord, path: string): ConnectorAction {
  const type = field(action, 'type', path, string);
  const params = type === 'CreateAccount' ? {} : field(action, 'params', path, record);
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
      return {
        type,
        params: { code: field(params, 'code', path, bytes) },
      };
    case 'FunctionCall':
      return {
        type,
        params: {
          methodName: field(params, 'methodName', path, string),
          args: field(params, 'args', path, (value, argsPath) =>
            functionCallArgs(value, argsPath, native),
          ),
          gas: field(params, 'gas', path, unsignedInteger),
          deposit: field(params, 'deposit', path, unsignedInteger),
        },
      };
    case 'Transfer':
      return {
        type,
        params: {
          deposit: field(params, 'deposit', path, unsignedInteger),
        },
      };
    case 'Stake':
      return {
        type,
        params: {
          stake: field(params, 'stake', path, unsignedInteger),
          publicKey: field(params, 'publicKey', path, publicKey),
        },
      };
    case 'AddKey':
      return canonicalizeAddKey(params, path, native);
    case 'DeleteKey':
      return {
        type,
        params: {
          publicKey: field(params, 'publicKey', path, publicKey),
        },
      };
    case 'DeleteAccount':
      return {
        type,
        params: {
          beneficiaryId: field(params, 'beneficiaryId', path, string),
        },
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
  const accessKey = field(params, 'accessKey', path, record);
  const permission = field(
    accessKey,
    'permission',
    `${path}.accessKey`,
    native ? canonicalizeNativePermission : canonicalizeConnectorPermission,
  );
  const nonce = optionalField(accessKey, 'nonce', `${path}.accessKey`, safeNumber);

  return {
    type: 'AddKey',
    params: {
      publicKey: field(params, 'publicKey', path, publicKey),
      accessKey: { ...(nonce === undefined ? {} : { nonce }), permission },
    },
  };
}

function canonicalizeNativePermission(
  value: unknown,
  path: string,
): Extract<ConnectorAction, { type: 'AddKey' }>['params']['accessKey']['permission'] {
  const permission = record(value, path);
  const kind = field(permission, 'enum', path, string);
  if (kind === 'fullAccess') {
    if (!hasValue(permission, 'fullAccess') || hasValue(permission, 'functionCall')) {
      throw invalid(`${path} must contain exactly one permission variant`);
    }
    record(permission.fullAccess, `${path}.fullAccess`);
    return 'FullAccess';
  }
  if (kind !== 'functionCall') throw invalid(`${path} uses unsupported permission "${kind}"`);
  if (!hasValue(permission, 'functionCall') || hasValue(permission, 'fullAccess')) {
    throw invalid(`${path} must contain exactly one permission variant`);
  }
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
  const methodNames = optionalField(permission, 'methodNames', path, stringArray);
  const allowance = optionalField(permission, 'allowance', path, unsignedInteger);

  return {
    receiverId: field(permission, 'receiverId', path, string),
    ...(allowance === undefined ? {} : { allowance }),
    ...(methodNames === undefined ? {} : { methodNames }),
  };
}

function canonicalizeUseGlobalContract(
  params: UnknownRecord,
  path: string,
  native: boolean,
): Extract<ConnectorAction, { type: 'UseGlobalContract' }> {
  const identifier = field(params, 'contractIdentifier', path, record);
  return native
    ? canonicalizeNativeGlobalContractIdentifier(identifier, path)
    : canonicalizeConnectorGlobalContractIdentifier(identifier, path);
}

function canonicalizeNativeGlobalContractIdentifier(
  identifier: UnknownRecord,
  path: string,
): Extract<ConnectorAction, { type: 'UseGlobalContract' }> {
  const identifierPath = `${path}.contractIdentifier`;
  const kind = field(identifier, 'enum', identifierPath, string);
  const hasCodeHash = hasValue(identifier, 'CodeHash');
  const hasAccountId = hasValue(identifier, 'AccountId');

  if (hasCodeHash === hasAccountId) {
    throw invalid(`${identifierPath} must contain exactly one identifier variant`);
  }
  if (kind === 'AccountId' && hasAccountId) {
    return useGlobalContract({
      accountId: string(identifier.AccountId, `${identifierPath}.AccountId`),
    });
  }
  if (kind === 'CodeHash' && hasCodeHash) {
    const data = bytes(identifier.CodeHash, `${identifierPath}.CodeHash`);
    if (data.length !== 32) throw invalid(`${identifierPath}.CodeHash must be 32 bytes`);
    return useGlobalContract({ codeHash: base58.encode(data) });
  }
  throw invalid(`${identifierPath} uses unsupported or mismatched kind "${kind}"`);
}

function canonicalizeConnectorGlobalContractIdentifier(
  identifier: UnknownRecord,
  path: string,
): Extract<ConnectorAction, { type: 'UseGlobalContract' }> {
  const identifierPath = `${path}.contractIdentifier`;
  const hasCodeHash = hasOwn(identifier, 'codeHash');
  const hasAccountId = hasOwn(identifier, 'accountId');

  if (hasCodeHash === hasAccountId) {
    throw invalid(`${identifierPath} must contain exactly one identifier variant`);
  }
  if (hasAccountId) {
    return useGlobalContract({
      accountId: string(identifier.accountId, `${identifierPath}.accountId`),
    });
  }

  const encoded = string(identifier.codeHash, `${identifierPath}.codeHash`);
  let data: Uint8Array;
  try {
    data = base58.decode(encoded);
  } catch {
    throw invalid(`${identifierPath}.codeHash must be a valid base58 code hash`);
  }
  if (data.length !== 32) throw invalid(`${identifierPath}.codeHash must decode to 32 bytes`);

  return useGlobalContract({ codeHash: base58.encode(data) });
}

function useGlobalContract(
  contractIdentifier: Extract<
    ConnectorAction,
    { type: 'UseGlobalContract' }
  >['params']['contractIdentifier'],
): Extract<ConnectorAction, { type: 'UseGlobalContract' }> {
  return { type: 'UseGlobalContract', params: { contractIdentifier } };
}

function canonicalizeDeployGlobalContract(
  params: UnknownRecord,
  path: string,
  native: boolean,
): Extract<ConnectorAction, { type: 'DeployGlobalContract' }> {
  const mode = field(params, 'deployMode', path, (value, modePath) =>
    native ? field(record(value, modePath), 'enum', modePath, string) : string(value, modePath),
  );
  const canonicalMode =
    mode === 'CodeHash' || mode === 'codeHash'
      ? 'CodeHash'
      : mode === 'AccountId' || mode === 'accountId'
        ? 'AccountId'
        : null;
  if (!canonicalMode) throw invalid(`${path}.deployMode uses unsupported mode "${mode}"`);
  return {
    type: 'DeployGlobalContract',
    params: {
      code: field(params, 'code', path, bytes),
      deployMode: canonicalMode,
    },
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
  const kind = field(key, 'enum', path, string);
  const encodedKey = field(key, kind, path, record);
  const data = field(encodedKey, 'data', `${path}.${kind}`, bytes);
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

function functionCallArgs(value: unknown, path: string, native: boolean): object {
  if (native && !(value instanceof Uint8Array)) {
    throw invalid(`${path} must be a Uint8Array for a native action`);
  }
  return object(value, path);
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

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(`${path} must be an array`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw invalid(`${path} must be an array of strings`);
  }
  return value as string[];
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasValue(record: UnknownRecord, key: string): boolean {
  return hasOwn(record, key) && record[key] !== undefined;
}

/**
 * Reads a required own property and validates it, deriving the error path from `key`.
 *
 * `hasOwn` rather than `in`, so an inherited prototype property cannot stand in for a
 * field the signer is about to act on.
 */
function field<T>(
  source: UnknownRecord,
  key: string,
  path: string,
  check: (value: unknown, path: string) => T,
): T {
  if (!hasOwn(source, key)) throw invalid(`${path}.${key} is required`);
  return check(source[key], `${path}.${key}`);
}

/** As {@link field}, but yields `undefined` when the property is absent or explicitly undefined. */
function optionalField<T>(
  source: UnknownRecord,
  key: string,
  path: string,
  check: (value: unknown, path: string) => T,
): T | undefined {
  if (!hasValue(source, key)) return undefined;
  return check(source[key], `${path}.${key}`);
}

function invalid(reason: string): InvalidSigningPayloadError {
  return new InvalidSigningPayloadError(reason);
}
