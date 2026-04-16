import { MessageBlock, Section } from '@/sign-page-plugin/components';

type SignMessageSectionsProps = {
  message: string;
};

/** Renders the sign-message approval sections. */
export function SignMessageSections({ message }: SignMessageSectionsProps) {
  return (
    <Section title="Message">
      <MessageBlock message={message} />
    </Section>
  );
}
