import type {
  SignAndSendTransactionsParams,
  SignAndSendTransactionParams,
  SignDelegateActionsParams,
  SignMessageParams,
} from '@hot-labs/near-connect';
import type { FinalExecutionOutcome } from '@near-js/types';
import type {
  Account,
  SignInParams,
  SignedMessage,
  SignDelegateActionsResponse,
} from '@hot-labs/near-connect/build/types/index.js';
import type { RpcOptions } from '@/signing/account';
import type { PrivyNearWallet } from '@/signing/signer';

export type {
  SignAndSendTransactionsParams,
  SignAndSendTransactionParams,
  SignDelegateActionsParams,
  SignMessageParams,
} from '@hot-labs/near-connect';
export type { FinalExecutionOutcome } from '@near-js/types';
export type {
  Account,
  Network,
  SignedMessage,
  SignInParams,
  SignDelegateActionsResponse,
} from '@hot-labs/near-connect/build/types/index.js';

/**
 * Union of all payload types that can arrive via `SIGN_REQUEST`.
 *
 * Each variant carries a `kind` discriminator matching the corresponding
 * {@link NearWalletBase} method name and is intersected with the exact
 * parameter type that method expects.
 *
 * For payload kinds that include an optional `network` field, that value
 * determines whether signing uses `testnet` or `mainnet`. If `network` is
 * omitted, signing defaults to `mainnet`.
 */
export type SigningPayload =
  | ({ kind: 'signIn' } & SignInParams)
  | ({ kind: 'signMessage' } & SignMessageParams)
  | ({ kind: 'signAndSendTransaction' } & SignAndSendTransactionParams)
  | ({ kind: 'signAndSendTransactions' } & SignAndSendTransactionsParams)
  | ({ kind: 'signDelegateActions' } & SignDelegateActionsParams);

/** Union of all result types that can be returned by a signer. */
export type SigningResult =
  | SignedMessage
  | SignDelegateActionsResponse
  | FinalExecutionOutcome
  | FinalExecutionOutcome[]
  | Account[]
  | void;

export type ChannelMsg =
  | { type: 'READY' }
  | { type: 'SIGN_REQUEST'; payload: SigningPayload }
  | { type: 'RESULT'; result: SigningResult }
  | { type: 'ERROR'; message: string };

/** Options for configuring signing page handshake behavior. */
export type SignPageOptions = {
  /** Milliseconds to wait for `SIGN_REQUEST` before rejecting. */
  timeout?: number;
  /** Exact trusted origin to use for postMessage target and message filtering. Defaults to `window.opener.location.origin` when same-origin access is available. */
  allowedOrigin?: string;
  /** Privy NEAR wallet to use during signing. If omitted, the wallet is fetched from `privy.user.get()` during signing. */
  wallet?: PrivyNearWallet;
  /** RPC connection options for signing payloads. Defaults to the public RPC for the payload's `network` value, or `mainnet` when `network` is omitted. */
  rpcOptions?: RpcOptions;
};

/** Session returned by `initSigningPage` after receiving a signing payload. */
export type SignPageSession = {
  /** Payload received from the opener via `SIGN_REQUEST`. */
  payload: SigningPayload;
  /** Signs the payload using Privy and posts the result to the opener. */
  sign: () => Promise<void>;
};
