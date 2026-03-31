import { NearConnector, NearWalletBase } from '@hot-labs/near-connect';
import { useEffect, useRef, useState } from 'react';

import type {
  SignMessageParams,
  SignAndSendTransactionParams,
  SignAndSendTransactionsParams,
  SignDelegateActionsParams,
} from '@hot-labs/near-connect';
import {
  TEST_MESSAGE_PAYLOAD,
  TEST_TX_PAYLOAD,
  TEST_TXS_PAYLOAD,
  TEST_DELEGATE_PAYLOAD,
  payloadWithNetwork,
} from '../../utils/signing/payloads';

type ActionStatus = 'idle' | 'pending' | 'done' | 'error';

const connector = new NearConnector({
  manifest: '/manifest.json',
  network: 'mainnet',
});

type Props = {
  network: 'testnet' | 'mainnet';
  /** When true, automatically connects myprivywallet without showing the wallet selector. */
  isLoggedIn: boolean;
};

export function SigningExamples({ network, isLoggedIn }: Props) {
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionStatus>('idle');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether the user explicitly disconnected so the auto-connect
  // effect does not immediately reconnect myprivywallet after a manual disconnect.
  const manuallyDisconnected = useRef(false);

  useEffect(() => {
    const onSignIn = async () => {
      const w = await connector.wallet();
      const accounts = await w.getAccounts();
      setWallet(w);
      setAccountId(accounts[0]?.accountId ?? null);
    };
    const onSignOut = () => {
      setWallet(null);
      setAccountId(null);
    };
    connector.on('wallet:signIn', onSignIn);
    connector.on('wallet:signOut', onSignOut);
    return () => {
      connector.off('wallet:signIn', onSignIn);
      connector.off('wallet:signOut', onSignOut);
    };
  }, []);

  useEffect(() => {
    connector.network = network;
  }, [network]);

  useEffect(() => {
    if (!isLoggedIn) {
      // Reset so the next login auto-connects again.
      manuallyDisconnected.current = false;
      return;
    }
    if (!accountId && !manuallyDisconnected.current) {
      connector.connect({ walletId: 'myprivywallet' });
    }
  }, [isLoggedIn, accountId]);

  async function handleConnect() {
    if (accountId) {
      manuallyDisconnected.current = true;
      await connector.disconnect();
    } else {
      manuallyDisconnected.current = false;
      await connector.connect();
    }
  }

  async function runAction(fn: () => Promise<unknown>) {
    setStatus('pending');
    setResult(null);
    setError(null);
    try {
      setResult(await fn());
      setStatus('done');
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  function handleSignMessage() {
    const p = payloadWithNetwork(TEST_MESSAGE_PAYLOAD, network) as unknown as SignMessageParams;
    return runAction(() => wallet!.signMessage(p));
  }

  function handleSignTransaction() {
    const p = payloadWithNetwork(
      TEST_TX_PAYLOAD,
      network,
    ) as unknown as SignAndSendTransactionParams;
    return runAction(() => wallet!.signAndSendTransaction(p));
  }

  function handleSignTransactions() {
    const p = payloadWithNetwork(
      TEST_TXS_PAYLOAD,
      network,
    ) as unknown as SignAndSendTransactionsParams;
    return runAction(() => wallet!.signAndSendTransactions(p));
  }

  function handleSignDelegateActions() {
    const p = payloadWithNetwork(
      TEST_DELEGATE_PAYLOAD,
      network,
    ) as unknown as SignDelegateActionsParams;
    return runAction(() => wallet!.signDelegateActions(p));
  }

  const busy = status === 'pending';

  return (
    <div style={{ marginTop: 32, borderTop: '2px solid #e0e0e0', paddingTop: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <button onClick={handleConnect}>
          {accountId ? `${accountId} (disconnect)` : 'Connect other wallet'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 280 }}>
        <button disabled={!wallet || busy} onClick={handleSignMessage}>
          Sign Message
        </button>
        <button disabled={!wallet || busy} onClick={handleSignTransaction}>
          Sign Transaction
        </button>
        <button disabled={!wallet || busy} onClick={handleSignTransactions}>
          Sign Transactions
        </button>
        <button disabled={!wallet || busy} onClick={handleSignDelegateActions}>
          Sign Delegate Action
        </button>
      </div>
      <p>Status: {status}</p>
      {status === 'error' && error && (
        <div
          style={{
            marginTop: 8,
            padding: '12px 16px',
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            borderRadius: 6,
            color: '#c53030',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}
      {status === 'done' && (
        <pre style={{ background: '#f4f4f4', padding: '1rem', overflowX: 'auto' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
