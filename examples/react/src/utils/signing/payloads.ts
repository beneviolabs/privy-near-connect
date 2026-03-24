const GUEST_BOOK_RECEIVER_ID = 'guest-book.near';
const GUEST_BOOK_GAS = '30000000000000';

const guestBookCall1 = {
  type: 'FunctionCall',
  params: {
    methodName: 'add_message',
    args: { text: 'Hello from action 1' },
    gas: GUEST_BOOK_GAS,
    deposit: '0',
  },
};

const guestBookCall2 = {
  type: 'FunctionCall',
  params: {
    methodName: 'add_message',
    args: { text: 'Hello from action 2' },
    gas: GUEST_BOOK_GAS,
    deposit: '0',
  },
};

export const TEST_MESSAGE_PAYLOAD = {
  kind: 'signMessage',
  message: 'Hello, NEAR!',
  recipient: 'example.near',
  nonce: crypto.getRandomValues(new Uint8Array(32)),
};

export const TEST_TX_PAYLOAD = {
  kind: 'signAndSendTransaction',
  receiverId: GUEST_BOOK_RECEIVER_ID,
  actions: [guestBookCall1, guestBookCall2],
};

export const TEST_TXS_PAYLOAD = {
  kind: 'signAndSendTransactions',
  network: 'mainnet',
  transactions: [
    { receiverId: GUEST_BOOK_RECEIVER_ID, actions: [guestBookCall1] },
    { receiverId: GUEST_BOOK_RECEIVER_ID, actions: [guestBookCall2] },
  ],
};

export const TEST_DELEGATE_PAYLOAD = {
  kind: 'signDelegateActions',
  network: 'mainnet',
  delegateActions: [
    { receiverId: GUEST_BOOK_RECEIVER_ID, actions: [guestBookCall1] },
    { receiverId: GUEST_BOOK_RECEIVER_ID, actions: [guestBookCall2] },
  ],
};
