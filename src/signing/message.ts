import { sha256 } from '@noble/hashes/sha256';
import { serialize, type Schema } from 'borsh';
import { rawSign } from '@privy-io/js-sdk-core';
import type Privy from '@privy-io/js-sdk-core';
import type { SignMessageParams, SignedMessage } from '@hot-labs/near-connect';

import { publicKeyFromImplicit, hexSignatureToBytes } from './crypto';

/** NEP-413 message schema for Borsh serialization. */
export const Nep413MessageSchema: Schema = {
  struct: {
    message: 'string',
    nonce: { array: { type: 'u8', len: 32 } },
    recipient: 'string',
    callbackUrl: { option: 'string' },
  },
};

/** NEP-413 prefix — distinguishes signed messages from signed transactions. */
const NEP413_PREFIX = 2147484061;

/**
 * Sign a NEP-413 message using a Privy embedded wallet.
 *
 * @param params - Message parameters (message, nonce, recipient, callbackUrl).
 * @param walletAddress - The Privy implicit account address.
 * @param privy - Privy instance used for embedded-wallet raw signing.
 * @param walletId - Privy wallet id used by Wallet API raw signing.
 * @returns A signed message with accountId, publicKey, and base64 signature.
 */
export async function signMessage(
  params: SignMessageParams,
  walletAddress: string,
  privy: Privy,
  walletId: string,
): Promise<SignedMessage> {
  const publicKey = publicKeyFromImplicit(walletAddress);

  const messagePayload = serializeNep413Message(params);
  const messageHash = sha256(messagePayload);
  const messageHashHex = `0x${bytesToHex(messageHash)}` as `0x${string}`;

  const {
    data: { signature: hexSignature },
  } = await rawSign(
    privy,
    (requestOptions) => privy.embeddedWallet.signWithUserSigner(requestOptions),
    {
      wallet_id: walletId,
      params: {
        hash: messageHashHex,
      },
    },
  );

  const signatureBytes = hexSignatureToBytes(hexSignature);

  return {
    accountId: walletAddress,
    publicKey: publicKey.toString(),
    signature: bytesToBase64(signatureBytes),
  };
}

/**
 * Serialize a NEP-413 message for signing.
 *
 * Format: PREFIX (u32, Borsh) || message fields (Borsh)
 */
function serializeNep413Message(params: SignMessageParams): Uint8Array {
  const serializedPrefix = serialize('u32', NEP413_PREFIX);
  const serializedParams = serialize(Nep413MessageSchema, params);

  const result = new Uint8Array(serializedPrefix.length + serializedParams.length);
  result.set(serializedPrefix);
  result.set(serializedParams, serializedPrefix.length);

  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}
