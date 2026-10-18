import { readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { kernelPlugin } from "./src/implementation/compiler/index.ts";

const root = dirname(fileURLToPath(import.meta.url));
/** Where node tests import fixtures from, `<name>.fixture.js`, with `worker.js` beside every chunk. */
export const fixturesDirectory = join(root, "dist", "fixtures");

const fixtureSources = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? fixtureSources(join(directory, entry.name)) : entry.name.endsWith(".fixture.ts") ? [join(directory, entry.name)] : []);

/**
 * Vitest's global setup for node tests that use real threads: bundles every `*.fixture.ts` with the plugin, as
 * `pnpm perf` bundles benchmarks, and `worker.ts` as a second entry, `worker.js`, in one directory, since a
 * `worker_threads` worker doesn't go through Vitest's module runner. A built fixture has its own registry, so the
 * keys and systems of its cases live in it.
 */
export default async (): Promise<void> => {
    const fixtures = fixtureSources(join(root, "src"));
    const input = Object.fromEntries(fixtures.map(file => [basename(file, ".ts"), relative(root, file)]));
    await build({
        configFile: false,
        root,
        logLevel: "warn",
        plugins: [kernelPlugin()],
        build: {
            ssr: true,
            outDir: fixturesDirectory,
            emptyOutDir: true,
            target: "esnext",
            minify: false,
            rolldownOptions: {
                input: { ...input, worker: resolve(root, "src/implementation/world/worker.ts") },
                output: { entryFileNames: "[name].js", chunkFileNames: "[name]-[hash].js" },
            },
        },
        ssr: { noExternal: true },
    });
};
