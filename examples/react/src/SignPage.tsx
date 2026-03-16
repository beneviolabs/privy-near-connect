import { useEffect, useRef, useState } from 'react';
import { initSigningPage } from '@peerfolio/privy-near-connect/sign-page';
import type { SignPageSession } from '@peerfolio/privy-near-connect/sign-page';
import { privy } from './privy';

type Status = 'waiting' | 'ready' | 'signing' | 'error';

export default function SignPage() {
  const [status, setStatus] = useState<Status>('waiting');
  const [session, setSession] = useState<SignPageSession | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoke
    if (initialized.current) return;
    initialized.current = true;

    initSigningPage(privy)
      .then((s) => {
        setSession(s);
        setStatus('ready');
      })
      .catch((e: Error) => {
        setErrorMsg(e.message);
        setStatus('error');
      });
  }, []);

  async function handleSign() {
    if (!session) return;
    setStatus('signing');
    try {
      await session.sign();
    } catch (e) {
      console.error('Error during signing:', e);
      setErrorMsg((e as Error).message);
      setStatus('error');
    }
  }

  if (status === 'waiting') {
    return <p>Waiting for signing request...</p>;
  }

  if (status === 'error') {
    return (
      <div>
        <h1>Error</h1>
        <p style={{ color: 'red' }}>{errorMsg}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Sign Request</h1>
      <pre style={{ background: '#f4f4f4', padding: '1rem' }}>
        {JSON.stringify(session?.payload, null, 2)}
      </pre>
      <button onClick={handleSign} disabled={status === 'signing'}>
        {status === 'signing' ? 'Signing...' : 'Sign'}
      </button>
    </div>
  );
}
