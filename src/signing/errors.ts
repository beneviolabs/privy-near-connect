/** Thrown when `sign` is called after the opener window is no longer available. */
export class WindowOpenerClosedError extends Error {
  constructor() {
    super('window.opener is gone — cannot post RESULT');
    this.name = 'WindowOpenerClosedError';
  }
}

/** Thrown when the current Privy user has no linked NEAR wallet available for signing. */
export class NoNearWalletError extends Error {
  constructor() {
    super('No linked Privy NEAR wallet found for this user');
    this.name = 'NoNearWalletError';
  }
}

/** Thrown when `sign` is called with a payload type that this signer does not support. */
export class UnsupportedSigningPayloadError extends Error {
  constructor() {
    super('Only NEP-413 signMessage payloads are currently supported');
    this.name = 'UnsupportedSigningPayloadError';
  }
}

/** Thrown when an optionally verified NEP-413 signature does not match the derived public key. */
export class SignatureVerificationError extends Error {
  constructor() {
    super('NEP-413 signature verification failed');
    this.name = 'SignatureVerificationError';
  }
}
