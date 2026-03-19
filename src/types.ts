import type {
  SignAndSendTransactionsParams,
  SignAndSendTransactionParams,
  SignMessageParams,
} from '@hot-labs/near-connect';
import type { FinalExecutionOutcome } from '@near-js/types';
import type { Account, Network, SignInParams } from '@hot-labs/near-connect/build/types/index.js';
import type { SignedMessage } from 'near-api-js';

export type {
  SignAndSendTransactionsParams,
  SignAndSendTransactionParams,
  SignMessageParams,
} from '@hot-labs/near-connect';
export type { FinalExecutionOutcome } from '@near-js/types';
export type { Account, SignInParams } from '@hot-labs/near-connect/build/types/index.js';
export type { SignedMessage } from 'near-api-js';

/** Parameters for removing a previously granted function-call access key. */
export type SignOutParams = {
  /** Public key of the access key to delete. */
  publicKey: string;
  /** Optional NEAR network associated with the key removal transaction. */
  network?: Network;
};

/** Payload for a programmatic wallet sign-in request. */
export type SignInPayload = {
  /** Discriminator for wallet sign-in requests. */
  kind: 'signIn';
  /** Optional sign-in parameters such as network or function-call key settings. */
  params?: SignInParams;
};

/** Payload for a programmatic wallet sign-out request implemented as key deletion. */
export type SignOutPayload = {
  /** Discriminator for wallet sign-out requests. */
  kind: 'signOut';
  /** Parameters describing which access key to delete. */
  params: SignOutParams;
};

/** Payload for signing and sending multiple transactions. */
export type SignAndSendTransactionsPayload = {
  /** Discriminator for batched transaction requests. */
  kind: 'signAndSendTransactions';
  /** Transaction batch parameters. */
  params: SignAndSendTransactionsParams;
};

/** Union of all payload types that can arrive via `SIGN_REQUEST`. */
export type SigningPayload =
  | SignMessageParams
  | SignAndSendTransactionParams
  | SignInPayload
  | SignOutPayload
  | SignAndSendTransactionsPayload;

/** Union of all result types that can be returned by a signer. */
export type SigningResult =
  | SignedMessage
  | FinalExecutionOutcome
  | FinalExecutionOutcome[]
  | Account[]
  | void;

/** A function that signs a payload and returns the result. */
export type Signer = (payload: SigningPayload) => Promise<SigningResult>;

export type ChannelMsg =
  | { type: 'READY' }
  | { type: 'SIGN_REQUEST'; payload: SigningPayload }
  | { type: 'RESULT'; result: SigningResult }
  | { type: 'ERROR'; message: string };
