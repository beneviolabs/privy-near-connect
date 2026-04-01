import { rawSign } from '@privy-io/js-sdk-core';
import { toHex } from 'viem';
import type Privy from '@privy-io/js-sdk-core';
import type {
  SignAndSendTransactionParams,
  SignAndSendTransactionsParams,
  SignDelegateActionsParams,
  SignMessageParams,
} from '@hot-labs/near-connect';
import type {
  Account as NearConnectAccount,
  Network,
  SignedMessage as NcSignedMessage,
  SignInParams,
  SignDelegateActionsResponse,
} from '@hot-labs/near-connect/build/types/index.js';
import type { SignedMessage as NearApiSignedMessage } from 'near-api-js';
import { Account, JsonRpcProvider, PublicKey, Signer, encodeSignedDelegate } from 'near-api-js';
import { signMessage as signNep413Message } from 'near-api-js/nep413';
import { base64 } from '@scure/base';

import { LOG_PREFIX } from '@/log';
import { hexSignatureToBytes, publicKeyFromImplicit, toNearAction } from '@/signing/utils';
import type { PrivyNearWallet } from '@/signing/signer';

/** RPC connection options for {@link JsonRpcProvider}. */
export type RpcOptions = {
  /** RPC endpoint URL. */
  url: string;
  /** Optional headers included with every RPC request. */
  headers?: Record<string, string | number>;
};

/**
 * Privy wallet credentials used for embedded-wallet signing.
 *
 * Groups the two values that must travel together whenever a signing operation
 * is performed against a specific Privy NEAR wallet.
 */
export type PrivyConfig = {
  /** Initialized Privy client. */
  privyClient: Privy;
  /** Linked Privy NEAR wallet metadata used for signing. */
  wallet: PrivyNearWallet;
};

const NEAR_RPC_URLS: Record<Network, string> = {
  mainnet: 'https://rpc.mainnet.fastnear.com',
  testnet: 'https://rpc.testnet.fastnear.com',
};

/**
 * Creates a {@link JsonRpcProvider} from optional network/RPC overrides.
 *
 * @param network - NEAR network. Defaults to `mainnet`.
 * @param rpcOptions - Optional RPC endpoint overrides.
 * @returns A configured `JsonRpcProvider`.
 */
export function createProvider(network?: Network, rpcOptions?: RpcOptions): JsonRpcProvider {
  const resolvedNetwork = network ?? 'mainnet';
  const url = rpcOptions?.url ?? NEAR_RPC_URLS[resolvedNetwork];
  console.debug(LOG_PREFIX, 'Creating JsonRpcProvider', { network: resolvedNetwork, url });
  return new JsonRpcProvider({ url });
}

/**
 * near-api-js `Signer` implementation that delegates raw-byte signing to a
 * Privy embedded wallet.
 */
export class PrivySigner extends Signer {
  constructor(private readonly privyConfig: PrivyConfig) {
    super();
  }

  async getPublicKey(): Promise<PublicKey> {
    return PublicKey.fromString(publicKeyFromImplicit(this.privyConfig.wallet.address).toString());
  }

  protected async signBytes(bytes: Uint8Array): Promise<Uint8Array> {
    return this.signHash(toHex(bytes));
  }

  /**
   * Signs a pre-hashed payload using the Privy embedded wallet.
   *
   * @param hash - SHA-256 hash of the payload as a `0x`-prefixed hex string.
   * @returns Raw signature bytes.
   */
  async signHash(hash: `0x${string}`): Promise<Uint8Array> {
    const {
      data: { signature: hexSignature },
    } = await rawSign(
      this.privyConfig.privyClient,
      (requestOptions) =>
        this.privyConfig.privyClient.embeddedWallet.signWithUserSigner(requestOptions),
      { wallet_id: this.privyConfig.wallet.id, params: { hash } },
    );
    const signatureBytes = hexSignatureToBytes(hexSignature);
    console.debug(LOG_PREFIX, 'Privy RawSign succeeded', {
      signatureLength: signatureBytes.length,
    });
    return signatureBytes;
  }
}

