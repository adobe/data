// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defineConfig } from "vite";
import { kernelPlugin } from "./src/implementation/compiler/index.ts";

/**
 * Bundles the benchmarks for plain node, with kernels compiled into their own chunks as in a production build, and
 * `worker.ts` as a second entry, `worker.js`, in the same directory, where the pool's workers load it, and `joined.ts`,
 * the thread the joining benchmarks join their worlds from.
 */
export default defineConfig({
    plugins: [kernelPlugin()],
    build: {
        ssr: true,
        outDir: "dist/perf",
        emptyOutDir: true,
        target: "esnext",
        minify: false,
        rolldownOptions: {
            input: { run: "src/perftest/run.ts", worker: "src/implementation/world/worker.ts", joined: "src/perftest/joined.ts" },
            output: { entryFileNames: "[name].js", chunkFileNames: "[name]-[hash].js" },
        },
    },
    ssr: { noExternal: true },
});
