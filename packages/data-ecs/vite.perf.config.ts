import { defineConfig } from "vite";
import { kernelPlugin } from "./src/implementation/compiler/index.ts";

/** Bundles the benchmarks for plain node, with kernels compiled into their own chunks as in a production build. */
export default defineConfig({
    plugins: [kernelPlugin()],
    build: { ssr: "src/perftest/run.ts", outDir: "dist/perf", emptyOutDir: true, target: "esnext", minify: false },
    ssr: { noExternal: true },
});