/**
 * NEAR `Account` subclass that uses a {@link PrivySigner} for all signing operations.
 *
 * Drop-in replacement for the standard `Account` wherever a Privy embedded wallet
 * should be the transaction signer.
 *
 * Most built-in method in puts and return types are compatible with NearConnector types but some
 * which aren't or don't exist in near-api-js are implemented here and annotated with nc* prefix, e.g. {@link ncSignMessage}.
 */
export class CustomAccount extends Account {
  /** The Privy signer used for all signing operations on this account. */
  readonly privySigner: PrivySigner;

  /** Wallet credentials this account was constructed with. */
  readonly privyConfig: PrivyConfig;

  constructor(config: PrivyConfig, provider: JsonRpcProvider | string) {
    const signer = new PrivySigner(config);
    super(config.wallet.address, provider, signer);
    this.privyConfig = config;
    this.privySigner = signer;
  }

  async _signMessage(params: SignMessageParams): Promise<NearApiSignedMessage> {
    return signNep413Message({
      signerAccount: this,
      payload: params,
    });
  }

  /**
   * Returns the NEAR account information for this wallet, optionally adding a
   * function-call access key if {@link SignInParams.addFunctionCallKey} is provided.
   *
   * @param data - Optional sign-in parameters. When `addFunctionCallKey` is set, a
   *   function-call access key is submitted on-chain before returning.
   * @returns A single-account array matching {@link NearWalletBase.signIn} result shape.
   */
  async ncSignIn(data?: SignInParams): Promise<NearConnectAccount[]> {
    if (data?.addFunctionCallKey) {
      const { contractId, publicKey, allowMethods, gasAllowance } = data.addFunctionCallKey;
      await this.addFunctionCallAccessKey({
        contractId,
        publicKey,
        methodNames: allowMethods.anyMethod ? [] : allowMethods.methodNames,
        allowance: gasAllowance?.kind === 'limited' ? BigInt(gasAllowance.amount) : undefined,
      });
      return [
        {
          accountId: this.privyConfig.wallet.address,
          publicKey,
        },
      ];
    }

    return [
      {
        accountId: this.privyConfig.wallet.address,
        publicKey: publicKeyFromImplicit(this.privyConfig.wallet.address).toString(),
      },
    ];
  }

  async signOut(_data?: { network?: Network }): Promise<void> {}

  async signAndSendTransaction(params: SignAndSendTransactionParams) {
    return super.signAndSendTransaction({
      receiverId: params.receiverId,
      actions: params.actions.map(toNearAction),
    });
  }

  async signAndSendTransactions(params: SignAndSendTransactionsParams) {
    return super.signAndSendTransactions({
      transactions: params.transactions.map((tx) => ({
        receiverId: tx.receiverId,
        actions: tx.actions.map(toNearAction),
      })),
    });
  }

  /**
   * near-connect shim: signs a NEP-413 message and returns the result in the
   * {@link NearWalletBase.signMessage} shape — string `publicKey` and base64 `signature`.
   *
   * @param params - Message parameters to sign.
   * @returns A signed message matching the near-connect {@link NcSignedMessage} contract.
   */
  async ncSignMessage(params: SignMessageParams): Promise<NcSignedMessage> {
    const { accountId, publicKey, signature } = await this._signMessage(params);
    return {
      accountId,
      publicKey: publicKey.toString(),
      signature: base64.encode(signature),
    };
  }

  /**
   * near-connect shim: creates and signs a meta-transaction (delegate action) for each
   * entry in `params.delegateActions`, returning each borsh-serialised
   * {@link SignedDelegate} as a base64 string.
   **/
  async ncSignDelegateActions(
    params: SignDelegateActionsParams,
  ): Promise<SignDelegateActionsResponse> {
    const signedDelegateActions = await Promise.all(
      params.delegateActions.map(async ({ receiverId, actions }) => {
        const { signedDelegate } = await this.createSignedMetaTransaction({
          receiverId,
          actions: actions.map(toNearAction),
        });
        return base64.encode(encodeSignedDelegate(signedDelegate));
      }),
    );
    return { signedDelegateActions };
  }
}
