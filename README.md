# @peerfolio/privy-near-connect

Privy wallet adapter for near-connect.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

## TSUP

Uses tsup - a TypeScript/JavaScript bundler built on top of esbuild. It compiles TS/JS into distributable
output quickly and can emit .d.ts type declarations, handle multiple entry points, and generate ESM/CJS
bundles with sourcemaps.

In this scaffold it’s used to build two entry points:

- src/executor.ts → dist/executor.js + dist/executor.d.ts
- src/sign-page.ts → dist/sign-page.js + dist/sign-page.d.ts
