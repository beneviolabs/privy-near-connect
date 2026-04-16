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

/** Display copy and grouped actions for transaction-style approvals. */
export type TransactionView = {
  title: string;
  description: string;
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
 * @returns Derived title, description, and grouped actions.
 */
export function buildTransactionView(
  payload: TransactionPayload,
  currentAccountId: string | undefined,
): TransactionView {
  let titleOverride: string | undefined;
  let descriptionOverride: string | undefined;
  let transactions: TransactionGroup[];

  switch (payload.kind) {
    case 'signAndSendTransaction':
      transactions = [
        { receiverId: payload.receiverId, actions: payload.actions as ConnectorAction[] },
      ];
      break;
    case 'signAndSendTransactions':
      transactions = payload.transactions.map((transaction) => ({
        receiverId: transaction.receiverId,
        actions: transaction.actions as ConnectorAction[],
      }));
      break;
    case 'signDelegateActions':
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
    transactions,
    accountId: currentAccountId,
  };
}

/** Renders the transaction-oriented approval sections. */
export function TransactionSections({ request }: TransactionSectionsProps) {
  return (
    <>
      <details className="pnc-advanced-details" open>
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
