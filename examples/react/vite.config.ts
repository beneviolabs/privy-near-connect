import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: {
      buffer: resolve(__dirname, 'node_modules/buffer/index.js'),
    },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    watch: {
      // Vite ignores node_modules by default — unignore the local package
      // so changes to its dist/ trigger a reload when tsup is running in watch mode
      ignored: ['!**/node_modules/@peerfolio/privy-near-connect/**'],
    },
  },
});
