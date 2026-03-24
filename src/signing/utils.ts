import { PublicKey } from '@near-js/crypto';
import { base58 } from '@scure/base';
import { actions, PublicKey as NearPublicKey } from 'near-api-js';
import type { Action } from 'near-api-js';
import type { SignAndSendTransactionParams } from '@hot-labs/near-connect';

type ActionItem = SignAndSendTransactionParams['actions'][number];

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
 * `ConnectorAction` (from `@hot-labs/near-connect`) has a `type` string discriminant;
 * native near-api-js `Action` objects do not, so the two are distinguished via `'type' in action`.
 *
 * @param action - A connector action or a native near-api-js action.
 * @returns The equivalent near-api-js `Action`.
 */
export function toNearAction(action: ActionItem): Action {
  if (!('type' in action)) return action as Action;

  switch (action.type) {
    case 'CreateAccount':
      return actions.createAccount();
    case 'DeployContract':
      return actions.deployContract(action.params.code);
    case 'FunctionCall':
      return actions.functionCall(
        action.params.methodName,
        action.params.args,
        BigInt(action.params.gas),
        BigInt(action.params.deposit),
      );
    case 'Transfer':
      return actions.transfer(BigInt(action.params.deposit));
    case 'Stake':
      return actions.stake(
        BigInt(action.params.stake),
        NearPublicKey.fromString(action.params.publicKey),
      );
    case 'AddKey': {
      const pk = NearPublicKey.fromString(action.params.publicKey);
      const { permission } = action.params.accessKey;
      if (permission === 'FullAccess') return actions.addFullAccessKey(pk);
      return actions.addFunctionCallAccessKey(
        pk,
        permission.receiverId,
        permission.methodNames ?? [],
        permission.allowance !== undefined ? BigInt(permission.allowance) : undefined,
      );
    }
    case 'DeleteKey':
      return actions.deleteKey(NearPublicKey.fromString(action.params.publicKey));
    case 'DeleteAccount':
      return actions.deleteAccount(action.params.beneficiaryId);
    case 'UseGlobalContract': {
      const id = action.params.contractIdentifier;
      return actions.useGlobalContract(
        'accountId' in id ? { accountId: id.accountId } : { codeHash: id.codeHash },
      );
    }
    case 'DeployGlobalContract':
      return actions.deployGlobalContract(
        action.params.code,
        action.params.deployMode === 'CodeHash' ? 'codeHash' : 'accountId',
      );
    default:
      throw new Error(`Unsupported action type: ${(action as { type: string }).type}`);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
