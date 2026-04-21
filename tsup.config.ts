import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: {
    executor: 'src/executor.ts',
    'sign-page': 'src/sign-page.ts',
    'sign-page-plugin/index': 'src/sign-page-plugin/index.ts',
  },
  format: ['esm'],
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
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
  onSuccess: async () => {
    copyFileSync(
      resolve(__dirname, 'src/sign-page-plugin/theme.css'),
      resolve(__dirname, 'dist/sign-page-plugin/theme.css'),
    );
  },
});
