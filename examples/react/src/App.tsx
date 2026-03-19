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

const GUEST_BOOK_RECEIVER_ID = 'guest-book.near';
const GUEST_BOOK_GAS = '30000000000000';

const guestBookCall1 = {
  type: 'FunctionCall',
  params: {
    methodName: 'add_message',
    args: { text: 'Hello from action 1' },
    gas: GUEST_BOOK_GAS,
    deposit: '0',
  },
};

const guestBookCall2 = {
  type: 'FunctionCall',
  params: {
    methodName: 'add_message',
    args: { text: 'Hello from action 2' },
    gas: GUEST_BOOK_GAS,
    deposit: '0',
  },
};

const TEST_TX_PAYLOAD = {
  receiverId: GUEST_BOOK_RECEIVER_ID,
  actions: [guestBookCall1, guestBookCall2],
};

const TEST_TXS_PAYLOAD = {
  kind: 'signAndSendTransactions',
  params: {
    network: 'mainnet',
    transactions: [
      {
        receiverId: GUEST_BOOK_RECEIVER_ID,
        actions: [guestBookCall1],
      },
      {
        receiverId: GUEST_BOOK_RECEIVER_ID,
        actions: [guestBookCall2],
      },
    ],
  },
};

const TEST_SIGN_IN_PAYLOAD = {
  kind: 'signIn',
  params: { network: 'mainnet', publicKey: 'ed25519:11111111111111111111111111111111' },
};

const TEST_SIGN_OUT_PAYLOAD = {
  kind: 'signOut',
  params: {
    network: 'mainnet',
    publicKey: 'ed25519:11111111111111111111111111111111',
  },
};

function openSigningPopup(
  payload: unknown,
  setStatus: (status: Status) => void,
  setResult: (result: unknown) => void,
  setErrorMsg: (message: string | null) => void,
) {
  const popup = window.open(`${window.location.origin}/#sign`, '_blank');
  if (!popup) {
    setErrorMsg('Popup was blocked');
    setStatus('error');
    return;
  }
  const popupWindow = popup;

  setStatus('opening');

  function onMessage(event: MessageEvent) {
    if (event.source !== popupWindow) return;

    const msg = event.data as ChannelMsg;

    if (msg.type === 'READY') {
      popupWindow.postMessage({ type: 'SIGN_REQUEST', payload }, window.location.origin);
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

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<unknown>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleSignMessage() {
    openSigningPopup(TEST_PAYLOAD, setStatus, setResult, setErrorMsg);
  }

  function handleSignAndSendTransaction() {
    openSigningPopup(TEST_TX_PAYLOAD, setStatus, setResult, setErrorMsg);
  }

  function handleSignIn() {
    openSigningPopup(TEST_SIGN_IN_PAYLOAD, setStatus, setResult, setErrorMsg);
  }

  function handleSignOut() {
    openSigningPopup(TEST_SIGN_OUT_PAYLOAD, setStatus, setResult, setErrorMsg);
  }

  function handleSignAndSendTransactions() {
    openSigningPopup(TEST_TXS_PAYLOAD, setStatus, setResult, setErrorMsg);
  }

  return (
    <div>
      <h1>privy-near-connect example</h1>

      <button onClick={handleSignMessage} disabled={status === 'opening' || status === 'waiting'}>
        Sign Message
      </button>

      <button onClick={handleSignIn} disabled={status === 'opening' || status === 'waiting'}>
        Sign In
      </button>

      <button onClick={handleSignOut} disabled={status === 'opening' || status === 'waiting'}>
        Sign Out
      </button>

      <button
        onClick={handleSignAndSendTransaction}
        disabled={status === 'opening' || status === 'waiting'}
      >
        Sign & Send Transaction
      </button>

      <button
        onClick={handleSignAndSendTransactions}
        disabled={status === 'opening' || status === 'waiting'}
      >
        Sign & Send Transactions
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
