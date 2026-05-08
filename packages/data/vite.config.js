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
    ],
    setupFiles: ['./src/test-setup.ts'],
    tsconfig: './tsconfig-base.json',
    silent: false,
    reporters: 'verbose',
  }
})
