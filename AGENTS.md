# Agent instructions

## Documentation

All public exports must have TSDoc comments. Follow these rules:

- Use `/** ... */` block comments directly above the declaration.
- Every exported function needs at minimum a summary line, `@param` tags for each parameter, and a `@returns` tag.
- Exported types and classes need a summary line. Document each property of an exported type with an inline `/** ... */` comment.
- Exported error classes need a summary line describing when they are thrown.
- Do not add TSDoc to internal (non-exported) helpers.

### Example — function

```ts
/**
 * Initialises the signing page, posts `READY` to the opener, and waits for a
 * `SIGN_REQUEST` message containing the payload to sign.
 *
 * @param options - Optional configuration for origin restrictions and timeout.
 * @returns A session object containing the received payload and a `sign` callback.
 * @throws {@link NoOpenerError} if `window.opener` is `null` at call time.
 * @throws {@link TimeoutError} if no `SIGN_REQUEST` arrives within the timeout window.
 */
export const initSigningPage = async <TPayload, TResult>(
  options?: SignPageOptions,
): Promise<SignPageSession<TPayload, TResult>> => { ... };
```

### Example — type

```ts
/** Options for {@link initSigningPage}. */
export type SignPageOptions = {
  /** Milliseconds to wait for a `SIGN_REQUEST` before rejecting. Default: `30_000`. */
  timeout?: number;
  /** Restrict accepted messages to this origin. Default: opener's origin. */
  allowedOrigin?: string;
};
```

### Example — error class

```ts
/** Thrown by {@link initSigningPage} when `window.opener` is `null`. */
export class NoOpenerError extends Error {}
```
