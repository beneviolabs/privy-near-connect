import { useEffect, useState } from 'react';
import Privy, { LocalStorage, create as createWallet } from '@privy-io/js-sdk-core';
import { SideNav } from './components/sidebar/SideNav';
import { LoginSection } from './components/login/LoginSection';
import { SigningExamples } from './components/signing/SigningExamples';
import {
  TEST_DELEGATE_PAYLOAD,
  TEST_MESSAGE_PAYLOAD,
  TEST_TX_PAYLOAD,
  TEST_TXS_PAYLOAD,
} from './utils/signing/payloads';
import { openSigningPopup, type ActionStatus } from './utils/signing/openSigningPopup';

function makePrivy(appId: string, clientId: string): Privy {
  return new Privy({ appId, clientId, storage: new LocalStorage() });
}

type UserWithLinkedAccounts = {
  linked_accounts?: Array<{ type?: string; chain_type?: string }>;
};

function hasNearWallet(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false;
  const typedUser = user as UserWithLinkedAccounts;
  return (typedUser.linked_accounts ?? []).some(
    (account) => account.type === 'wallet' && account.chain_type === 'near',
  );
}

async function ensureNearWallet(privy: Privy, user: unknown): Promise<unknown | null> {
  if (!user) return null;
  if (hasNearWallet(user)) return user;
  console.log('Ensuring user has linked NEAR wallet', { user });

  await createWallet(
    {
      fetchPrivyRoute: privy.fetchPrivyRoute.bind(privy),
      getCompiledPath: privy.getCompiledPath.bind(privy),
      app: { appId: privy.app.appId },
    },
    { request: { chain_type: 'near' } },
  );

  const { user: refreshedUser } = await privy.user.get().catch(() => ({ user: null }));
  if (refreshedUser && hasNearWallet(refreshedUser)) return refreshedUser;

  return null;
}

export default function App() {
  const [appId, setAppId] = useState<string>(import.meta.env.VITE_PRIVY_APP_ID ?? '');
  const [clientId, setClientId] = useState<string>(import.meta.env.VITE_PRIVY_APP_CLIENT_ID ?? '');
  const [privy, setPrivy] = useState<Privy | null>(() => {
    const id = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
    const cId = import.meta.env.VITE_PRIVY_APP_CLIENT_ID as string | undefined;
    if (id && cId) return makePrivy(id, cId);
    return null;
  });

  const [user, setUser] = useState<unknown>(null);
  const [loginStep, setLoginStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [actionStatus, setActionStatus] = useState<ActionStatus>('idle');
  const [actionResult, setActionResult] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!privy) {
      setUser(null);
      return;
    }

    let isEffectCurrent = true;

    privy.user
      .get()
      .then(async ({ user: currentUser }) => {
        if (!isEffectCurrent) return;
        const ensuredUser = await ensureNearWallet(privy, currentUser ?? null);
        if (!isEffectCurrent) return;
        setUser(ensuredUser);
      })
      .catch(() => {
        if (!isEffectCurrent) return;
        setUser(null);
      });

    return () => {
      isEffectCurrent = false;
    };
  }, [privy]);

  function handleApply() {
    if (!appId.trim() || !clientId.trim()) return;
    setPrivy(makePrivy(appId.trim(), clientId.trim()));
    setUser(null);
    setLoginStep('email');
    setEmail('');
    setCode('');
    setLoginError(null);
    setActionStatus('idle');
    setActionResult(null);
    setActionError(null);
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!privy || !email.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      await privy.auth.email.sendCode(email.trim());
      setLoginStep('code');
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!privy || !code.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const result = await privy.auth.email.loginWithCode(email.trim(), code.trim());
      const ensuredUser = await ensureNearWallet(privy, result.user);
      setUser(ensuredUser);
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    if (!privy) return;
    await privy.auth.logout().catch(() => {
      // best-effort
    });
    setUser(null);
    setLoginStep('email');
    setCode('');
    setLoginError(null);
    setActionStatus('idle');
    setActionResult(null);
    setActionError(null);
  }

  const busy = actionStatus === 'opening' || actionStatus === 'waiting';

  let mainContent: React.ReactNode;

  if (!privy) {
    mainContent = (
      <p style={{ color: '#888' }}>
        Enter your Privy credentials in the panel on the left and click Apply.
      </p>
    );
  } else if (!user) {
    mainContent = (
      <LoginSection
        loginStep={loginStep}
        email={email}
        code={code}
        loginLoading={loginLoading}
        loginError={loginError}
        onEmailChange={setEmail}
        onCodeChange={setCode}
        onSendCode={handleSendCode}
        onVerifyCode={handleVerifyCode}
        onBack={() => {
          setLoginStep('email');
          setCode('');
          setLoginError(null);
        }}
      />
    );
  } else {
    mainContent = (
      <SigningExamples
        busy={busy}
        actionStatus={actionStatus}
        actionError={actionError}
        actionResult={actionResult}
        onLogout={handleLogout}
        onSignMessage={() =>
          openSigningPopup(TEST_MESSAGE_PAYLOAD, setActionStatus, setActionResult, setActionError)
        }
        onSignTransaction={() =>
          openSigningPopup(TEST_TX_PAYLOAD, setActionStatus, setActionResult, setActionError)
        }
        onSignTransactions={() =>
          openSigningPopup(TEST_TXS_PAYLOAD, setActionStatus, setActionResult, setActionError)
        }
        onSignDelegateActions={() =>
          openSigningPopup(TEST_DELEGATE_PAYLOAD, setActionStatus, setActionResult, setActionError)
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <SideNav
        appId={appId}
        clientId={clientId}
        user={user}
        onAppIdChange={setAppId}
        onClientIdChange={setClientId}
        onApply={handleApply}
      />
      <main style={{ flex: 1, padding: 32 }}>{mainContent}</main>
    </div>
  );
}
