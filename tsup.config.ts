import { defineConfig } from 'tsup';

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
});
