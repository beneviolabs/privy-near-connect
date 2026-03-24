import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: {
    executor: 'src/executor.ts',
    'sign-page': 'src/sign-page.ts',
  },
  format: ['esm'],
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      '@': resolve(__dirname, 'src'),
    };
    // Prevent debug logging in production distributed code.
    if (process.env.NODE_ENV === 'production') {
      options.pure = ['console.debug'];
    }
  },
});
