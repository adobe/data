// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { isolation } from "./isolation.ts";
import { plugins } from "./vite.plugins.ts";

/** Serves and builds the page in `src`, into `dist`, cross-origin isolated for shared memory, wherever it's served from. */
export default defineConfig({
    root: fileURLToPath(new URL("src", import.meta.url)),
    base: "./",
    plugins: [Compiler.plugin(), isolation, ...plugins()],
    // Workers build with plugins of their own: the compiler's, the checker's and a run's runtime read the guide's packages.
    worker: { plugins: () => [Compiler.plugin(), ...plugins()] },
    // The workers' dependencies, which the page's scan doesn't reach, are optimized before the first page asks too: a
    // dependency found late reloads the page.
    optimizeDeps: { entries: ["index.html", "**/*.ts", "!**/*.test.ts", "!**/*.test-helper.ts"] },
    build: { outDir: fileURLToPath(new URL("dist", import.meta.url)), emptyOutDir: true },
});
