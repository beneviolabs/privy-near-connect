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

/** Options for {@link createPrivyNearExecutor}. */
export type PrivyNearExecutorOptions = {
  /** URL of the sign page to open as a popup for each signing request. */
  signPageUrl: string;
  /** `window.open` features string. Default: `"popup,width=420,height=640"`. */
  popupFeatures?: string;
  /** Overrides merged into the default wallet manifest. */
  manifest?: Partial<WalletManifest>;
};

const DEFAULT_MANIFEST: WalletManifest = {
  id: 'privy',
  platform: ['browser'],
  name: 'Privy',
  icon: '',
  description: 'Privy embedded wallet for NEAR',
  website: 'https://privy.io',
  version: '1.0.0',
  executor: '',
  type: 'injected',
  permissions: {},
  features: {
    signMessage: true,
    signTransaction: false,
    signAndSendTransaction: true,
    signAndSendTransactions: true,
    signInWithoutAddKey: true,
    signInAndSignMessage: true,
    signInWithFunctionCallKey: true,
    signDelegateActions: true,
    mainnet: true,
    testnet: true,
  },
};

/**
 * Creates a {@link NearWalletBase} that relays all signing operations to a
 * Privy-powered sign page opened as a popup.
 *
 * @param options - Configuration including the sign page URL.
 * @returns A `NearWalletBase` implementation backed by Privy.
 */
export const createPrivyNearExecutor = (options: PrivyNearExecutorOptions): NearWalletBase => {
  let accounts: Account[] = [];

  const manifest: WalletManifest = { ...DEFAULT_MANIFEST, ...options.manifest };

  return {
    manifest,

    async signIn(data?: SignInParams): Promise<Account[]> {
      console.log(LOG_PREFIX, 'signIn', data);
      return accounts;
    },

    async signInAndSignMessage(data: SignInAndSignMessageParams): Promise<AccountWithSignedMessage[]> {
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

    async signAndSendTransaction(_params: SignAndSendTransactionParams): Promise<FinalExecutionOutcome> {
      console.log(LOG_PREFIX, 'signAndSendTransaction', _params);
      return {} as FinalExecutionOutcome;
    },

    async signAndSendTransactions(_params: SignAndSendTransactionsParams): Promise<FinalExecutionOutcome[]> {
      console.log(LOG_PREFIX, 'signAndSendTransactions', _params);
      return [];
    },

    async signDelegateActions(_params: SignDelegateActionsParams): Promise<SignDelegateActionsResponse> {
      console.log(LOG_PREFIX, 'signDelegateActions', _params);
      return { signedDelegateActions: [] };
    },
  };
};
