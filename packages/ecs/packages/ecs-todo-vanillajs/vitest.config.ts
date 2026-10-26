// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { isolation } from "./isolation.ts";

/** A test's timeout only guards against a hang, which no test asserts on: long enough for a machine busy elsewhere. */
const timeouts = { testTimeout: 30000, hookTimeout: 30000 };

// Two groups, one after the other: `*.test.ts` in node, files in parallel; then `*.browser.test.ts` in chromium, with
// real workers, a file at a time.
export default defineConfig({
    test: {
        projects: [
            {
                plugins: [Compiler.plugin()],
                test: {
                    ...timeouts,
                    name: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["src/**/*.browser.test.ts", "**/node_modules/**"],
                    sequence: { groupOrder: 0 },
                },
            },
            {
                plugins: [Compiler.plugin(), isolation],
                test: {
                    ...timeouts,
                    name: "browser",
                    include: ["src/**/*.browser.test.ts"],
                    fileParallelism: false,
                    sequence: { groupOrder: 1 },
                    browser: {
                        enabled: true,
                        // Full Chromium rather than the headless shell, whose WebGPU computes trigonometry less precisely.
                        provider: playwright({ launchOptions: { channel: "chromium", args: ["--enable-unsafe-webgpu"] } }),
                        headless: true,
                        instances: [{ browser: "chromium" }],
                    },
                },
            },
        ],
    },
});
