import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'watch-manifest',
      configureServer(server) {
        const manifestPath = resolve(__dirname, 'public/manifest.json');
        server.watcher.add(manifestPath);
        server.watcher.on('change', (file) => {
          if (file === manifestPath) {
            server.ws.send({ type: 'full-reload' });
          }
        });
      },
    },
  ],
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
