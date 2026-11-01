// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The library's build: one module of its sources, which ships the registrations of its keys and its systems' input
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
        // Its keys stay top-level `const` declarations, which an application's build requires of a key it reads, such as
        // a trait's in its own declarations: library mode would make them `var`.
        rolldownOptions: { external: ["@adobe/ecs", "@adobe/ecs/compiler"], output: { topLevelVar: false } },
    },
});
