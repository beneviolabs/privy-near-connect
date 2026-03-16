import Privy, { LocalStorage } from '@privy-io/js-sdk-core';

export const privy = new Privy({
  appId: import.meta.env.VITE_PRIVY_APP_ID!,
  clientId: import.meta.env.VITE_PRIVY_APP_CLIENT_ID!,
  storage: new LocalStorage(),
});
