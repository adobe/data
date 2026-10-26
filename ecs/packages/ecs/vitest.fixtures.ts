// © 2026 Adobe. MIT License. See /LICENSE for details.
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import type { TestProject } from "vitest/node";
import { Compiler } from "./src/implementation/compiler/index.ts";

const root = dirname(fileURLToPath(import.meta.url));
/** Where each test run builds its fixtures, in a directory of its own: `run-<process id>-<suffix>`. */
const fixturesRoot = join(root, "dist", "fixtures");

/** Whether the process that built a run's fixtures is still running. */
const running = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error instanceof Error && "code" in error && error.code === "EPERM";
    }
};

/** Removes what runs that ended left, as one stopped mid-way does, keeping the directories of runs still going. */
const removeAbandoned = (): void => {
    for (const entry of readdirSync(fixturesRoot, { withFileTypes: true })) {
        const pid = /^run-(\d+)-/.exec(entry.name)?.[1];
        if (entry.isDirectory() && pid !== undefined && running(Number(pid))) continue;
        rmSync(join(fixturesRoot, entry.name), { recursive: true, force: true });
    }
};

const fixtureSources = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? fixtureSources(join(directory, entry.name)) : entry.name.endsWith(".fixture.ts") ? [join(directory, entry.name)] : []);

/**
 * Vitest's global setup for node tests that use real threads: bundles every `*.fixture.ts` with the plugin, as
 * `pnpm perf` bundles benchmarks, and `worker.ts` as a second entry, `worker.js`, in one directory, since a
 * `worker_threads` worker doesn't go through Vitest's module runner. A built fixture has its own registry, so the
 * keys and systems of its cases live in it. Each run builds into a directory of its own, which it removes when it
 * ends, so runs at the same time in one checkout never replace each other's fixtures.
 */
export default async (project: TestProject): Promise<() => void> => {
    mkdirSync(fixturesRoot, { recursive: true });
    removeAbandoned();
    const fixturesDirectory = mkdtempSync(join(fixturesRoot, `run-${process.pid}-`));
    const fixtures = fixtureSources(join(root, "src"));
    const input = Object.fromEntries(fixtures.map(file => [basename(file, ".ts"), relative(root, file)]));
    await build({
        configFile: false,
        root,
        logLevel: "warn",
        plugins: [Compiler.plugin()],
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
    project.provide("fixturesDirectory", fixturesDirectory);
    return () => rmSync(fixturesDirectory, { recursive: true, force: true });
};
