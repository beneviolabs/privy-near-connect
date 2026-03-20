import type {
  SignAndSendTransactionsParams,
  SignAndSendTransactionParams,
  SignDelegateActionsParams,
  SignMessageParams,
} from '@hot-labs/near-connect';
import type { FinalExecutionOutcome } from '@near-js/types';
import type {
  Account,
  SignedMessage,
  SignDelegateActionsResponse,
} from '@hot-labs/near-connect/build/types/index.js';

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
 */
export type SigningPayload =
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
