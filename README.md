# @peerfolio/privy-near-connect

Privy wallet adapter for near-connect.

## Tests

```bash
npm install
npm run test
```

## Example app

The React example in [examples/react](examples/react) provides a simple sign-message UI.

Run the library in watch mode in one terminal:

```bash
npm run build:watch
```

Then run the example app in another:

```bash
cd examples/react
npm install
npm run dev
```

Open the app at http://localhost:5173.

## FAQ and Troubleshooting

- Origin not allowed error in signing page: Make sure to add `http://localhost:5173` to the allowed origins for your app in the [Privy dashboard](https://dashboard.privy.io/) and configure the `VITE_PRIVY_APP_ID` and `VITE_PRIVY_APP_CLIENT_ID` environment variables in `examples/react/.env` with the values from your dashboard app settings.
