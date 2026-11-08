import { defineConfig } from 'tsup';

// Builds both CommonJS (for the NestJS API) and ESM (for Vite) plus type declarations.
// In watch mode (pnpm dev) keep the previous build instead of wiping it, so the API
// never compiles against a half-empty dist/ folder.
export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: !options.watch,
  sourcemap: true,
  target: 'es2022',
}));
