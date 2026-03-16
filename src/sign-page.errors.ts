/** Thrown when `initSigningPage` runs without a valid `window.opener`. */
export class NoOpenerError extends Error {
  constructor() {
    super('window.opener is null — page was not opened via window.open');
    this.name = 'NoOpenerError';
  }
}

/** Thrown when a `SIGN_REQUEST` message is not received before timeout expires. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`SIGN_REQUEST did not arrive within ${ms}ms`);
    this.name = 'TimeoutError';
  }
}
