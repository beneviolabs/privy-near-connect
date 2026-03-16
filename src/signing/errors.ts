/** Thrown when `sign` is called after the opener window is no longer available. */
export class WindowOpenerClosedError extends Error {
  constructor() {
    super('window.opener is gone — cannot post RESULT');
    this.name = 'WindowOpenerClosedError';
  }
}

/** Thrown when `sign` is called more than once for the same session. */
export class AlreadySignedError extends Error {
  constructor() {
    super('sign() has already been called on this session');
    this.name = 'AlreadySignedError';
  }
}

/** Thrown when `sign` is called with a payload type that this signer does not support. */
export class UnsupportedSigningPayloadError extends Error {
  constructor() {
    super('Only NEP-413 signMessage payloads are currently supported');
    this.name = 'UnsupportedSigningPayloadError';
  }
}
