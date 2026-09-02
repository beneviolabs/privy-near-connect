// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  buildTransactionView,
  TransactionSections,
} from '@/sign-page-plugin/screens/TransactionSections';
import type { SigningPayload } from '@/types';

const PEERFOLIO_GRANT: SigningPayload = {
  kind: 'signAndSendTransaction',
  receiverId: 'trading.near',
  actions: [
    {
      type: 'FunctionCall',
      params: {
        methodName: 'add_full_access_key_and_register_with_intents',
        args: { public_key: 'ed25519:11111111111111111111111111111111' },
        gas: '20000000000000',
        deposit: '1',
      },
    },
  ],
};

describe('TransactionSections', () => {
  it('visibly explains the persistent Peerfolio signer grant and how to remove it', () => {
    if (PEERFOLIO_GRANT.kind !== 'signAndSendTransaction') throw new Error('wrong payload kind');
    const request = buildTransactionView(PEERFOLIO_GRANT, 'owner.near');

    const html = renderToStaticMarkup(createElement(TransactionSections, { request }));

    expect(html).toContain('The Peerfolio signer gets full access');
    expect(html).toContain('can act without repeated approval');
    expect(html).toContain('remove this access at any time from Settings');
    expect(html).toContain('data-tone="warning"');
  });
});
