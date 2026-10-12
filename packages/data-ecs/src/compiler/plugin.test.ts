/// <reference types="node" />
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, expect, test } from 'vitest';
import { build, createServer, type Rollup, type ViteDevServer } from 'vite';
import type { KernelDescription, KernelModule } from '../world/create/kernel.js';
import { kernelPlugin } from './plugin.js';

const source = (path: string) => JSON.stringify(fileURLToPath(new URL(path, import.meta.url)));
const directory = realpathSync(mkdtempSync(join(tmpdir(), "data-ecs-kernel-")));
const fixture = join(directory, "fixture.js");
writeFileSync(fixture, `import { System } from ${source("../system/system.ts")};
import { kernelOf } from ${source("../world/create/attach-kernel.ts")};
const score = "score";
const kernel = System.create({ name: "fixture", kernel: "cpu", query: { write: [score] } }, (row) => { row[score] = row.entity * 2; });
export const description = kernelOf(kernel);
`);
/** A kernel inlining a TypeScript helper and a function from a package's `dist`. */
const linked = join(directory, "linked.js");
const helper = join(directory, "helper.ts");
const writeHelper = (factor: number) => writeFileSync(helper, `type Factor = number;\nconst factor: Factor = ${factor};\nexport const scaled = (x: number): number => x * factor;\n`);
writeHelper(2);
mkdirSync(join(directory, "node_modules/fake-math/dist"), { recursive: true });
writeFileSync(join(directory, "node_modules/fake-math/package.json"), JSON.stringify({ name: "fake-math", type: "module", exports: "./dist/index.js" }));
writeFileSync(join(directory, "node_modules/fake-math/dist/index.js"), "export const increment = (x) => x + 1;\n");
writeFileSync(linked, `import { System } from ${source("../system/system.ts")};
import { kernelOf } from ${source("../world/create/attach-kernel.ts")};
import { scaled } from "./helper.ts";
import { increment } from "fake-math";
const score = "score";
const kernel = System.create({ name: "linked", kernel: "cpu", query: { write: [score] } }, (row) => { row[score] = increment(scaled(row.entity)); });
export const description = kernelOf(kernel);
`);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** Runs a one-column kernel writing a function of the entity, for entities 3 and 4. */
const runs = (module: KernelModule, description: KernelDescription): readonly number[] => {
    const entities = Float64Array.from([3, 4]);
    const columns = description.columns.map(column => column.kind === "entity" ? entities : column.kind === "changed" ? new Uint32Array(2) : new Float64Array(2));
    const commands = { spawn: () => 0, begin: () => {}, value: () => {}, component: () => {} };
    module.create(columns.map(() => false), columns.map(() => 1), columns.map(() => 0))(columns, 0, 2, [], [], description.keys, undefined, commands, 1);
    return [...columns[description.columns.findIndex(column => column.kind === "field")] ?? []];
};

test("a build emits each kernel as its own chunk, referenced by the description's url", async () => {
    const outDir = join(directory, "dist");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [kernelPlugin()],
        build: { outDir, minify: false, lib: { entry: fixture, formats: ["es"], fileName: "main" } },
    });
    const chunks = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .filter((item): item is Rollup.OutputChunk => item.type === "chunk");
    const kernel = chunks.find(chunk => chunk.name === "kernel");
    const main = chunks.find(chunk => chunk.isEntry);
    expect(kernel).toBeDefined();
    expect(main?.code).not.toContain("columns, start, end");
    const { description }: { description: KernelDescription } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    expect(description.url).toBe(pathToFileURL(join(outDir, kernel?.fileName ?? "")).href);
    const module: KernelModule = await import(/* @vite-ignore */ description.url);
    expect(runs(module, description)).toEqual([6, 8]);
});

const serve = async <T>(use: (server: ViteDevServer) => Promise<T>): Promise<T> => {
    const server = await createServer({
        configFile: false, logLevel: "silent", root: directory, plugins: [kernelPlugin()],
        appType: "custom", server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true },
    });
    try {
        return await use(server);
    } finally {
        await server.close();
    }
};

test("serve loads a kernel module by url, also before its parent was transformed", async () => {
    // Modules are untyped here; their shapes are what the plugin emits.
    const description: KernelDescription = await serve(async server => {
        const parent = await server.ssrLoadModule(fixture);
        expect(server.config.optimizeDeps.exclude).toContain("@adobe/data-ecs");
        return parent.description;
    });
    expect(description.url).toMatch(/^\/@data-ecs-kernel\/.+\?h=/);
    const module = await serve(server => server.ssrLoadModule(description.url));
    expect(runs({ create: module.create }, description)).toEqual([6, 8]);
});

test("serve rejects a url for a different version of the kernel", async () => {
    const description: KernelDescription = await serve(async server => (await server.ssrLoadModule(fixture)).description);
    const stale = description.url.replace(/\?h=.*/, "?h=stale");
    await expect(serve(server => server.ssrLoadModule(stale))).rejects.toThrow(/changed since its description was compiled/);
});

test("a build inlines functions from TypeScript modules and packages", async () => {
    const outDir = join(directory, "dist-linked");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [kernelPlugin()],
        build: { outDir, minify: false, lib: { entry: linked, formats: ["es"], fileName: "main" } },
    });
    const chunks = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .filter((item): item is Rollup.OutputChunk => item.type === "chunk");
    const main = chunks.find(chunk => chunk.isEntry);
    const { description }: { description: KernelDescription } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    const module: KernelModule = await import(/* @vite-ignore */ description.url);
    expect(runs(module, description)).toEqual([7, 9]);
});

test("serve compiles kernels again when a file they inline from changes", async () => {
    try {
        await serve(async server => {
            const before: KernelDescription = (await server.ssrLoadModule(linked)).description;
            expect(runs({ create: (await server.ssrLoadModule(before.url)).create }, before)).toEqual([7, 9]);
            writeHelper(3);
            server.watcher.emit("change", helper);
            const after: KernelDescription = (await server.ssrLoadModule(linked)).description;
            expect(after.url).not.toBe(before.url);
            expect(runs({ create: (await server.ssrLoadModule(after.url)).create }, after)).toEqual([10, 13]);
        });
    } finally {
        writeHelper(2);
    }
});
