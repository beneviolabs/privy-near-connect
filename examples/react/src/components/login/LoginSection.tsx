import type { FormEvent } from 'react';

type LoginSectionProps = {
  loginStep: 'email' | 'code';
  email: string;
  code: string;
  loginLoading: boolean;
  loginError: string | null;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSendCode: (e: FormEvent) => void;
  onVerifyCode: (e: FormEvent) => void;
  onBack: () => void;
};

export function LoginSection({
  loginStep,
  email,
  code,
  loginLoading,
  loginError,
  onEmailChange,
  onCodeChange,
  onSendCode,
  onVerifyCode,
  onBack,
}: LoginSectionProps) {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Login</h2>
      {loginStep === 'email' ? (
        <form
          onSubmit={onSendCode}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}
        >
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={loginLoading}
          />
          <button type="submit" disabled={loginLoading || !email.trim()}>
            {loginLoading ? 'Sending...' : 'Send Code'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={onVerifyCode}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}
        >
          <label>Code sent to {email}</label>
          <input
            type="text"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="6-digit code"
            required
            autoFocus
            disabled={loginLoading}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={loginLoading || !code.trim()}>
              {loginLoading ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" onClick={onBack}>
              Back
            </button>
          </div>
        </form>
      )}
      {loginError && <p style={{ color: 'red', marginTop: 8 }}>{loginError}</p>}
    </div>
  );
}
