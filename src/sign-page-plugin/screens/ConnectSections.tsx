import { Checklist, MessageBlock, Section } from '@/sign-page-plugin/components';

type ConnectSectionsProps = {
  message?: string;
};

/** Renders the connect-oriented approval sections. */
export function ConnectSections({ message }: ConnectSectionsProps) {
  return (
    <>
      <Section title="This app will be able to">
        <Checklist items={['View your balance and activity', 'Request transaction approvals']} />
      </Section>
      {message ? (
        <Section title="And sign this message">
          <MessageBlock message={message} />
        </Section>
      ) : null}
    </>
  );
}
