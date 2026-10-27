import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // `npm run dev` → sample data. `npm run dev:live` → live mode against a local backend
  // (API_TARGET, default the dev harness on :5301; uvicorn on :8000 also works).
  server: { proxy: { '/api': process.env.API_TARGET || 'http://127.0.0.1:5301', '/support-request': process.env.API_TARGET || 'http://127.0.0.1:5301' } },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } }
  }
});
