import { PublicKey } from '@near-js/crypto';
import { base58 } from '@scure/base';
import { actions, PublicKey as NearPublicKey } from 'near-api-js';
import type { Action } from 'near-api-js';
import type { ConnectorAction } from '@hot-labs/near-connect/build/actions/types.js';

/**
 * Derive NEAR PublicKey from a Privy implicit account ID.
 *
 * Implicit accounts have their public key hex-encoded in the account ID.
 */
export function publicKeyFromImplicit(implicitAccountId: string): PublicKey {
  const bytes = hexToBytes(implicitAccountId);
  const base58PublicKey = base58.encode(bytes);
  return PublicKey.fromString(`ed25519:${base58PublicKey}`);
}

/**
 * Convert a hex signature (with optional `0x` prefix) to a Uint8Array.
 * Privy returns signatures as `0x`-prefixed hex strings.
 */
export function hexSignatureToBytes(hexSignature: string): Uint8Array {
  const cleanHex = hexSignature.startsWith('0x') ? hexSignature.slice(2) : hexSignature;
  return hexToBytes(cleanHex);
}

/**
 * Converts a `ConnectorAction` or native near-api-js `Action` to a near-api-js `Action`.
 *
 * `ConnectorAction` (from `@hot-labs/near-connect`) has an own `type` string
 * discriminant; native near-api-js `Action` objects do not.
 *
 * @param action - A connector action or a native near-api-js action.
 * @returns The equivalent near-api-js `Action`.
 */
export function toNearAction(action: unknown): Action {
  if (typeof action !== 'object' || action === null) {
    throw new Error('Action must be an object');
  }
  if (!Object.prototype.hasOwnProperty.call(action, 'type')) return action as Action;

  const connectorAction = action as ConnectorAction;

  switch (connectorAction.type) {
    case 'CreateAccount':
      return actions.createAccount();
    case 'DeployContract':
      return actions.deployContract(connectorAction.params.code);
    case 'FunctionCall':
      return actions.functionCall(
        connectorAction.params.methodName,
        connectorAction.params.args,
        BigInt(connectorAction.params.gas),
        BigInt(connectorAction.params.deposit),
      );
    case 'Transfer':
      return actions.transfer(BigInt(connectorAction.params.deposit));
    case 'Stake':
      return actions.stake(
        BigInt(connectorAction.params.stake),
        NearPublicKey.fromString(connectorAction.params.publicKey),
      );
    case 'AddKey': {
      const pk = NearPublicKey.fromString(connectorAction.params.publicKey);
      const { permission } = connectorAction.params.accessKey;
      const nonce = BigInt(connectorAction.params.accessKey.nonce ?? 0);
      const nearAction =
        permission === 'FullAccess'
          ? actions.addFullAccessKey(pk)
          : actions.addFunctionCallAccessKey(
              pk,
              permission.receiverId,
              permission.methodNames ?? [],
              permission.allowance !== undefined ? BigInt(permission.allowance) : undefined,
            );
      nearAction.addKey!.accessKey.nonce = nonce;
      return nearAction;
    }
    case 'DeleteKey':
      return actions.deleteKey(NearPublicKey.fromString(connectorAction.params.publicKey));
    case 'DeleteAccount':
      return actions.deleteAccount(connectorAction.params.beneficiaryId);
    case 'UseGlobalContract': {
      const id = connectorAction.params.contractIdentifier;
      if (Object.prototype.hasOwnProperty.call(id, 'accountId')) {
        return actions.useGlobalContract({
          accountId: (id as { accountId: string }).accountId,
        });
      }
      return actions.useGlobalContract({
        codeHash: base58.decode((id as { codeHash: string }).codeHash),
      });
    }
    case 'DeployGlobalContract':
      return actions.deployGlobalContract(
        connectorAction.params.code,
        connectorAction.params.deployMode === 'CodeHash' ? 'codeHash' : 'accountId',
      );
    default:
      throw new Error(`Unsupported action type: ${(connectorAction as { type: string }).type}`);
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`Invalid hex string: odd length (${hex.length})`);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) throw new Error(`Invalid hex character at position ${i * 2}`);
    bytes[i] = byte;
  }
  return bytes;
}
