import type Privy from '@privy-io/js-sdk-core';
import type { SignAndSendTransactionParams } from '@hot-labs/near-connect';
import type { FinalExecutionOutcome } from '@near-js/types';

/**
 * Signs a NEAR transaction with a Privy embedded wallet and returns the signed transaction bytes.
 *
 * @param params - Transaction parameters including `receiverId` and `actions`.
 * @param walletAddress - The signer's implicit account address.
 * @param privy - Privy instance used for embedded-wallet transaction signing.
 * @param walletId - Privy wallet id used by the Wallet API signing call.
 * @returns The signed transaction bytes ready for submission to the NEAR network.
 */
export async function signTransaction(
  params: SignAndSendTransactionParams,
  walletAddress: string,
  privy: Privy,
  walletId: string,
): Promise<Uint8Array> {
  void params;
  void walletAddress;
  void privy;
  void walletId;
  throw new Error('signTransaction: not yet implemented');
}

/**
 * Submits signed transaction bytes to the NEAR network.
 *
 * @param signedTransaction - The signed transaction bytes to submit.
 * @param network - Optional network selection for provider submission.
 * @returns The final execution outcome returned by the NEAR provider.
 */
export async function sendTransaction(
  signedTransaction: Uint8Array,
  network?: SignAndSendTransactionParams['network'],
): Promise<FinalExecutionOutcome> {
  void signedTransaction;
  void network;
  throw new Error('sendTransaction: not yet implemented');
}

/** Transaction helpers used by {@link signAndSendTransaction}. */
export const transactionOperations = {
  signTransaction,
  sendTransaction,
};

/**
 * Signs and submits a NEAR transaction using a Privy embedded wallet.
 *
 * @param params - Transaction parameters including `receiverId` and `actions`.
 * @param walletAddress - The signer's implicit account address.
 * @param privy - Privy instance used for embedded-wallet transaction signing.
 * @param walletId - Privy wallet id used by the Wallet API signing call.
 * @returns The final execution outcome from the NEAR network.
 */
export async function signAndSendTransaction(
  params: SignAndSendTransactionParams,
  walletAddress: string,
  privy: Privy,
  walletId: string,
): Promise<FinalExecutionOutcome> {
  const signedTransaction = await transactionOperations.signTransaction(
    params,
    walletAddress,
    privy,
    walletId,
  );
  return transactionOperations.sendTransaction(signedTransaction, params.network);
}
