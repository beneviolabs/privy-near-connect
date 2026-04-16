import type Privy from '@privy-io/js-sdk-core';
import { Callout, Flex, Text, Theme } from '@radix-ui/themes';
import type { ThemeProps } from '@radix-ui/themes';
import { useEffect, useRef, useState } from 'react';

import { initSigningPage } from '@/sign-page';
import type { SignPageOptions, SignPageSession } from '@/types';
import { channelMsg } from '@/types';
import { ApprovalScreen } from '@/sign-page-plugin/ApprovalScreen';
import type { PrivyNearWallet } from '@/signing/signer';

/** Props for the {@link SignPage} component. */
export type SignPageProps = {
  /** Initialized Privy client used to sign the incoming payload. */
  privy: Privy;
  /** Forwarded to `initSigningPage` — timeout, origin allowlist, wallet override, RPC options. */
  options?: SignPageOptions;
  /** Radix Themes accent color. Default: `"violet"`. */
  accentColor?: ThemeProps['accentColor'];
  /** Radix Themes gray color. Default: `"slate"`. */
  grayColor?: ThemeProps['grayColor'];
  /** Radix Themes radius. Default: `"medium"`. */
  radius?: ThemeProps['radius'];
  /** Radix Themes scaling. Default: `"100%"`. */
  scaling?: ThemeProps['scaling'];
  /** Radix Themes appearance (light/dark). Default: `"light"`. */
  appearance?: ThemeProps['appearance'];
  /** Radix Themes panel background. Default: `"solid"`. */
  panelBackground?: ThemeProps['panelBackground'];
  /** Custom class name added to the root `<Theme>` element. */
  className?: string;
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
 * When signing fails, the error is automatically relayed to the opener via
 * an `ERROR` channel message — consumers do not need to post it themselves.
 *
 * The component wraps its output in a Radix Themes `<Theme>` element, so the
 * full Radix Themes stylesheet must be imported once in the consuming app:
 *
 * ```ts
 * import '@radix-ui/themes/styles.css';
 * import '@peerfolio/privy-near-connect/sign-page-plugin/theme.css';
 * ```
 *
 * Customize the look by passing Theme props (`accentColor`, `grayColor`,
 * `radius`, `scaling`, `appearance`, `panelBackground`) or by overriding the
 * Radix Themes CSS variables (`--accent-9`, `--gray-9`, etc.) scoped to the
 * `.pnc-root` class or a custom `className`.
 *
 * @param props - Component props.
 */
export function SignPage(props: SignPageProps) {
  const {
    privy,
    options,
    className,
    autoClose = true,
    onCancel,
    accentColor = 'violet',
    grayColor = 'slate',
    radius = 'medium',
    scaling = '100%',
    appearance = 'light',
    panelBackground = 'solid',
  } = props;
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
      reportError(session.targetOrigin, e.message);
      setStatus({ kind: 'error', message: e.message });
    });
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    if (status.kind === 'ready' || status.kind === 'signing') {
      reportError(status.session.targetOrigin, 'User cancelled the request');
    }
    if (autoClose) window.close();
  };

  const rootClass = className ? `pnc-root ${className}` : 'pnc-root';

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
      <div className="pnc-card">
        {renderBody(status, currentAccountId, handleApprove, handleCancel)}
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

function reportError(targetOrigin: string, message: string) {
  try {
    window.opener?.postMessage(channelMsg.error(message), targetOrigin);
  } catch {
    /* opener already closed — nothing to report to */
  }
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
