import type { AddFunctionCallKeyParams } from '@hot-labs/near-connect';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';

import {
  ApprovalNotice,
  Checklist,
  MessageBlock,
  Section,
  SummaryCard,
} from '@/sign-page-plugin/components';
import { formatNear } from '@/sign-page-plugin/utils/actions';

type ConnectSectionsProps = {
  message?: string;
  addFunctionCallKey?: AddFunctionCallKeyParams;
};

/** Renders the connect-oriented approval sections. */
export function ConnectSections({ message, addFunctionCallKey }: ConnectSectionsProps) {
  return (
    <>
      <Section title="This app will be able to">
        <Checklist items={['View your balance and activity', 'Request transaction approvals']} />
      </Section>
      {addFunctionCallKey ? <AccessKeyGrant grant={addFunctionCallKey} /> : null}
      {message ? (
        <Section title="And sign this message">
          <MessageBlock message={message} />
        </Section>
      ) : null}
    </>
  );
}

function AccessKeyGrant({ grant }: { grant: AddFunctionCallKeyParams }) {
  const methods = grant.allowMethods.anyMethod
    ? 'Any method'
    : grant.allowMethods.methodNames.length > 0
      ? grant.allowMethods.methodNames.join(', ')
      : 'No methods';

  // Mirrors the on-chain behavior in AccountWithPrivySigner.ncSignIn: only a `limited`
  // gasAllowance is forwarded as a cap; omitted or `unlimited` means an unlimited key.
  const allowance =
    grant.gasAllowance?.kind === 'limited'
      ? `${formatNear(grant.gasAllowance.amount)} NEAR`
      : 'Unlimited';

  return (
    <Section title="And grant an access key" surface="none">
      <SummaryCard
        rows={[
          { label: 'Contract', value: grant.contractId },
          { label: 'Methods', value: methods },
          { label: 'Gas allowance', value: allowance },
        ]}
      />
      <ApprovalNotice
        tone="warning"
        text="This lets the app submit these calls from your account without asking again until the key is removed."
        icon={<ExclamationTriangleIcon />}
      />
    </Section>
  );
}
