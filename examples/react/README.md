# React example

This example provides a simple signing UI wired to the local library build.

Run the library in continuous build and serve mode:

```bash
npm install
npm run build-serve:watch
```

Then start the React app:

```bash
cd examples/react
npm install
npm run dev
```

Open the app at http://localhost:5173.

## FAQ and Troubleshooting

- Create `examples/react/.env` with `VITE_PRIVY_APP_ID` and `VITE_PRIVY_APP_CLIENT_ID`.
- Add `http://localhost:5173` to the allowed origins for your Privy app.
- The flow opens a popup at `/#privy-sign`, so allow popups locally while testing.
