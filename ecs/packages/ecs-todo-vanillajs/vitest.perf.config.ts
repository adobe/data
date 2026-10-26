// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { isolation } from "./isolation.ts";

// `*.perf-browser-test.ts` runs in chromium, with real workers; it logs numbers and asserts none.
export default defineConfig({
    plugins: [Compiler.plugin(), isolation],
    test: {
        // The default reporter drops the console lines of passing tests, which hold the results.
        reporters: "verbose",
        name: "perf-browser",
        include: ["src/**/*.perf-browser-test.ts"],
        testTimeout: 120_000,
        fileParallelism: false,
        browser: {
            enabled: true,
            // Full Chromium rather than the headless shell, whose WebGPU computes trigonometry less precisely.
            provider: playwright({ launchOptions: { channel: "chromium", args: ["--enable-unsafe-webgpu"] } }),
            headless: true,
            instances: [{ browser: "chromium" }],
        },
    },
});
