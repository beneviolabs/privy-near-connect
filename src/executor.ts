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

const SIGN_PAGE_URL = 'http://localhost:5173/#sign';
const SIGN_PAGE_ORIGIN = new URL(SIGN_PAGE_URL).origin;

class SignPage {
  private static instance: SignPage | null = null;

  static getInstance(): SignPage {
    if (!SignPage.instance) SignPage.instance = new SignPage();
    return SignPage.instance;
  }

  private constructor() {}

  private request<T>(payload: SigningPayload): Promise<T> {
    return new Promise((resolve, reject) => {
      const popup = window.open(SIGN_PAGE_URL, '_blank', 'popup,width=420,height=640');
      if (!popup) return reject(new Error('Popup blocked'));

      const cleanup = () => {
        window.removeEventListener('message', handler);
        clearInterval(closedPoll);
      };

      const handler = (event: MessageEvent) => {
        if (event.source !== popup) return;
        if (event.origin !== SIGN_PAGE_ORIGIN) return;

        const msg = event.data as ChannelMsg;

        if (msg.type === 'READY') {
          popup.postMessage(
            { type: 'SIGN_REQUEST', payload } satisfies ChannelMsg,
            SIGN_PAGE_ORIGIN,
          );
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

  signMessage(params: SignMessageParams): Promise<SignedMessage> {
    return this.request({ kind: 'signMessage', ...params });
  }
}

const wallet: NearWalletBase = {
  manifest: {} as WalletManifest,

  async signIn(data?: SignInParams): Promise<Account[]> {
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
    console.log(LOG_PREFIX, 'signMessage', params);
    return SignPage.getInstance().signMessage(params);
  },

  async signAndSendTransaction(
    _params: SignAndSendTransactionParams,
  ): Promise<FinalExecutionOutcome> {
    console.log(LOG_PREFIX, 'signAndSendTransaction', _params);
    return {} as FinalExecutionOutcome;
  },

  async signAndSendTransactions(
    _params: SignAndSendTransactionsParams,
  ): Promise<FinalExecutionOutcome[]> {
    console.log(LOG_PREFIX, 'signAndSendTransactions', _params);
    return [];
  },

  async signDelegateActions(
    _params: SignDelegateActionsParams,
  ): Promise<SignDelegateActionsResponse> {
    console.log(LOG_PREFIX, 'signDelegateActions', _params);
    return { signedDelegateActions: [] };
  },
};

window.selector.ready(wallet);
