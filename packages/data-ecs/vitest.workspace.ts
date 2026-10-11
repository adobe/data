import { defineWorkspace } from "vitest/config";
import { kernelPlugin } from "./src/compiler/index.ts";
import { isolation, sources } from "./vitest.plugins.ts";

// `*.test.ts` runs in node; `*.browser.test.ts` runs in chromium, with real workers.
export default defineWorkspace([
    {
        plugins: [kernelPlugin()],
        test: { name: "node", include: ["src/**/*.test.ts"], exclude: ["src/**/*.browser.test.ts", "**/node_modules/**"] },
    },
    {
        plugins: [kernelPlugin(), isolation, sources],
        test: {
            name: "browser",
            include: ["src/**/*.browser.test.ts"],
            browser: { enabled: true, provider: "playwright", name: "chromium", headless: true },
        },
    },
]);
