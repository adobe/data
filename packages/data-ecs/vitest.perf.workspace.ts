import { defineWorkspace } from "vitest/config";
import { kernelPlugin } from "./src/compiler/index.ts";
import { isolation, sources } from "./vitest.plugins.ts";

// `*.perf-test.ts` runs in node; `*.perf-browser-test.ts` runs in chromium, with real workers.
export default defineWorkspace([
    { plugins: [kernelPlugin()], test: { name: "perf-node", include: ["src/**/*.perf-test.ts"] } },
    {
        plugins: [kernelPlugin(), isolation, sources],
        test: {
            name: "perf-browser",
            include: ["src/**/*.perf-browser-test.ts"],
            testTimeout: 120_000,
            browser: { enabled: true, provider: "playwright", name: "chromium", headless: true, providerOptions: { launch: { args: ["--enable-unsafe-webgpu"] } } },
        },
    },
]);
