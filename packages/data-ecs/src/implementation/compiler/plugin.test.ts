/// <reference types="node" />
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, expect, test } from 'vitest';
import { build, createServer, type Rollup, type ViteDevServer } from 'vite';
import type { KernelDescription, KernelModule } from '../world/kernel.js';
import { kernelPlugin } from './plugin.js';

const source = (path: string) => JSON.stringify(fileURLToPath(new URL(path, import.meta.url)));
const directory = realpathSync(mkdtempSync(join(tmpdir(), "data-ecs-kernel-")));
const fixture = join(directory, "fixture.js");
writeFileSync(fixture, `import { System } from ${source("../../interface/system/system.ts")};
import { Component } from ${source("../../interface/component/component.ts")};
import { kernelOf } from ${source("../world/attach-kernel.ts")};
const score = Symbol("score");
Component.register(score, { type: { type: "number" } });
const kernel = System.create({ name: "fixture", kernel: "cpu", components: { write: [score] } }, (row) => { row[score] = row.entity * 2; });
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
/** The linked kernel's keys, in a module of their own that the edit doesn't evaluate again. */
writeFileSync(join(directory, "linked-keys.js"), `import { Component } from ${source("../../interface/component/component.ts")};
export const score = Symbol("score");
Component.register(score, { type: { type: "number" } });
`);
writeFileSync(linked, `import { System } from ${source("../../interface/system/system.ts")};
import { kernelOf } from ${source("../world/attach-kernel.ts")};
import { scaled } from "./helper.ts";
import { increment } from "fake-math";
import { score } from "./linked-keys.js";
// Serving evaluates this module again after an edit, declaring the same system again with the same keys.
const kernel = System.create({ name: "linked", kernel: "cpu", components: { write: [score] } }, (row) => { row[score] = increment(scaled(row.entity)); });
export const description = kernelOf(kernel);
`);
/** An application importing a kernel a library ships uncompiled, from its `dist`. */
const application = join(directory, "application.js");
mkdirSync(join(directory, "node_modules/@adobe"), { recursive: true });
symlinkSync(fileURLToPath(new URL("../../..", import.meta.url)), join(directory, "node_modules/@adobe/data-ecs"));
mkdirSync(join(directory, "node_modules/kernel-library/dist"), { recursive: true });
writeFileSync(join(directory, "node_modules/kernel-library/package.json"), JSON.stringify({ name: "kernel-library", type: "module", exports: "./dist/index.js" }));
writeFileSync(join(directory, "node_modules/kernel-library/dist/index.js"), `import { Component, System } from "@adobe/data-ecs";
const score = Symbol("score");
Component.register(score, { type: { type: "number" } });
export const kernel = System.create({ name: "library", kernel: "cpu", components: { write: [score] } }, (row) => { row[score] = row.entity * 2; });
`);
writeFileSync(application, `import { kernelOf } from ${source("../world/attach-kernel.ts")};
import { kernel } from "kernel-library";
export const description = kernelOf(kernel);
`);
/** Two kernels in one module, writing different functions of the entity. */
const pair = join(directory, "pair.js");
writeFileSync(pair, `import { System } from ${source("../../interface/system/system.ts")};
import { Component } from ${source("../../interface/component/component.ts")};
import { kernelOf } from ${source("../world/attach-kernel.ts")};
const score = Symbol("score");
Component.register(score, { type: { type: "number" } });
const doubled = System.create({ name: "doubled", kernel: "cpu", components: { write: [score] } }, (row) => { row[score] = row.entity * 2; });
const tripled = System.create({ name: "tripled", kernel: "cpu", components: { write: [score] } }, (row) => { row[score] = row.entity * 3; });
export const descriptions = [kernelOf(doubled), kernelOf(tripled)];
`);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** Runs a one-column kernel writing a function of the entity, for entities 3 and 4. */
const runs = (module: KernelModule, description: KernelDescription): readonly number[] => {
    const entities = Float64Array.from([3, 4]);
    const columns = description.columns.map(column => column.kind === "entity" ? entities : column.kind === "changed" ? new Uint32Array(2) : new Float64Array(2));
    const commands = { spawn: () => 0, begin: () => {}, value: () => {}, component: () => {} };
    module.create(columns.map(() => false), columns.map(() => 1), columns.map(() => 0))(columns, 0, 2, [], [], description.keys, undefined, commands, 1, new Float64Array(0), 0);
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
    const kernel = chunks.find(chunk => chunk.name.startsWith("kernel-"));
    const main = chunks.find(chunk => chunk.facadeModuleId === fixture);
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

test("a build gives each kernel the url of its own chunk", async () => {
    const outDir = join(directory, "dist-pair");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [kernelPlugin()],
        build: { outDir, minify: false, lib: { entry: pair, formats: ["es"], fileName: "main" } },
    });
    const main = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .find((item): item is Rollup.OutputChunk => item.type === "chunk" && item.facadeModuleId === pair);
    const { descriptions }: { descriptions: readonly KernelDescription[] } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    expect(new Set(descriptions.map(description => description.url)).size).toBe(2);
    const results = await Promise.all(descriptions.map(async description => runs(await import(/* @vite-ignore */ description.url), description)));
    expect(results).toEqual([[6, 8], [9, 12]]);
});

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
    const main = chunks.find(chunk => chunk.facadeModuleId === linked);
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

test("an application's build compiles the kernels a library ships uncompiled", async () => {
    const outDir = join(directory, "dist-application");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [kernelPlugin()],
        build: { outDir, minify: false, lib: { entry: application, formats: ["es"], fileName: "main" } },
    });
    const main = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .find((item): item is Rollup.OutputChunk => item.type === "chunk" && item.facadeModuleId === application);
    const { description }: { description: KernelDescription | undefined } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    expect(description).toBeDefined();
    const module: KernelModule = await import(/* @vite-ignore */ description?.url ?? "");
    expect(description === undefined ? [] : runs(module, description)).toEqual([6, 8]);
});
