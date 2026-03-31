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
npm run build-serve:watch
```

It also serves the lib at localhost:8001, which allows the Near Connector
to fetch the executor code from your local.

Then run the example app in another terminal:

```bash
cd examples/react
npm install
npm run dev
```

Open the app at http://localhost:5173.

## FAQ and Troubleshooting
