import Privy, { LocalStorage } from '@privy-io/js-sdk-core';
import { SignPagePlugin } from '@peerfolio/privy-near-connect/sign-page-plugin';
import '@radix-ui/themes/styles.css';
import '@peerfolio/privy-near-connect/sign-page-plugin/theme.css';

const privy = new Privy({
  appId: sessionStorage.getItem('privy_app_id') ?? import.meta.env.VITE_PRIVY_APP_ID!,
  clientId: sessionStorage.getItem('privy_client_id') ?? import.meta.env.VITE_PRIVY_APP_CLIENT_ID!,
  storage: new LocalStorage(),
});

export default function SignPage() {
  return <SignPagePlugin privy={privy} />;
}
