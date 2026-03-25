import { appUrl, ROUTES } from '../routes';

// Inline the protocol shape since ChannelMsg is internal to the library
export type ChannelMsg =
  | { type: 'READY' }
  | { type: 'SIGN_REQUEST'; payload: unknown }
  | { type: 'RESULT'; result: unknown }
  | { type: 'ERROR'; message: string };

export type ActionStatus = 'idle' | 'opening' | 'waiting' | 'done' | 'error';

/** Opens the signing popup and coordinates the READY / SIGN_REQUEST / RESULT handshake. */
export function openSigningPopup(
  payload: unknown,
  setStatus: (s: ActionStatus) => void,
  setResult: (r: unknown) => void,
  setError: (e: string | null) => void,
) {
  const popup = window.open(appUrl(ROUTES.sign), '_blank');
  if (!popup) {
    setError('Popup was blocked');
    setStatus('error');
    return;
  }

  setStatus('opening');
  let settled = false;

  function cleanup() {
    settled = true;
    window.removeEventListener('message', onMessage);
    clearInterval(closedPoll);
  }

  // Detect the user closing the popup before completing
  const closedPoll = setInterval(() => {
    if (popup.closed && !settled) {
      setError('Signing popup was closed');
      setStatus('error');
      cleanup();
    }
  }, 500);

  function onMessage(event: MessageEvent) {
    if (event.source !== popup) return;
    const msg = event.data as ChannelMsg;

    if (msg.type === 'READY') {
      popup!.postMessage({ type: 'SIGN_REQUEST', payload }, window.location.origin);
      setStatus('waiting');
    } else if (msg.type === 'RESULT') {
      setResult(msg.result);
      setStatus('done');
      cleanup();
    } else if (msg.type === 'ERROR') {
      setError(msg.message);
      setStatus('error');
      cleanup();
    }
  }

  window.addEventListener('message', onMessage);
}
