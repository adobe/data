// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The library's build: one module of its sources, which ships the registrations of its trait and its systems' input
 * schemas, for the application's build to compile and identify.
 */
export default defineConfig({
    plugins: [Compiler.plugin({ library: true })],
    build: {
        outDir: fileURLToPath(new URL("dist", import.meta.url)),
        emptyOutDir: false,
        minify: false,
        sourcemap: true,
        lib: { entry: fileURLToPath(new URL("src/index.ts", import.meta.url)), formats: ["es"], fileName: "index" },
        rolldownOptions: { external: ["@adobe/ecs", "@adobe/ecs/compiler"] },
    },
});
