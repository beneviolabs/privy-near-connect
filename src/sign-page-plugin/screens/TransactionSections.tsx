import type { ConnectorAction } from '@hot-labs/near-connect/build/actions/types.js';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import { Text } from '@radix-ui/themes';

import { TransactionGroupCard } from '@/sign-page-plugin/components';
import type { SigningPayload } from '@/types';
import type { ActionSummary } from '@/sign-page-plugin/utils/actions';
import { summarizeAction } from '@/sign-page-plugin/utils/actions';

type TransactionPayload = Extract<
  SigningPayload,
  { kind: 'signAndSendTransaction' | 'signAndSendTransactions' | 'signDelegateActions' }
>;

type TransactionGroup = {
  receiverId: string;
  actions: ConnectorAction[];
};

type SummaryRow = {
  label: string;
  value: string;
  secondaryValue?: string;
};

/** Display copy and grouped actions for transaction-style approvals. */
export type TransactionView = {
  title: string;
  description: string;
  detailCopy: string;
  summaryRows: SummaryRow[];
  transactions: TransactionGroup[];
  /** Signing account, shown in the Advanced Details section. */
  accountId?: string;
};

type TransactionSectionsProps = {
  request: TransactionView;
};

/**
 * Builds the transaction-specific view data from a trusted signing payload.
 *
 * @param payload - Transaction-style signing payload.
 * @param currentAccountId - Current connected account shown in the summary.
 * @returns Derived title, supporting copy, summary rows, and grouped actions.
 */
export function buildTransactionView(
  payload: TransactionPayload,
  currentAccountId: string | undefined,
): TransactionView {
  let descriptionOverride: string | undefined;
  let network: string | undefined;
  let transactions: TransactionGroup[];

  switch (payload.kind) {
    case 'signAndSendTransaction':
      network = payload.network;
      transactions = [
        { receiverId: payload.receiverId, actions: payload.actions as ConnectorAction[] },
      ];
      break;
    case 'signAndSendTransactions':
      network = payload.network;
      transactions = payload.transactions.map((transaction) => ({
        receiverId: transaction.receiverId,
        actions: transaction.actions as ConnectorAction[],
      }));
      break;
    case 'signDelegateActions':
      network = payload.network;
      descriptionOverride = 'The app is asking you to sign a meta-transaction.';
      transactions = payload.delegateActions.map((actionGroup) => ({
        receiverId: actionGroup.receiverId,
        actions: actionGroup.actions as ConnectorAction[],
      }));
      break;
  }

  const allActions = transactions.flatMap((transaction) => transaction.actions);
  const primaryAction = allActions[0] ? summarizeAction(allActions[0]) : null;

  return {
    title: buildTransactionTitle(payload.kind),
    description:
      descriptionOverride ??
      buildTransactionSubtitle(primaryAction, allActions.length, transactions.length),
    detailCopy: buildTransactionDescription(primaryAction, allActions.length, transactions.length),
    summaryRows: buildTransactionSummaryRows(primaryAction, transactions, network),
    transactions,
    accountId: currentAccountId,
  };
}

/** Renders the transaction-oriented approval sections. */
export function TransactionSections({ request }: TransactionSectionsProps) {
  return (
    <>
      <section className="pnc-section">
        <Text size="3" weight="medium" className="pnc-section__title">
          Info:
        </Text>
        <div className="pnc-transaction-copy">
          <Text size="4" className="pnc-transaction-copy__text">
            {request.detailCopy}
          </Text>
        </div>
      </section>

      {request.summaryRows.length > 0 ? (
        <section className="pnc-section">
          <Text size="3" weight="medium" className="pnc-section__title">
            Transaction summary
          </Text>
          <div className="pnc-summary-card">
            {request.summaryRows.map((row) => (
              <div key={`${row.label}-${row.value}`} className="pnc-summary-card__row">
                <Text size="3" className="pnc-summary-card__label">
                  {row.label}
                </Text>
                <div className="pnc-summary-card__values">
                  <Text size="3" weight="medium" className="pnc-summary-card__value">
                    {row.value}
                  </Text>
                  {row.secondaryValue ? (
                    <Text size="2" className="pnc-summary-card__secondary-value">
                      {row.secondaryValue}
                    </Text>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details className="pnc-advanced-details">
        <summary className="pnc-advanced-details__trigger">
          <Text size="4" weight="bold" className="pnc-advanced-details__title">
            Advanced Details
          </Text>
          <ChevronDownIcon className="pnc-advanced-details__caret" width="20" height="20" />
        </summary>
        <div className="pnc-advanced-details__content">
          {request.accountId ? (
            <div className="pnc-advanced-details__account">
              <Text size="3" weight="medium" className="pnc-advanced-details__account-label">
                Account ID
              </Text>
              <Text size="3" className="pnc-advanced-details__account-value">
                {request.accountId}
              </Text>
            </div>
          ) : null}
          <div className="pnc-transaction-list">
            {request.transactions.map((transaction, index) => (
              <TransactionGroupCard
                key={`${transaction.receiverId}-${index}`}
                receiverId={transaction.receiverId}
                actions={transaction.actions}
              />
            ))}
          </div>
        </div>
      </details>
    </>
  );
}

function buildTransactionSummaryRows(
  primaryAction: ActionSummary | null,
  transactions: TransactionGroup[],
  network: string | undefined,
): SummaryRow[] {
  const rows: SummaryRow[] = [];

  if (primaryAction?.type === 'Transfer' && primaryAction.amount) {
    rows.push({ label: 'Amount', value: `${primaryAction.amount} NEAR` });
  }

  if (transactions.length === 1 && transactions[0]) {
    rows.push({ label: 'To', value: transactions[0].receiverId });
  }

  rows.push({ label: 'Network', value: formatNetwork(network) });
  rows.push({
    label: 'Estimated Fee',
    value: '~0.002 NEAR',
    secondaryValue: '<$0.0001 USD',
  });

  return rows;
}

function buildTransactionTitle(kind: TransactionPayload['kind']): string {
  switch (kind) {
    case 'signAndSendTransaction':
      return 'Sign Transaction';
    case 'signAndSendTransactions':
      return 'Sign Transactions';
    case 'signDelegateActions':
      return 'Sign Delegate Actions';
  }
}

function buildTransactionSubtitle(
  primaryAction: ActionSummary | null,
  totalActions: number,
  transactionCount: number,
): string {
  if (primaryAction?.type === 'Transfer') {
    return 'You are sending funds from your account.';
  }

  if (primaryAction?.type === 'FunctionCall' && totalActions === 1) {
    return 'Approve this contract interaction to continue.';
  }

  if (transactionCount > 1 || totalActions > 1) {
    return 'Review the requested actions before continuing.';
  }

  return 'Review this request before continuing.';
}

function buildTransactionDescription(
  primaryAction: ActionSummary | null,
  totalActions: number,
  transactionCount: number,
): string {
  if (primaryAction?.type === 'Transfer') {
    return 'Review the transfer details before approving.';
  }

  if (primaryAction?.type === 'FunctionCall' && totalActions === 1) {
    return 'Review the contract call details and approve to continue.';
  }

  if (transactionCount > 1 || totalActions > 1) {
    return 'Review each requested action in the advanced details below before approving.';
  }

  return 'Review the request details and approve to continue.';
}

function formatNetwork(network: string | undefined): string {
  if (!network || network === 'mainnet') return 'NEAR';
  return `NEAR ${network}`;
}
