import type {
  NearWalletBase,
  WalletManifest,
  Account,
  AccountWithSignedMessage,
  SignInParams,
  SignInAndSignMessageParams,
  SignMessageParams,
  SignAndSendTransactionParams,
  SignAndSendTransactionsParams,
  SignDelegateActionsParams,
  SignDelegateActionsResponse,
  SignedMessage,
} from '@hot-labs/near-connect/build/types/index.js';
import type { FinalExecutionOutcome } from '@near-js/types';

import type { ChannelMsg, SigningPayload } from '@/types';
import { LOG_PREFIX } from '@/log';

const SIGN_PAGE_URL = new URL('#privy-sign', window.selector.location).href;

function requestWallet<T>(payload: SigningPayload): Promise<T> {
  return new Promise((resolve, reject) => {
    // Use the near-connect sandbox API to open the sign page.
    // Native `window.open()` won't work the same because the sandbox
    // proxies popup messaging, causing `event.origin` and
    // `event.source` to reflect the sandbox rather than the popup.
    const popup = window.selector.open(SIGN_PAGE_URL);

    const cleanup = () => {
      window.removeEventListener('message', handler);
      clearInterval(closedPoll);
    };

    const handler = (event: MessageEvent) => {
      const msg = event.data as ChannelMsg;

      if (msg.type === 'READY') {
        popup.postMessage({ type: 'SIGN_REQUEST', payload } satisfies ChannelMsg);
      } else if (msg.type === 'RESULT') {
        cleanup();
        resolve(msg.result as T);
      } else if (msg.type === 'ERROR') {
        cleanup();
        reject(new Error(msg.message));
      }
    };

    const closedPoll = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Sign page closed'));
      }
    }, 300);

    window.addEventListener('message', handler);
  });
}

const wallet: NearWalletBase = {
  manifest: {} as WalletManifest,

  async signIn(_data?: SignInParams): Promise<Account[]> {
    return [
      {
        accountId: 'example.near',
        publicKey: '',
      },
    ];
  },

  async signInAndSignMessage(
    _data: SignInAndSignMessageParams,
  ): Promise<AccountWithSignedMessage[]> {
    console.log(LOG_PREFIX, 'signInAndSignMessage', _data);
    return [];
  },

  async signOut(_data?: { network?: string }): Promise<void> {
    console.log(LOG_PREFIX, 'signOut');
  },

  async getAccounts(): Promise<Account[]> {
    console.log(LOG_PREFIX, 'getAccounts');
    return [
      {
        accountId: 'example.near',
        publicKey: '',
      },
    ];
  },

  async signMessage(params: SignMessageParams): Promise<SignedMessage> {
    return requestWallet({ kind: 'signMessage', ...params });
  },

  async signAndSendTransaction(
    params: SignAndSendTransactionParams,
  ): Promise<FinalExecutionOutcome> {
    return requestWallet({ kind: 'signAndSendTransaction', ...params });
  },

  async signAndSendTransactions(
    params: SignAndSendTransactionsParams,
  ): Promise<FinalExecutionOutcome[]> {
    return requestWallet({ kind: 'signAndSendTransactions', ...params });
  },

  async signDelegateActions(
    params: SignDelegateActionsParams,
  ): Promise<SignDelegateActionsResponse> {
    return requestWallet({ kind: 'signDelegateActions', ...params });
  },
};

window.selector.ready(wallet);
