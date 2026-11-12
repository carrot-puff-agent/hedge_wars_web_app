import { defineConfig } from 'vite';

export default defineConfig({
  base: '/games/hedge-wars/',
  publicDir: '../../hub/public',
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
  build: { target: 'es2022' },
});
