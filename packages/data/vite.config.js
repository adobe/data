import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist'
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/references/**',
      '**/assembly-test/**',
      // Timing-ratio perf tests are non-deterministic on shared CI runners.
      // The CI gate sets SKIP_PERF=1 to exclude them so it stays reliable;
      // a normal `pnpm test` still runs them locally.
      ...(process.env.SKIP_PERF ? ['**/*.performance.test.ts'] : []),
    ],
    setupFiles: ['./src/test-setup.ts'],
    tsconfig: './tsconfig-base.json',
    silent: false,
    reporters: 'verbose',
  }
})
