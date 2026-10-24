// © 2026 Adobe. MIT License. See /LICENSE for details.
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { Compiler } from "./src/implementation/compiler/index.ts";
import { pluginWith } from "./src/implementation/compiler/plugin.ts";
import { isolation, sources } from "./vitest.plugins.ts";

/**
 * Node tests of real threads, which import fixtures the global setup builds (`vitest.fixtures.ts`), natively, so their
 * workers load the built `worker.js`.
 */
const threads = "src/implementation/world/threads.test.ts";

/**
 * Suites of what row systems do, run a second time with unflagged systems as written, since the build compiles every
 * body in the subset: so both the kernels and the bodies as written of their systems are tested.
 */
const rowPath = [
    "up", "up-tree", "index-order", "index-sorted", "index-hash", "index-keyless", "index-changed", "indexes", "entity-lookups",
    "change-blocks", "conditions", "commands", "rows", "target", "remove", "strings", "synchronize", "ticks", "observer",
    "schedule", "reductions", "loop",
].map(name => `src/implementation/world/${name}.test.ts`);

/** A test's timeout only guards against a hang, which no test asserts on: long enough for a machine busy elsewhere. */
const timeouts = { testTimeout: 30000, hookTimeout: 30000 };

/**
 * Node exposes its collector, and what finishes optimizing compiles in flight, which hold what they read, so tests of
 * what a world holds can collect what nothing references (`lifetime.test-helper.ts`).
 */
const execArgv = ["--expose-gc", "--allow-natives-syntax"];

// Three groups, one after another, so tests of real threads never share the machine with other tests: `*.test.ts` in
// node, files in parallel; then the node tests of real threads; then `*.browser.test.ts` in chromium, with real
// workers, a file at a time.
export default defineConfig({
    test: {
        projects: [
            {
                plugins: [Compiler.plugin()],
                test: {
                    ...timeouts,
                    execArgv,
                    name: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["src/**/*.browser.test.ts", threads, "**/node_modules/**"],
                    sequence: { groupOrder: 0 },
                },
            },
            {
                plugins: [pluginWith({ automatic: false })],
                test: {
                    ...timeouts,
                    execArgv,
                    name: "as written",
                    include: rowPath,
                    sequence: { groupOrder: 0 },
                },
            },
            {
                plugins: [Compiler.plugin()],
                test: {
                    ...timeouts,
                    execArgv,
                    name: "threads",
                    include: [threads],
                    globalSetup: ["./vitest.fixtures.ts"],
                    server: { deps: { external: [/\/dist\/fixtures\//] } },
                    sequence: { groupOrder: 1 },
                },
            },
            {
                plugins: [Compiler.plugin(), isolation, sources],
                test: {
                    ...timeouts,
                    name: "browser",
                    include: ["src/**/*.browser.test.ts"],
                    fileParallelism: false,
                    sequence: { groupOrder: 2 },
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
