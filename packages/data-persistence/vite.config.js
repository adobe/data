// © 2026 Adobe. MIT License. See /LICENSE for details.
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vite';

const IS_RUNNING_VSCODE_DEBUG = typeof process.env.VSCODE_INSPECTOR_OPTIONS === 'string';

export default defineConfig({
    test: {
        name: 'browser',
        include: ['src/**/*.test.ts'],
        exclude: ['src/**/*.node.test.ts', '**/node_modules/**', '**/dist/**'],
        browser: IS_RUNNING_VSCODE_DEBUG ? {} : {
            provider: playwright(),
            enabled: true,
            instances: [{ browser: 'chromium' }],
            headless: true,
        },
    },
});
