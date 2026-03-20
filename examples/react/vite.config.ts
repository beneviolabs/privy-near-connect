import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Vite ignores node_modules by default — unignore the local package
      // so changes to its dist/ trigger a reload when tsup is running in watch mode
      ignored: ['!**/node_modules/@peerfolio/privy-near-connect/**'],
    },
  },
});
