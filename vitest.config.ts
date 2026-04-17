import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/sign-page.ts', 'src/sign-page-plugin/**'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
      },
    },
  },
});
