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
