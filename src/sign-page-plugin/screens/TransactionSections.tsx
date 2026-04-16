import type { ConnectorAction } from '@hot-labs/near-connect/build/actions/types.js';

import {
  Section,
  SummaryCard,
  type SummaryRow,
  TransactionGroupCard,
} from '@/sign-page-plugin/components';
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

/** Display copy and grouped actions for transaction-style approvals. */
export type TransactionView = {
  title: string;
  description: string;
  summaryRows: SummaryRow[];
  transactions: TransactionGroup[];
};

type TransactionSectionsProps = {
  request: TransactionView;
};

/**
 * Builds the transaction-specific view data from a trusted signing payload.
 *
 * @param payload - Transaction-style signing payload.
 * @param currentAccountId - Current connected account shown in the summary.
 * @returns Derived title, description, summary rows, and grouped actions.
 */
export function buildTransactionView(
  payload: TransactionPayload,
  currentAccountId: string | undefined,
): TransactionView {
  let titleOverride: string | undefined;
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
      titleOverride = 'Delegate actions';
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
    title: titleOverride ?? buildTransactionTitle(primaryAction, allActions.length),
    description:
      descriptionOverride ??
      buildTransactionDescription(primaryAction, allActions.length, transactions.length),
    summaryRows: buildTransactionSummaryRows(
      primaryAction,
      transactions,
      allActions.length,
      network,
      currentAccountId,
    ),
    transactions,
  };
}

/** Renders the transaction-oriented approval sections. */
export function TransactionSections({ request }: TransactionSectionsProps) {
  return (
    <>
      {request.summaryRows.length > 0 ? (
        <Section title="Transaction summary" surface="none">
          <SummaryCard rows={request.summaryRows} />
        </Section>
      ) : null}
      <Section title="Advanced details" surface="none">
        <div className="pnc-transaction-list">
          {request.transactions.map((transaction, index) => (
            <TransactionGroupCard
              key={`${transaction.receiverId}-${index}`}
              receiverId={transaction.receiverId}
              transactionIndex={index}
              actions={transaction.actions}
            />
          ))}
        </div>
      </Section>
    </>
  );
}

function buildTransactionSummaryRows(
  primaryAction: ActionSummary | null,
  transactions: TransactionGroup[],
  totalActions: number,
  network: string | undefined,
  currentAccountId: string | undefined,
): SummaryRow[] {
  const rows: SummaryRow[] = [];

  if (currentAccountId) rows.push({ label: 'From', value: currentAccountId });

  if (primaryAction?.type === 'Transfer' && primaryAction.amount) {
    rows.push({ label: 'Amount', value: `${primaryAction.amount} NEAR` });
  }

  if (primaryAction?.type === 'FunctionCall' && primaryAction.method) {
    rows.push({ label: 'Method', value: primaryAction.method });
  }

  if (transactions.length === 1 && transactions[0]) {
    rows.push({
      label: primaryAction?.type === 'FunctionCall' ? 'Contract' : 'To',
      value: transactions[0].receiverId,
    });
  }

  if (
    primaryAction?.type === 'FunctionCall' &&
    primaryAction.deposit &&
    primaryAction.deposit !== '0'
  ) {
    rows.push({ label: 'Deposit', value: `${primaryAction.deposit} NEAR` });
  }

  if (transactions.length > 1) {
    rows.push({ label: 'Transactions', value: String(transactions.length) });
  }

  if (totalActions > 1) {
    rows.push({ label: 'Actions', value: String(totalActions) });
  }

  rows.push({ label: 'Network', value: formatNetwork(network) });

  return rows;
}

function buildTransactionTitle(primaryAction: ActionSummary | null, totalActions: number): string {
  if (primaryAction?.type === 'Transfer' && primaryAction.amount) {
    return `Send ${primaryAction.amount} NEAR`;
  }

  if (primaryAction?.type === 'FunctionCall' && primaryAction.method) {
    return `Approve ${primaryAction.method}`;
  }

  if (totalActions > 1) {
    return `Confirm ${totalActions} actions`;
  }

  return 'Confirm this action';
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
    return 'Review each requested action before approving.';
  }

  return 'Review the request details and approve to continue.';
}

function formatNetwork(network: string | undefined): string {
  if (!network || network === 'mainnet') return 'NEAR';
  return `NEAR ${network}`;
}
