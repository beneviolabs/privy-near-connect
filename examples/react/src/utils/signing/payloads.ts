const GUEST_BOOK_RECEIVER_IDS = {
  mainnet: 'guest-book.near',
  testnet: 'guest-book.testnet',
} as const;
const GUEST_BOOK_GAS = '30000000000000';

const guestBookCall1 = {
  type: 'FunctionCall',
  params: {
    methodName: 'addMessage',
    args: { text: 'Hello from action 1' },
    gas: GUEST_BOOK_GAS,
    deposit: '0',
  },
};

const guestBookCall2 = {
  type: 'FunctionCall',
  params: {
    methodName: 'addMessage',
    args: { text: 'Hello from action 2' },
    gas: GUEST_BOOK_GAS,
    deposit: '0',
  },
};

export const TEST_MESSAGE_PAYLOAD = {
  kind: 'signMessage' as const,
  message: 'Hello, NEAR!',
  recipient: 'example.near',
  nonce: crypto.getRandomValues(new Uint8Array(32)),
};

export const TEST_TX_PAYLOAD = {
  kind: 'signAndSendTransaction' as const,
  receiverId: GUEST_BOOK_RECEIVER_IDS.mainnet,
  actions: [guestBookCall1, guestBookCall2],
};

export const TEST_TXS_PAYLOAD = {
  kind: 'signAndSendTransactions' as const,
  transactions: [
    { receiverId: GUEST_BOOK_RECEIVER_IDS.mainnet, actions: [guestBookCall1] },
    { receiverId: GUEST_BOOK_RECEIVER_IDS.mainnet, actions: [guestBookCall2] },
  ],
};

export const TEST_DELEGATE_PAYLOAD = {
  kind: 'signDelegateActions' as const,
  delegateActions: [
    { receiverId: GUEST_BOOK_RECEIVER_IDS.mainnet, actions: [guestBookCall1] },
    { receiverId: GUEST_BOOK_RECEIVER_IDS.mainnet, actions: [guestBookCall2] },
  ],
};

export function payloadWithNetwork(
  payload:
    | typeof TEST_MESSAGE_PAYLOAD
    | typeof TEST_TX_PAYLOAD
    | typeof TEST_TXS_PAYLOAD
    | typeof TEST_DELEGATE_PAYLOAD,
  network: 'testnet' | 'mainnet',
) {
  const receiverId = GUEST_BOOK_RECEIVER_IDS[network];

  switch (payload.kind) {
    case 'signAndSendTransaction':
      return {
        ...payload,
        network,
        receiverId,
      };
    case 'signAndSendTransactions':
      return {
        ...payload,
        network,
        transactions: payload.transactions.map((tx) => ({ ...tx, receiverId })),
      };
    case 'signDelegateActions':
      return {
        ...payload,
        network,
        delegateActions: payload.delegateActions.map((action) => ({ ...action, receiverId })),
      };
    default:
      return {
        ...payload,
        network,
      };
  }
}
