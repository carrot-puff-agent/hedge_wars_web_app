import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: {
      '/games/hedge-wars': { target: 'http://127.0.0.1:5174', ws: true },
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
  build: { target: 'es2022' },
});
