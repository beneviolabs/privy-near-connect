/** Thrown when `initSigningPage` runs without a valid `window.opener`. */
export class NoOpenerError extends Error {
  constructor() {
    super('window.opener is null — page was not opened via window.open');
    this.name = 'NoOpenerError';
  }
}

/** Thrown when `initSigningPage` is called without an explicit `allowedOrigins` policy. */
export class MissingAllowedOriginsError extends Error {
  constructor() {
    super(
      "allowedOrigins is required — pass an explicit origin list or 'dangerouslyAllowAllOrigins'",
    );
    this.name = 'MissingAllowedOriginsError';
  }
}

/** Thrown when `allowedOrigins` contains a wildcard entry (`'*'`). */
export class WildcardOriginError extends Error {
  constructor() {
    super("allowedOrigins must not contain '*' — specify explicit origins instead");
    this.name = 'WildcardOriginError';
  }
}

/** Thrown when a `SIGN_REQUEST` message is not received before timeout expires. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`SIGN_REQUEST did not arrive within ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** Thrown when a signing request contains an invalid or unsupported action. */
export class InvalidSigningPayloadError extends Error {
  /**
   * Creates an error describing the rejected portion of the request.
   *
   * @param reason - Human-readable reason the signing payload was rejected.
   */
  constructor(reason: string) {
    super(`Invalid signing payload: ${reason}`);
    this.name = 'InvalidSigningPayloadError';
  }
}
