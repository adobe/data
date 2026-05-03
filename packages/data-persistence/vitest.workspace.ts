// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineWorkspace } from 'vitest/config';

// Same suffix convention as @adobe/data:
//   *.test.ts          - runtime-agnostic, runs in both projects
//   *.browser.test.ts  - browser-only (OPFS, browser Worker)
//   *.node.test.ts     - node-only (node:fs, node:worker_threads)
export default defineWorkspace([
    './vite.config.js',
    {
        test: {
            name: 'node',
            environment: 'node',
            include: ['src/**/*.test.ts', 'src/**/*.node.test.ts'],
            exclude: ['src/**/*.browser.test.ts', '**/node_modules/**', '**/dist/**'],
            setupFiles: ['./test/setup-node.ts'],
            silent: false,
            reporters: 'verbose',
        },
    },
]);
