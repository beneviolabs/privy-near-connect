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
    super(
      'Only messages, transaction and delegate action signing payloads are supported by this signer',
    );
    this.name = 'UnsupportedSigningPayloadError';
  }
}
