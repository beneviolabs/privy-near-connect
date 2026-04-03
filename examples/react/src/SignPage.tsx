import { useEffect, useRef, useState } from 'react';
import { initSigningPage, channelMsg } from '@peerfolio/privy-near-connect/sign-page';
import type { SignPageSession } from '@peerfolio/privy-near-connect/sign-page';
import Privy, { LocalStorage } from '@privy-io/js-sdk-core';

const privy = new Privy({
  appId: sessionStorage.getItem('privy_app_id') ?? import.meta.env.VITE_PRIVY_APP_ID!,
  clientId: sessionStorage.getItem('privy_client_id') ?? import.meta.env.VITE_PRIVY_APP_CLIENT_ID!,
  storage: new LocalStorage(),
});

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
      const message = (e as Error).message;
      console.error('Error during signing:', e);
      setErrorMsg(message);
      setStatus('error');
      // Notify the opener so it can surface the error on the main screen
      window.opener?.postMessage(channelMsg.error(message), window.location.origin);
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
