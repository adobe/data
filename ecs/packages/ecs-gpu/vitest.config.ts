// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** A world joined across threads shares memory, which needs cross-origin isolation on every response. */
const isolation: Plugin = {
    name: "cross-origin-isolation",
    enforce: "pre",
    config: () => ({ server: { headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" } } }),
};

/**
 * Whether this run has a GPU: not on CI's runners, whose WebGPU is software and too slow, unless `ECS_GPU=1`. Without
 * one, Chromium starts with no WebGPU adapter, and the tests that need one skip.
 */
const gpu = process.env["ECS_GPU"] === "1" || process.env["CI"] === undefined;

// Every test runs in Chromium. A test's timeout only guards against a hang, which no test asserts on.
export default defineConfig({
    plugins: [Compiler.plugin(), isolation],
    test: {
        include: ["src/**/*.test.ts"],
        testTimeout: 30000,
        hookTimeout: 30000,
        fileParallelism: false,
        provide: { gpu },
        browser: {
            enabled: true,
            provider: playwright({ launchOptions: { channel: "chromium", args: gpu ? ["--enable-unsafe-webgpu"] : ["--disable-gpu"] } }),
            headless: true,
            instances: [{ browser: "chromium" }],
        },
    },
});
