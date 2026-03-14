import type { SignAndSendTransactionParams, SignMessageParams, SignedMessage } from '@hot-labs/near-connect';
import type { FinalExecutionOutcome } from '@near-js/types';

export type {
  SignAndSendTransactionParams,
  SignMessageParams,
  SignedMessage,
} from '@hot-labs/near-connect';
export type { FinalExecutionOutcome } from '@near-js/types';

/** Union of all payload types that can arrive via `SIGN_REQUEST`. */
export type SigningPayload = SignMessageParams | SignAndSendTransactionParams;

/** Union of all result types that can be returned by a signer. */
export type SigningResult = SignedMessage | FinalExecutionOutcome;

/** A function that signs a payload and returns the result. */
export type Signer = (payload: SigningPayload) => Promise<SigningResult>;

export type ChannelMsg =
  | { type: 'READY' }
  | { type: 'SIGN_REQUEST'; payload: SigningPayload }
  | { type: 'RESULT'; result: SigningResult }
  | { type: 'ERROR'; message: string };
