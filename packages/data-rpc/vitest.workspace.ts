// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineWorkspace } from "vitest/config";

// Default project runs under node — Node 24 provides `MessageChannel`,
// `MessagePort`, and `structuredClone` as globals, so the loopback and
// MessagePort transports are exercised faithfully. Tests that need a DOM
// `window`/`MessageEvent` (the window transport) opt in per-file with
// `// @vitest-environment jsdom`.
export default defineWorkspace([
    {
        test: {
            name: "node",
            environment: "node",
            include: ["src/**/*.test.ts"],
            exclude: ["**/node_modules/**", "**/dist/**"],
            silent: false,
            reporters: "verbose",
        },
    },
]);
