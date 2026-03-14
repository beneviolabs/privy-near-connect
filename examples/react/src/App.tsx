import { useState } from 'react';

// Inline the protocol shape since ChannelMsg is internal to the library
type ChannelMsg =
  | { type: 'READY' }
  | { type: 'SIGN_REQUEST'; payload: unknown }
  | { type: 'RESULT'; result: unknown }
  | { type: 'ERROR'; message: string };

type Status = 'idle' | 'opening' | 'waiting' | 'done' | 'error';

const TEST_PAYLOAD = {
  message: 'Hello, NEAR!',
  recipient: 'example.near',
  nonce: crypto.getRandomValues(new Uint8Array(32)),
};

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<unknown>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleSignMessage() {
    const popup = window.open(`${window.location.origin}/#sign`, '_blank');
    if (!popup) {
      setErrorMsg('Popup was blocked');
      setStatus('error');
      return;
    }

    setStatus('opening');

    function onMessage(event: MessageEvent) {
      // Manually simulate executor for now
      if (event.source !== popup) return;

      const msg = event.data as ChannelMsg;

      if (msg.type === 'READY') {
        popup.postMessage({ type: 'SIGN_REQUEST', payload: TEST_PAYLOAD }, window.location.origin);
        setStatus('waiting');
      } else if (msg.type === 'RESULT') {
        setResult(msg.result);
        setStatus('done');
        window.removeEventListener('message', onMessage);
      } else if (msg.type === 'ERROR') {
        setErrorMsg(msg.message);
        setStatus('error');
        window.removeEventListener('message', onMessage);
      }
    }

    window.addEventListener('message', onMessage);
  }

  return (
    <div>
      <h1>privy-near-connect example</h1>

      <button onClick={handleSignMessage} disabled={status === 'opening' || status === 'waiting'}>
        Sign Message
      </button>

      <p>Status: {status}</p>

      {status === 'error' && <p style={{ color: 'red' }}>{errorMsg}</p>}

      {status === 'done' && (
        <pre style={{ background: '#f4f4f4', padding: '1rem' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
