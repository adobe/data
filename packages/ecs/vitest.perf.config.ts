import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { kernelPlugin } from "./src/implementation/compiler/index.ts";
import { isolation, sources } from "./vitest.plugins.ts";

// `*.perf-test.ts` runs in node; `*.perf-browser-test.ts` runs in chromium, with real workers.
export default defineConfig({
    test: {
        // `pnpm perf:browser` reads the results from the console lines, which the default reporter drops for passing tests.
        reporters: "verbose",
        projects: [
            { plugins: [kernelPlugin()], test: { name: "perf-node", include: ["src/**/*.perf-test.ts"] } },
            {
                plugins: [kernelPlugin(), isolation, sources],
                test: {
                    name: "perf-browser",
                    include: ["src/**/*.perf-browser-test.ts"],
                    testTimeout: 120_000,
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
