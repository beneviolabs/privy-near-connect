# Contributing

## Code of Conduct

Be respectful and constructive in all interactions. We welcome contributions from everyone regardless of background or experience level. Harassment, discrimination, or hostile behaviour of any kind will not be tolerated.

## Submitting a Pull Request

- Target `main`. Do not open PRs against the `release` branch — it is machine-managed.
- Keep PRs focused on a single concern. If you have multiple unrelated changes, open separate PRs.
- Write a clear description explaining what changed and why. Link any relevant issues.

## What to Expect

- A maintainer will review your PR within a few business days.
- You may receive requests for changes — please respond to feedback or let us know if you need help.
- Once approved, a maintainer will merge your PR.
- After merging to `main`, CI automatically publishes an updated `executor.js` to the `release` branch.

## Development

```bash
npm install
npm run test
```

### Running the example app

The React example in [examples/react](examples/react) provides a simple sign-message UI.

1. Run the library in continuous build and watch mode in one terminal:

```bash
npm run build-serve:watch
```

It serves the executor.js file at localhost:8001, which allows the Near Connector
to fetch the executor code from your local.
This executor URL is already configured in the example app's manifest.json.

2. Then run the example app in another terminal:

```bash
cd examples/react
npm install
npm run dev
```

3. Open the app at http://localhost:5173.

### Linking near-connect lib
If you're making simultaneous changes to the near-connect lib locally and want to link this repo's
node modules, you can run

```sh
# from root of hot-labs/near-connect repo
yarn build
cd $DIR/privy-near-connect && \
npm link $DIR/near-connect && \
cd examples/react && \
npm link $DIR/near-connect
```

And later to unlink:
```sh
npm unlink @hot-labs/near-connect --no-save && \
cd examples/react && \
npm unlink @hot-labs/near-connect --no-save
```

## FAQ and Troubleshooting
- You can copy the manifest in examples/react app and add it to https://azbang.github.io/near-connect/ to do cross-origin testing. Make sure it's being served already.
- If you run into `Uncaught (in promise) Permission denied` error when launching the signing page or elsewhere it most likely is related to window opening so check the origin being specified and cross-origin access.

## Release Process (Maintainers Only)

### Deploying executor.js

The `release` branch serves the compiled `executor.js` directly via GitHub's raw content URL:

```
https://raw.githubusercontent.com/beneviolabs/privy-near-connect/refs/heads/release/executor.js
```

The workflow in `.github/workflows/build-executor.yml` runs automatically on every push to `main`. To trigger it:

1. **Merge to `main`** (or trigger manually via _Actions → Build and publish executor.js to release branch → Run workflow_). The workflow will build executor.js and commit it to the `release` branch.

2. **Verify the artifact** is accessible at the raw URL above. It may take a few seconds after the workflow completes for GitHub's CDN to reflect the latest commit.

> The `release` branch is machine-managed.

### Publishing @peerfolio/privy-near-connect to npm

Releases are managed with [Changesets](https://github.com/changesets/changesets). The process:

1. **Include a changeset in a PR** describing what changed and whether it's a `patch`, `minor`, or `major` bump:
   ```bash
   npx changeset add
   git add .changeset/ && git commit -m "changeset: <description>"
   ```
   The [changeset-bot](https://github.com/apps/changeset-bot) will comment on the PR if you forget.

2. **After a PR merges to `main`**, the _Publish to npm_ workflow automatically opens (or updates) a **"Version Packages" PR** that bumps `package.json` and updates `CHANGELOG.md`.

3. **Maintainer Merges the "Version Packages" PR** when ready to cut a release. The workflow then runs `npm publish` with [provenance attestation](https://docs.npmjs.com/generating-provenance-statements), cryptographically linking the published tarball to the exact commit and workflow run.

> **One-time setup:** configure [npm trusted publishing](https://docs.npmjs.com/generating-provenance-statements#using-third-party-package-publishing-tools) for this package on npmjs.com so the workflow can publish via OIDC without a stored token.

