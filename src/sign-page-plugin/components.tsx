import type { ConnectorAction } from '@hot-labs/near-connect/build/actions/types.js';
import { CheckCircledIcon, GlobeIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import {
  Avatar,
  Badge,
  Button as ThemedButton,
  Card,
  DataList,
  Heading,
  Text,
} from '@radix-ui/themes';
import type { ComponentProps, ReactNode } from 'react';

import type { ActionSummary } from '@/sign-page-plugin/utils/actions';
import { summarizeAction } from '@/sign-page-plugin/utils/actions';

/** Display-friendly origin metadata used by approval primitives. */
export type OriginInfo = {
  host: string;
  faviconUrl: string;
};

/** Label-value row used by summary surfaces and transaction detail fields. */
export type SummaryRow = {
  label: string;
  value: string;
};

type ActionButtonProps = Omit<ComponentProps<typeof ThemedButton>, 'variant'> & {
  tone: 'primary' | 'secondary';
};

type SectionProps = {
  title: string;
  surface?: 'card' | 'none';
  children: ReactNode;
};

type ApprovalHeaderProps = {
  originInfo: OriginInfo;
  eyebrow: string;
  title?: string;
  description?: string;
  prominentTitle?: boolean;
};

type ApprovalNoticeProps = {
  tone: 'info' | 'warning';
  text: string;
  icon: ReactNode;
};

type TransactionGroupCardProps = {
  receiverId: string;
  transactionIndex: number;
  actions: ConnectorAction[];
};

/** Renders the shared approval header with origin branding and title copy. */
export function ApprovalHeader({
  originInfo,
  eyebrow,
  title,
  description,
  prominentTitle = false,
}: ApprovalHeaderProps) {
  return (
    <div className="pnc-approval__header">
      <Avatar
        size="5"
        radius="full"
        src={originInfo.faviconUrl || undefined}
        alt={`${originInfo.host} icon`}
        fallback={<GlobeIcon width="28" height="28" />}
        className="pnc-approval__avatar"
      />
      <div className="pnc-approval__header-copy">
        <Text size="2" className="pnc-approval__eyebrow">
          {eyebrow}
        </Text>
        {title ? (
          <Heading
            size={prominentTitle ? '7' : '6'}
            weight="medium"
            align="center"
            className="pnc-approval__title"
            data-prominent={prominentTitle}
          >
            {title}
          </Heading>
        ) : null}
        {description ? (
          <Text size="2" align="center" className="pnc-approval__description">
            {description}
          </Text>
        ) : null}
      </div>
      <Badge color="violet" radius="full" size="2" variant="soft" className="pnc-approval__origin">
        <GlobeIcon />
        {originInfo.host}
      </Badge>
    </div>
  );
}

/** Renders the inline notice pill used by approval flows. */
export function ApprovalNotice({ tone, text, icon }: ApprovalNoticeProps) {
  return (
    <div className="pnc-approval__notice" data-tone={tone}>
      <span className="pnc-approval__notice-icon">{icon}</span>
      <Text size="2" className="pnc-approval__notice-text">
        {text}
      </Text>
    </div>
  );
}

/** Renders a consistently styled primary or secondary action button. */
export function ActionButton({ tone, type = 'button', className, ...props }: ActionButtonProps) {
  return (
    <ThemedButton
      type={type}
      size="3"
      variant={tone === 'primary' ? 'solid' : 'soft'}
      className={['pnc-action-button', `pnc-action-button--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}

/** Renders a titled approval section with optional card chrome. */
export function Section({ title, surface = 'card', children }: SectionProps) {
  return (
    <section className="pnc-section">
      <Text size="3" weight="medium" className="pnc-section__title">
        {title}
      </Text>
      {surface === 'card' ? (
        <Card size="2" className="pnc-section__surface">
          {children}
        </Card>
      ) : (
        children
      )}
    </section>
  );
}

/** Renders a checklist of capabilities granted by a request. */
export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="pnc-checklist">
      {items.map((item) => (
        <li key={item} className="pnc-checklist__item">
          <CheckCircledIcon className="pnc-checklist__icon" width="18" height="18" />
          <Text size="2" className="pnc-checklist__text">
            {item}
          </Text>
        </li>
      ))}
    </ul>
  );
}

/** Renders message content inside a section. */
export function MessageBlock({ message }: { message: string }) {
  return (
    <Text as="p" size="3" className="pnc-approval__message">
      {message}
    </Text>
  );
}

/** Renders the summary card for transaction-style payloads. */
export function SummaryCard({ rows }: { rows: SummaryRow[] }) {
  return (
    <Card size="2" className="pnc-summary">
      <DataList.Root size="2" className="pnc-summary__list">
        {rows.map((row) => (
          <DataList.Item key={row.label} align="center" className="pnc-summary__item">
            <DataList.Label minWidth="112px">
              <Text size="2" weight="medium" className="pnc-summary__label">
                {row.label}
              </Text>
            </DataList.Label>
            <DataList.Value>
              <Text size="2" weight="medium" className="pnc-summary__value">
                {row.value}
              </Text>
            </DataList.Value>
          </DataList.Item>
        ))}
      </DataList.Root>
    </Card>
  );
}

/** Renders a transaction group for a single receiver. */
export function TransactionGroupCard({
  receiverId,
  transactionIndex,
  actions,
}: TransactionGroupCardProps) {
  return (
    <Card size="2" className="pnc-transaction-group">
      <div className="pnc-transaction-group__header">
        <Text size="1" weight="medium" className="pnc-transaction-group__eyebrow">
          {`Transaction ${transactionIndex + 1}`}
        </Text>
        <Text size="2" weight="medium" className="pnc-transaction-group__receiver">
          {receiverId}
        </Text>
      </div>
      <div className="pnc-transaction-group__actions">
        {actions.map((action, actionIndex) => (
          <ActionCard key={`${receiverId}-${action.type}-${actionIndex}`} action={action} />
        ))}
      </div>
    </Card>
  );
}

function ActionCard({ action }: { action: ConnectorAction }) {
  const summary = summarizeAction(action);
  const fields = buildActionFields(summary);

  return (
    <div className="pnc-action-card">
      <Badge
        variant="soft"
        size="1"
        radius="full"
        className={`pnc-action-card__badge pnc-action-card__badge--${badgeTone(summary)}`}
      >
        {formatActionLabel(summary.type)}
      </Badge>
      <div className="pnc-action-card__fields">
        {fields.map((field) => (
          <div key={`${field.label}-${field.value}`} className="pnc-action-card__field">
            <Text size="1" weight="medium" className="pnc-action-card__field-label">
              {field.label}
            </Text>
            <Text size="2" weight="medium" className="pnc-action-card__field-value">
              {field.value}
            </Text>
          </div>
        ))}
      </div>
      {summary.argsJson ? (
        <details className="pnc-action-card__details">
          <summary className="pnc-action-card__details-summary">
            <Text size="2" weight="medium">
              View details
            </Text>
            <InfoCircledIcon className="pnc-action-card__details-caret" width="16" height="16" />
          </summary>
          <pre className="pnc-action-card__details-json">{summary.argsJson}</pre>
        </details>
      ) : null}
    </div>
  );
}

function buildActionFields(summary: ActionSummary): SummaryRow[] {
  switch (summary.type) {
    case 'FunctionCall': {
      const rows: SummaryRow[] = [];
      if (summary.method) rows.push({ label: 'Method', value: summary.method });
      if (summary.deposit && summary.deposit !== '0') {
        rows.push({ label: 'Deposit', value: `${summary.deposit} NEAR` });
      }
      if (summary.gas) rows.push({ label: 'Gas', value: summary.gas });
      return rows.length > 0 ? rows : [{ label: 'Action', value: formatActionLabel(summary.type) }];
    }

    case 'Transfer':
      return summary.amount
        ? [{ label: 'Amount', value: `${summary.amount} NEAR` }]
        : [{ label: 'Action', value: formatActionLabel(summary.type) }];

    case 'Stake':
      return summary.amount
        ? [{ label: 'Stake', value: `${summary.amount} NEAR` }]
        : [{ label: 'Action', value: formatActionLabel(summary.type) }];

    default:
      return [{ label: 'Action', value: formatActionLabel(summary.type) }];
  }
}

function badgeTone(summary: ActionSummary): 'call' | 'transfer' | 'generic' {
  if (summary.category === 'call') return 'call';
  if (summary.category === 'transfer') return 'transfer';
  return 'generic';
}

function formatActionLabel(actionType: ConnectorAction['type']): string {
  switch (actionType) {
    case 'FunctionCall':
      return 'Function Call';
    case 'Transfer':
      return 'Transfer';
    case 'Stake':
      return 'Stake';
    case 'AddKey':
      return 'Add Key';
    case 'DeleteKey':
      return 'Delete Key';
    case 'CreateAccount':
      return 'Create Account';
    case 'DeleteAccount':
      return 'Delete Account';
    case 'DeployContract':
      return 'Deploy Contract';
    case 'UseGlobalContract':
      return 'Use Global Contract';
    case 'DeployGlobalContract':
      return 'Deploy Global Contract';
    default:
      return actionType;
  }
}
