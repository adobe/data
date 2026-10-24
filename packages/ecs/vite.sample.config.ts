// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineConfig } from "vite";
import { Compiler } from "./src/implementation/compiler/index.ts";
import { isolation, sources } from "./vitest.plugins.ts";

/**
 * Serves `src/samples`, one folder per sample with the sample browser at the root, cross-origin isolated for shared
 * memory. It opens no browser.
 */
export default defineConfig({
    root: "src/samples",
    plugins: [Compiler.plugin(), isolation, sources],
});
