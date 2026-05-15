import type {
  NearWalletBase,
  WalletManifest,
  Account,
  Network,
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

import { channelMsg, CHANNEL_SOURCE } from '@/types';
import type { ChannelMsg, SigningPayload } from '@/types';

const LOG_PREFIX = '[privy-near-connect-executor]';
// How long to wait for the sign page to send READY after the popup opens.
// Does not limit how long the user can take to approve — that phase is unbounded.
const READY_TIMEOUT_MS = 5_000;

const ACCOUNT_ID_STORAGE_KEY = 'privy-near-connect:account-id';
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
    // `event.source` to reflect the sandbox proxy window rather than the popup.
    // We also rely on sandbox guaranteed uuid to avoid cross-iframe spoofing.
    const popup = window.selector.open(signPageURL);
    console.log(LOG_PREFIX, 'Popup opened', { signPageURL, popup });

    const cleanup = () => {
      window.removeEventListener('message', handler);
      clearInterval(closedPoll);
      clearTimeout(readyTimeoutId);
    };

    // Guard against the sign page opening but never sending READY (e.g. network
    // error loading the page, uncaught JS crash before the handshake). Without
    // this the Promise hangs forever because the closedPoll only fires when the
    // user manually closes the popup.
    const readyTimeoutId = setTimeout(() => {
      cleanup();
      popup.close();
      reject(new Error(`Timed out waiting for READY message after ${READY_TIMEOUT_MS}ms`));
    }, READY_TIMEOUT_MS);

    const handler = (event: MessageEvent) => {
      // We do not validate `event.origin` here and rely on the sandbox to do this.
      const msg = event.data as ChannelMsg;

      if (!msg || msg.source !== CHANNEL_SOURCE) return;
      console.debug(
        LOG_PREFIX,
        'Received message from sign page',
        event.data,
        'origin:',
        event.origin,
      );

      if (msg.type === 'READY') {
        clearTimeout(readyTimeoutId);
        console.log(LOG_PREFIX, 'Sign page is ready, sending SIGN_REQUEST', payload);
        popup.postMessage(channelMsg.signRequest(payload));
      } else if (msg.type === 'RESULT') {
        cleanup();
        resolve(msg.result as T);
      } else if (msg.type === 'ERROR') {
        cleanup();
        reject(
          Object.assign(new Error(msg.error.message), {
            name: msg.error.type,
            type: msg.error.type,
            payload: msg.error.payload,
          }),
        );
      }
    };

    const closedPoll = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Privy Sign window closed'));
      }
    }, 300);

    window.addEventListener('message', handler);

    // window.selector.open() always returns a ProxyWindow synchronously — never null.
    // The actual window.open() runs asynchronously inside the sandbox iframe, and
    // windowIdPromise resolves to null when the browser blocked it (e.g. the user
    // gesture was consumed by a prior async call). Without this check the Promise
    // hangs: the sign page never opens so READY never arrives, and closedPoll never
    // fires because ProxyWindow.closed stays false indefinitely.
    popup.windowIdPromise.then((windowId) => {
      if (!windowId) {
        cleanup();
        window.dispatchEvent(new Event('popup-blocked'));
        reject(new Error('Popup blocked by the browser'));
      }
    });
  });
}

const wallet: NearWalletBase & { manifest: WalletManifestwithMetadata } = {
  manifest: {} as WalletManifestwithMetadata,

  async signIn(data?: SignInParams): Promise<Account[]> {
    const accounts = await requestWallet<Account[]>(this.manifest.metadata.signPageURL, {
      kind: 'signIn',
      ...data,
    });
    const accountId = accounts[0]?.accountId;

    if (accountId) {
      await window.selector.storage.set(ACCOUNT_ID_STORAGE_KEY, accountId);
    }

    return accounts;
  },

  async signInAndSignMessage(
    data: SignInAndSignMessageParams,
  ): Promise<AccountWithSignedMessage[]> {
    const accounts = await requestWallet<AccountWithSignedMessage[]>(
      this.manifest.metadata.signPageURL,
      {
        kind: 'signInAndSignMessage',
        ...data,
      },
    );
    const accountId = accounts[0]?.accountId;

    if (accountId) {
      await window.selector.storage.set(ACCOUNT_ID_STORAGE_KEY, accountId);
    }

    return accounts;
  },

  async signOut(_data?: { network?: string }): Promise<void> {
    console.log(LOG_PREFIX, 'signOut');
    await window.selector.storage.remove(ACCOUNT_ID_STORAGE_KEY);
  },

  async getAccounts(_data?: { network?: Network }): Promise<Account[]> {
    const accountId = await window.selector.storage.get(ACCOUNT_ID_STORAGE_KEY);

    if (!accountId) return [];

    return [
      {
        accountId,
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

window.selector.ready(wallet);
