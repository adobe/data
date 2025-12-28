import { defineConfig } from 'vitest/config'

// Detect if running in VS Code Debug mode to switch test runners
const IS_RUNNING_VSCODE_DEBUG = typeof process.env.VSCODE_INSPECTOR_OPTIONS === 'string';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist'
  },
  server: {
    port: 3000,
    open: false
  },
  test: {
    tsconfig: './tsconfig-base.json',
    reporters: 'verbose',
    silent: false,
    
    browser: {
      // Disable browser runner when debugging in VS Code to allow the extension to attach correctly
      enabled: !IS_RUNNING_VSCODE_DEBUG,
      provider: 'playwright',
      name: 'chromium',
      headless: true,
      options: {
        launch: {},
      },
    },
  }
})