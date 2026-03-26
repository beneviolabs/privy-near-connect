import type { ActionStatus } from '../../utils/signing/openSigningPopup';

type SigningExamplesProps = {
  busy: boolean;
  actionStatus: ActionStatus;
  actionError: string | null;
  actionResult: unknown;
  onSignMessage: () => void;
  onSignTransaction: () => void;
  onSignTransactions: () => void;
  onSignDelegateActions: () => void;
};

export function SigningExamples({
  busy,
  actionStatus,
  actionError,
  actionResult,
  onSignMessage,
  onSignTransaction,
  onSignTransactions,
  onSignDelegateActions,
}: SigningExamplesProps) {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Wallet Actions</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 280 }}>
        <button disabled={busy} onClick={onSignMessage}>
          Sign Message
        </button>
        <button disabled={busy} onClick={onSignTransaction}>
          Sign Transaction
        </button>
        <button disabled={busy} onClick={onSignTransactions}>
          Sign Transactions
        </button>
        <button disabled={busy} onClick={onSignDelegateActions}>
          Sign Delegate Action
        </button>
      </div>
      <p>Status: {actionStatus}</p>
      {actionStatus === 'error' && actionError && (
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
          <strong>Error:</strong> {actionError}
        </div>
      )}
      {actionStatus === 'done' && (
        <pre style={{ background: '#f4f4f4', padding: '1rem', overflowX: 'auto' }}>
          {JSON.stringify(actionResult, null, 2)}
        </pre>
      )}
    </div>
  );
}
