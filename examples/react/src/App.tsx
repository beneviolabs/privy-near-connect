import { useEffect, useState } from 'react';
import Privy, { LocalStorage, create as createWallet } from '@privy-io/js-sdk-core';
import { SideNav } from './components/sidebar/SideNav';
import { LoginSection } from './components/login/LoginSection';
import { SigningExamples } from './components/signing/SigningExamples';

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
    if (id && cId) {
      sessionStorage.setItem('privy_app_id', id);
      sessionStorage.setItem('privy_client_id', cId);
      return makePrivy(id, cId);
    }
    return null;
  });

  const [user, setUser] = useState<unknown>(null);
  const [loginStep, setLoginStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [network, setNetwork] = useState<'testnet' | 'mainnet'>('testnet');

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
    sessionStorage.setItem('privy_app_id', appId.trim());
    sessionStorage.setItem('privy_client_id', clientId.trim());
    setPrivy(makePrivy(appId.trim(), clientId.trim()));
    setUser(null);
    setLoginStep('email');
    setEmail('');
    setCode('');
    setLoginError(null);
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
  }

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
      <>
        <div style={{ marginBottom: 12 }}>
          <button onClick={handleLogout}>Logout from Privy</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, marginRight: 12 }}>Network:</label>
          <label style={{ fontSize: 13, marginRight: 12 }}>
            <input
              type="radio"
              name="network"
              value="testnet"
              checked={network === 'testnet'}
              onChange={() => setNetwork('testnet')}
              style={{ marginRight: 6 }}
            />
            Testnet
          </label>
          <label style={{ fontSize: 13 }}>
            <input
              type="radio"
              name="network"
              value="mainnet"
              checked={network === 'mainnet'}
              onChange={() => setNetwork('mainnet')}
              style={{ marginRight: 6 }}
            />
            Mainnet
          </label>
        </div>

        <SigningExamples network={network} isLoggedIn={user != null} />
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            background: '#fffaf0',
            border: '1px solid #f6ad55',
            borderRadius: 6,
            color: '#7a5a00',
            fontSize: 12,
            maxWidth: 620,
          }}
        >
          Sign Transaction / Sign Transactions can fail with errors like{' '}
          <strong>"Access key does not exist at block height"</strong> if the wallet is not
          funded/initialized on the selected network.
        </div>
      </>
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
      <main style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>{mainContent}</div>
        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 20,
            paddingTop: 16,
            marginTop: 32,
            borderTop: '1px solid #e0e0e0',
            fontSize: 13,
            color: '#555',
          }}
        >
          <a
            href="https://github.com/beneviolabs/privy-near-connect"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: '#333',
              textDecoration: 'none',
            }}
          >
            <svg
              height="18"
              width="18"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            privy-near-connect
          </a>
          <a
            href="https://peerfolio.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: '#333',
              textDecoration: 'none',
            }}
          >
            <img src="https://peerfolio.app/favicon-32x32.png" width={16} height={16} alt="" />
            Built by Peerfolio
          </a>
        </footer>
      </main>
    </div>
  );
}
