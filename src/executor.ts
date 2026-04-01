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

type WalletManifestwithMetadata = WalletManifest & {
  metadata: {
    signPageURL: string;
  };
};

function requestWallet<T>(signPageURL: string, payload: SigningPayload): Promise<T> {
  return new Promise((resolve, reject) => {
    // Use the near-connect sandbox API to open the sign page.
    // Native `window.open()` won't work the same because the sandbox
    // proxies popups and messaging. This causes `event.origin` and
    // `event.source` to reflect the sandbox rather than the popup.
    const popup = window.selector.open(signPageURL);

    const cleanup = () => {
      window.removeEventListener('message', handler);
      clearInterval(closedPoll);
    };

    const handler = (event: MessageEvent) => {
      // We do not validate `event.origin` here and rely on the sandbox to do this.
      console.debug(
        LOG_PREFIX,
        'Received message from sign page',
        event.data,
        'origin:',
        event.origin,
      );
      const msg = event.data as ChannelMsg;

      if (msg.type === 'READY') {
        console.log(LOG_PREFIX, 'Sign page is ready, sending SIGN_REQUEST', payload);
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
        reject(new Error('Privy Sign window closed'));
      }
    }, 300);

    window.addEventListener('message', handler);
  });
}

const wallet: NearWalletBase & { manifest: WalletManifestwithMetadata } = {
  manifest: {} as WalletManifestwithMetadata,

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
    return requestWallet(this.manifest.metadata.signPageURL, { kind: 'signMessage', ...params });
  },

  async signAndSendTransaction(
    params: SignAndSendTransactionParams,
  ): Promise<FinalExecutionOutcome> {
    return requestWallet(this.manifest.metadata.signPageURL, {
      kind: 'signAndSendTransaction',
      ...params,
    });
  },

  async signAndSendTransactions(
    params: SignAndSendTransactionsParams,
  ): Promise<FinalExecutionOutcome[]> {
    return requestWallet(this.manifest.metadata.signPageURL, {
      kind: 'signAndSendTransactions',
      ...params,
    });
  },

  async signDelegateActions(
    params: SignDelegateActionsParams,
  ): Promise<SignDelegateActionsResponse> {
    return requestWallet(this.manifest.metadata.signPageURL, {
      kind: 'signDelegateActions',
      ...params,
    });
  },
};

const SIGN_PAGE_URL = new URL('#privy-sign', 'http://localhost:5173').href;
wallet.manifest = {
  metadata: {
    signPageURL: SIGN_PAGE_URL,
  },
} as WalletManifestwithMetadata;
window.selector.ready(wallet);
