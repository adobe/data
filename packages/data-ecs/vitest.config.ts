import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { kernelPlugin } from "./src/implementation/compiler/index.ts";
import { isolation, sources } from "./vitest.plugins.ts";

// `*.test.ts` runs in node; `*.browser.test.ts` runs in chromium, with real workers.
export default defineConfig({
    test: {
        projects: [
            {
                plugins: [kernelPlugin()],
                test: { name: "node", include: ["src/**/*.test.ts"], exclude: ["src/**/*.browser.test.ts", "**/node_modules/**"] },
            },
            {
                plugins: [kernelPlugin(), isolation, sources],
                test: {
                    name: "browser",
                    include: ["src/**/*.browser.test.ts"],
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
