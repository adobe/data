// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineWorkspace } from 'vitest/config';

// Test file naming convention:
//   *.test.ts          - runtime-agnostic, runs in both projects
//   *.browser.test.ts  - browser-only (DOM, WebGPU, Storage defaults, Cache API, etc.)
//   *.node.test.ts     - node-only (fs, worker_threads, etc.)
export default defineWorkspace([
    // Browser project: existing vite.config.js (Playwright/Chromium).
    './vite.config.js',
    // Node project: pure-logic and node-specific tests.
    {
        test: {
            name: 'node',
            environment: 'node',
            include: ['src/**/*.test.ts', 'src/**/*.node.test.ts'],
            exclude: ['src/**/*.browser.test.ts', '**/node_modules/**', '**/dist/**', '**/references/**'],
            setupFiles: ['./test/setup-node.ts'],
            silent: false,
            reporters: 'verbose',
        },
    },
]);
