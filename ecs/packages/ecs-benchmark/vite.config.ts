// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Compiler } from "@adobe/ecs/compiler";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Bundles the benchmarks for plain node, into `dist/main`, with each kernel a chunk of its own as in a production
 * build, and the package's pool worker beside them as `worker.js`, where a node world starts its workers from.
 */
export default defineConfig({
    plugins: [Compiler.plugin()],
    build: {
        ssr: true,
        outDir: path("dist/main"),
        emptyOutDir: true,
        target: "esnext",
        minify: false,
        rolldownOptions: {
            input: { node: path("src/features/main/ports/entry.node.ts"), worker: path("node_modules/@adobe/ecs/dist/implementation/world/worker.js") },
            output: { entryFileNames: "[name].js", chunkFileNames: "[name]-[hash].js" },
        },
    },
    ssr: { noExternal: true },
});
