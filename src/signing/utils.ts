import { PublicKey } from '@near-js/crypto';
import { base58 } from '@scure/base';

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
 * Verify a signature against a message hash.
 */
export function verifySignature(
  publicKey: PublicKey,
  messageHash: Uint8Array,
  signature: Uint8Array,
): boolean {
  return publicKey.verify(messageHash, signature);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
