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

import { LOG_PREFIX } from '@/log';

// URL of the sign page opened as a popup for each signing operation.
// near-connect replaces `window.open` with its proxied `window.selector.open`
// inside the sandbox iframe, so popup messaging is relayed through the main window.
const SIGN_PAGE_URL = ''; // TODO: set to the deployed sign page URL

let accounts: Account[] = [];

const wallet: NearWalletBase = {
  // Manifest is owned by near-connect (loaded from manifest.json); this stub
  // satisfies the NearWalletBase interface inside the sandbox.
  manifest: {} as WalletManifest,

  async signIn(data?: SignInParams): Promise<Account[]> {
    console.log(LOG_PREFIX, 'signIn', data, 'JOJOBA', this.manifest);
    return accounts;
  },

  async signInAndSignMessage(
    data: SignInAndSignMessageParams,
  ): Promise<AccountWithSignedMessage[]> {
    console.log(LOG_PREFIX, 'signInAndSignMessage', data);
    return [];
  },

  async signOut(_data?: { network?: string }): Promise<void> {
    console.log(LOG_PREFIX, 'signOut');
    accounts = [];
  },

  async getAccounts(): Promise<Account[]> {
    console.log(LOG_PREFIX, 'getAccounts');
    return accounts;
  },

  async signMessage(_params: SignMessageParams): Promise<SignedMessage> {
    console.log(LOG_PREFIX, 'signMessage', _params);
    return {} as SignedMessage;
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

// Register with the near-connect sandbox.
// near-connect injects `window.selector` into this iframe before loading this script.
(window as any).selector.ready(wallet);
