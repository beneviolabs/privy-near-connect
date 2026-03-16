// @privy-io/js-sdk-core expects Buffer to be available as a global in the browser
import { Buffer } from 'buffer';
(globalThis as Record<string, unknown>).Buffer = Buffer;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import SignPage from './SignPage';

const isSignPage = window.location.hash === '#sign';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSignPage ? <SignPage /> : <App />}
  </StrictMode>,
);
