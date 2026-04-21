import { ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons';

import {
  ActionButton,
  ApprovalHeader,
  ApprovalNotice,
  type OriginInfo,
} from '@/sign-page-plugin/components';
import { ConnectSections } from '@/sign-page-plugin/screens/ConnectSections';
import { SignMessageSections } from '@/sign-page-plugin/screens/SignMessageSections';
import {
  buildTransactionView,
  TransactionSections,
} from '@/sign-page-plugin/screens/TransactionSections';
import type { SigningPayload } from '@/types';

type ApprovalScreenProps = {
  payload: SigningPayload;
  origin: string;
  currentAccountId?: string;
  isSigning: boolean;
  onApprove: () => void;
  onCancel: () => void;
};

/**
 * Renders the shared approval UI for all sign-page payloads.
 *
 * @param props - Payload metadata and approval handlers.
 * @returns The approval screen for the current signing request.
 */
export function ApprovalScreen({
  payload,
  origin,
  currentAccountId,
  isSigning,
  onApprove,
  onCancel,
}: ApprovalScreenProps) {
  const originInfo = parseOrigin(origin);

  switch (payload.kind) {
    case 'signIn':
    case 'signInAndSignMessage': {
      const message =
        payload.kind === 'signInAndSignMessage' ? payload.messageParams?.message : undefined;
      return (
        <>
          <div className="pnc-card__body">
            <ApprovalHeader originInfo={originInfo} title="Connect to" />
            <ConnectSections message={message} />
          </div>
          <div className="pnc-card__footer">
            <ApprovalNotice
              tone="warning"
              text="Only connect to apps you trust"
              icon={<ExclamationTriangleIcon />}
            />
            <ActionButton tone="secondary" onClick={onCancel} disabled={isSigning}>
              Cancel
            </ActionButton>
            <ActionButton tone="primary" onClick={onApprove} disabled={isSigning}>
              {isSigning ? 'Connecting...' : 'Connect'}
            </ActionButton>
          </div>
        </>
      );
    }

    case 'signMessage':
      return (
        <>
          <div className="pnc-card__body">
            <ApprovalHeader originInfo={originInfo} title="Sign message from" />
            <SignMessageSections message={payload.message} />
          </div>
          <div className="pnc-card__footer">
            <ApprovalNotice
              tone="info"
              text="Signing messages do not incur fees"
              icon={<InfoCircledIcon />}
            />
            <ActionButton tone="secondary" onClick={onCancel} disabled={isSigning}>
              Cancel
            </ActionButton>
            <ActionButton tone="primary" onClick={onApprove} disabled={isSigning}>
              {isSigning ? 'Signing...' : 'Confirm'}
            </ActionButton>
          </div>
        </>
      );

    case 'signAndSendTransaction':
    case 'signAndSendTransactions':
    case 'signDelegateActions': {
      const request = buildTransactionView(payload, currentAccountId);

      return (
        <>
          <div className="pnc-card__body">
            <ApprovalHeader originInfo={originInfo} title={request.title} />
            <TransactionSections request={request} />
          </div>
          <div className="pnc-card__footer">
            <ActionButton tone="secondary" onClick={onCancel} disabled={isSigning}>
              Cancel
            </ActionButton>
            <ActionButton tone="primary" onClick={onApprove} disabled={isSigning}>
              {isSigning ? 'Confirming...' : 'Confirm'}
            </ActionButton>
          </div>
        </>
      );
    }
  }
}

function parseOrigin(origin: string): OriginInfo {
  try {
    const url = new URL(origin);
    return {
      host: url.host,
      faviconUrl: `${url.origin}/favicon.ico`,
    };
  } catch {
    return {
      host: origin,
      faviconUrl: '',
    };
  }
}
