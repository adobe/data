// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { isolation } from "./isolation.ts";
import { packageUpdates } from "./package-updates.ts";

/** Serves and builds the page in `src`, into `dist`, cross-origin isolated for shared memory, wherever it's served from. */
export default defineConfig({
    root: fileURLToPath(new URL("src", import.meta.url)),
    base: "./",
    plugins: [Compiler.plugin(), isolation, packageUpdates(["dist", "src"].map(folder => fileURLToPath(new URL(`../ecs/${folder}/`, import.meta.url)).replace(/\\/g, "/")))],
    // The workers' dependencies, which the page's scan doesn't reach, are optimized before the first page asks too: a
    // dependency found late reloads the page.
    optimizeDeps: { entries: ["index.html", "**/*.ts", "!**/*.test.ts", "!**/*.test-helper.ts"] },
    build: { outDir: fileURLToPath(new URL("dist", import.meta.url)), emptyOutDir: true },
});
