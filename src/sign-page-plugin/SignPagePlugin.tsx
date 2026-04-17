import type Privy from '@privy-io/js-sdk-core';
import { Callout, Flex, Text, Theme } from '@radix-ui/themes';
import type { ThemeProps } from '@radix-ui/themes';
import { useEffect, useRef, useState } from 'react';

import { initSigningPage } from '@/sign-page';
import type { SignPageOptions, SignPageSession } from '@/types';
import { channelMsg } from '@/types';
import { ApprovalScreen } from '@/sign-page-plugin/ApprovalScreen';
import type { PrivyNearWallet } from '@/signing/signer';

/** Visual configuration for the sign-page theme and outer shell. */
export type SignPageTheme = Omit<
  ThemeProps,
  'children' | 'asChild' | 'hasBackground' | 'className' | 'style'
> & {
  /** Custom class name added to the root `<Theme>` element. */
  className?: string;
};

/** Props for the {@link SignPagePlugin} component. */
export type SignPageProps = {
  /** Initialized Privy client used to sign the incoming payload. */
  privy: Privy;
  /** Forwarded to `initSigningPage` — timeout, origin allowlist, wallet override, RPC options. */
  options?: SignPageOptions;
  /** Theme and outer-shell configuration for the signing page. */
  theme?: SignPageTheme;
  /** If true, this component will close the popup window after a successful signature. Defaults to true. */
  autoClose?: boolean;
  /** Called when the user presses "Cancel" or "Reject". Defaults to reporting the cancellation to the opener and closing. */
  onCancel?: () => void;
};

type Status =
  | { kind: 'waiting' }
  | { kind: 'ready'; session: SignPageSession }
  | { kind: 'signing'; session: SignPageSession }
  | { kind: 'error'; message: string };

/**
 * Drop-in React component that renders the signing page UI and drives the
 * opener handshake via {@link initSigningPage}. Screens are selected based on
 * the incoming payload's `kind`.
 *
 * The component wraps its output in a Radix Themes `<Theme>` element, so the
 * full Radix Themes stylesheet must be imported once in the consuming app:
 *
 * ```ts
 * import '@radix-ui/themes/styles.css';
 * import '@peerfolio/privy-near-connect/sign-page-plugin/theme.css';
 * ```
 *
 * Customize the look by passing `theme` props or by overriding the Radix
 * Themes CSS variables (`--accent-9`, `--gray-9`, etc.) through a custom
 * `theme.className`.
 *
 * @param props - Component props.
 * @returns The interactive signing page UI.
 */
export function SignPagePlugin(props: SignPageProps) {
  const { privy, options, theme, autoClose = true, onCancel } = props;
  const accentColor = theme?.accentColor ?? 'violet';
  const grayColor = theme?.grayColor ?? 'slate';
  const radius = theme?.radius ?? 'medium';
  const scaling = theme?.scaling ?? '100%';
  const appearance = theme?.appearance ?? 'light';
  const panelBackground = theme?.panelBackground ?? 'solid';
  const [status, setStatus] = useState<Status>({ kind: 'waiting' });
  const [currentAccountId, setCurrentAccountId] = useState<string>();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    resolveCurrentAccountId(privy, options?.wallet)
      .then((accountId) => setCurrentAccountId(accountId))
      .catch(() => undefined);

    initSigningPage(privy, options)
      .then((session) => setStatus({ kind: 'ready', session }))
      .catch((e: Error) => setStatus({ kind: 'error', message: e.message }));
  }, [privy, options]);

  const handleApprove = () => {
    if (status.kind !== 'ready') return;
    const session = status.session;
    setStatus({ kind: 'signing', session });
    session.sign().catch((e: Error) => {
      setStatus({ kind: 'error', message: e.message });
    });
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    if (autoClose) window.close();
  };

  const rootClass = theme?.className ? `pnc-root ${theme.className}` : 'pnc-root';

  return (
    <Theme
      accentColor={accentColor}
      grayColor={grayColor}
      radius={radius}
      scaling={scaling}
      appearance={appearance}
      panelBackground={panelBackground}
      className={rootClass}
      hasBackground={false}
    >
      <div className="pnc-page">
        <div className="pnc-card">
          {renderBody(status, currentAccountId, handleApprove, handleCancel)}
        </div>
      </div>
    </Theme>
  );
}

function renderBody(
  status: Status,
  currentAccountId: string | undefined,
  onApprove: () => void,
  onCancel: () => void,
) {
  if (status.kind === 'waiting') {
    return (
      <Flex align="center" justify="center" p="5" flexGrow="1">
        <Text size="2" color="gray">
          Waiting for signing request…
        </Text>
      </Flex>
    );
  }

  if (status.kind === 'error') {
    return (
      <Flex p="4" flexGrow="1" align="center">
        <Callout.Root color="red" variant="soft" size="1" style={{ width: '100%' }}>
          <Callout.Text>{status.message}</Callout.Text>
        </Callout.Root>
      </Flex>
    );
  }

  const { session } = status;
  return (
    <ApprovalScreen
      payload={session.payload}
      origin={session.targetOrigin}
      currentAccountId={currentAccountId}
      isSigning={status.kind === 'signing'}
      onApprove={onApprove}
      onCancel={onCancel}
    />
  );
}

async function resolveCurrentAccountId(
  privy: Privy,
  wallet?: PrivyNearWallet,
): Promise<string | undefined> {
  if (wallet?.address) return wallet.address;

  const { user } = await privy.user.get();
  const linkedWallet = user.linked_accounts.find(isPrivyNearWallet);
  return linkedWallet?.address;
}

function isPrivyNearWallet(account: unknown): account is PrivyNearWallet {
  if (typeof account !== 'object' || account === null) return false;

  const typedAccount = account as {
    type?: unknown;
    chain_type?: unknown;
    address?: unknown;
  };

  return (
    typedAccount.type === 'wallet' &&
    typedAccount.chain_type === 'near' &&
    typeof typedAccount.address === 'string'
  );
}
