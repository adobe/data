// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { defineConfig } from "vitest/config";

/** A test's timeout only guards against a hang, which no test asserts on: long enough for a machine busy elsewhere. */
const timeouts = { testTimeout: 60000, hookTimeout: 120000 };

// Two groups, one after the other: `*.test.ts` in node, files in parallel; then `*.page.test.ts`, which drive the built
// guide in full Chromium, a file at a time, from a server the global setup starts.
export default defineConfig({
    test: {
        projects: [
            {
                plugins: [Compiler.plugin()],
                test: {
                    ...timeouts,
                    name: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["src/**/*.page.test.ts", "**/node_modules/**"],
                    sequence: { groupOrder: 0 },
                },
            },
            {
                test: {
                    ...timeouts,
                    name: "page",
                    include: ["src/**/*.page.test.ts"],
                    globalSetup: ["./vitest.page.ts"],
                    fileParallelism: false,
                    sequence: { groupOrder: 1 },
                },
            },
        ],
    },
});
