import { rawSign } from '@privy-io/js-sdk-core';
import { toHex } from 'viem';
import type Privy from '@privy-io/js-sdk-core';
import type { SignAndSendTransactionParams, SignMessageParams } from '@hot-labs/near-connect';
import type {
  Account as NearConnectAccount,
  Network,
} from '@hot-labs/near-connect/build/types/index.js';
import type { FinalExecutionOutcome } from '@near-js/types';
import type { SignedMessage } from 'near-api-js';
import { actions, Account, JsonRpcProvider, PublicKey, Signer } from 'near-api-js';
import { signMessage as signNep413Message } from 'near-api-js/nep413';

import { hexSignatureToBytes, publicKeyFromImplicit, toNearAction } from '@/signing/utils';
import type { SignOutParams } from '@/types';
import type { PrivyNearWallet } from '@/signing/signer';

type NativeSignAndSendTransactionArgs = Parameters<Account['signAndSendTransaction']>[0];
type NativeSignAndSendTransactionResult = Awaited<ReturnType<Account['signAndSendTransaction']>>;

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
  mainnet: 'https://rpc.mainnet.near.org',
  testnet: 'https://rpc.testnet.near.org',
};

/**
 * Creates a {@link JsonRpcProvider} from optional network/RPC overrides.
 *
 * @param network - NEAR network. Defaults to `mainnet`.
 * @param rpcOptions - Optional RPC endpoint overrides.
 * @returns A configured `JsonRpcProvider`.
 */
export function createProvider(network?: Network, rpcOptions?: RpcOptions): JsonRpcProvider {
  return new JsonRpcProvider({ url: rpcOptions?.url ?? NEAR_RPC_URLS[network ?? 'mainnet'] });
}

/**
 * near-api-js `Signer` implementation that delegates raw-byte signing to a
 * Privy embedded wallet.
 *
 * The base `Signer` class calls `signBytes` with the SHA-256 hash of the
 * serialised transaction, so this implementation forwards it directly to Privy
 * as a pre-hashed `hash` parameter.
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
    return hexSignatureToBytes(hexSignature);
  }
}

/**
 * NEAR `Account` subclass that uses a {@link PrivySigner} for all signing operations.
 *
 * Drop-in replacement for the standard `Account` wherever a Privy embedded wallet
 * should be the transaction signer.
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

  /**
   * Signs a NEP-413 message with this account's Privy-backed signer.
   *
   * @param params - Message parameters to sign.
   * @returns A signed message payload in the native `near-api-js` NEP-413 shape.
   */
  async signMessage(params: SignMessageParams): Promise<SignedMessage> {
    return signNep413Message({
      signerAccount: this,
      payload: params,
    });
  }

  /**
   * Returns the NEAR account information represented by this configured Privy wallet.
   *
   * @returns A single-account array matching near-connect's sign-in result shape.
   */
  async signIn(): Promise<NearConnectAccount[]> {
    return [
      {
        accountId: this.privyConfig.wallet.address,
        publicKey: publicKeyFromImplicit(this.privyConfig.wallet.address).toString(),
      },
    ];
  }

  /**
   * Removes a function-call access key from this configured wallet account.
   *
   * @param params - Key deletion parameters including the target public key.
   * @returns The final execution outcome from the NEAR network.
   */
  async signOut(params: SignOutParams): Promise<FinalExecutionOutcome> {
    return (await this.signAndSendTransaction({
      receiverId: this.privyConfig.wallet.address,
      actions: [actions.deleteKey(PublicKey.fromString(params.publicKey))],
    })) as unknown as FinalExecutionOutcome;
  }

  /**
   * Signs and submits a NEAR transaction using this account's embedded-wallet signer.
   *
   * Accepts either the native near-api-js transaction args or the connector-style
   * `SignAndSendTransactionParams` payload and normalises connector actions as needed.
   *
   * @param params - Native near-api-js transaction args or connector transaction params.
   * @returns The final execution outcome from the NEAR network.
   */
  async signAndSendTransaction(
    params: SignAndSendTransactionParams,
  ): Promise<FinalExecutionOutcome>;
  async signAndSendTransaction(
    params: NativeSignAndSendTransactionArgs,
  ): Promise<NativeSignAndSendTransactionResult>;
  async signAndSendTransaction(
    params: NativeSignAndSendTransactionArgs | SignAndSendTransactionParams,
  ): Promise<NativeSignAndSendTransactionResult | FinalExecutionOutcome> {
    if (isConnectorTransactionParams(params)) {
      return (await super.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions.map(toNearAction),
      })) as unknown as FinalExecutionOutcome;
    }

    return super.signAndSendTransaction(params);
  }
}

function isConnectorTransactionParams(
  params: NativeSignAndSendTransactionArgs | SignAndSendTransactionParams,
): params is SignAndSendTransactionParams {
  return (
    'network' in params ||
    'signerId' in params ||
    params.actions.some(
      (action) => typeof action === 'object' && action !== null && 'type' in action,
    )
  );
}
