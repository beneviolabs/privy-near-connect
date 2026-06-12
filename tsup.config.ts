import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Options } from 'tsup';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Settings shared by both builds. `dependencies`/`peerDependencies` are
// externalized by tsup automatically, so only the UI peer deps need listing.
const shared: Options = {
  format: ['esm'],
  target: 'es2020',
  dts: true,
  sourcemap: true,
  treeshake: true,
  outDir: 'dist',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@radix-ui/themes',
    '@radix-ui/react-icons',
    '@radix-ui/react-collapsible',
  ],
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      '@': resolve(__dirname, 'src'),
    };
    options.jsx = 'automatic';
    // Prevent debug logging in production distributed code.
    if (process.env.NODE_ENV === 'production') {
      options.pure = ['console.debug'];
    }
  },
};

export default defineConfig([
  // The executor is loaded standalone from a URL (the near-connect manifest's
  // `executor` field) via `window.selector.open`, not through a bundler. It
  // must remain a single self-contained file, so splitting stays OFF — that
  // keeps its small `@/types` import inlined instead of emitting a shared
  // chunk the browser couldn't resolve from the executor URL alone.
  {
    ...shared,
    entry: { executor: 'src/executor.ts' },
    splitting: false,
    clean: true, // first build owns the dist clean
  },
  // sign-page and the plugin are only consumed through a bundler, and the
  // plugin imports sign-page (`initSigningPage`) plus `signing/signer`,
  // `types`, and `log`. Building them together with splitting ON hoists that
  // shared source into one chunk both entries import, instead of inlining a
  // duplicate copy of sign-page into the plugin bundle (which also caused
  // edits to sign-page.ts to not reach the plugin on incremental rebuilds).
  {
    ...shared,
    entry: {
      'sign-page': 'src/sign-page.ts',
      'sign-page-plugin/index': 'src/sign-page-plugin/index.ts',
    },
    splitting: true,
    clean: false, // keep the executor build emitted above
    onSuccess: async () => {
      copyFileSync(
        resolve(__dirname, 'src/sign-page-plugin/theme.css'),
        resolve(__dirname, 'dist/sign-page-plugin/theme.css'),
      );
    },
  },
]);
