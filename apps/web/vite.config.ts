/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': src('./src'),
      // Use the shared package's sources directly: no rebuild needed while developing.
      '@stockwise/shared': src('../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    // Same origin in development, so the SameSite=Strict refresh cookie works.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
