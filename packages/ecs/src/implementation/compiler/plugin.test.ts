// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, expect, test } from 'vitest';
import { build, createServer, parseAst, transformWithOxc, type Rollup, type ViteDevServer } from 'vite';
import type { KernelDescription, KernelModule } from '../world/kernel.js';
import { plugin } from './plugin.js';

const source = (path: string) => JSON.stringify(fileURLToPath(new URL(path, import.meta.url)));
const directory = realpathSync(mkdtempSync(join(tmpdir(), "ecs-kernel-")));
/** The function a module the plugin built appends, which records its keys' declarations for the registry to read. */
const recorder = `function declare$(key, kind, declaration) { (globalThis[Symbol.for("@adobe/ecs/declarations@1")] ??= new Map()).set(key, { kind, declaration }); }`;
// The application's package, which names its modules' ids.
writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "fixture-app", type: "module" }));
const fixture = join(directory, "fixture.js");
writeFileSync(fixture, `import { System } from ${source("../../interface/system/system.ts")};
import { registerComponent } from ${source("../../interface/registry/declarations.ts")};
import { kernelOf } from ${source("../world/attach-kernel.ts")};
const score = Symbol("score");
registerComponent(score, { type: { type: "number" } });
const kernel = System.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = row.entity * 2; });
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
writeFileSync(join(directory, "linked-keys.js"), `import { registerComponent } from ${source("../../interface/registry/declarations.ts")};
export const score = Symbol("score");
registerComponent(score, { type: { type: "number" } });
`);
writeFileSync(linked, `import { System } from ${source("../../interface/system/system.ts")};
import { kernelOf } from ${source("../world/attach-kernel.ts")};
import { scaled } from "./helper.ts";
import { increment } from "fake-math";
import { score } from "./linked-keys.js";
// Serving evaluates this module again after an edit, declaring the same system again with the same keys.
const kernel = System.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = increment(scaled(row.entity)); });
export const description = kernelOf(kernel);
`);
/** Systems taking input, of a type another TypeScript module declares, which the test edits. */
const inputs = join(directory, "inputs.ts");
const inputTypes = join(directory, "input-types.ts");
const writeInputTypes = (field: string) => writeFileSync(inputTypes, `import type { Entity } from ${source("../../interface/entity/entity.ts")};\nexport type Push = { readonly entity: Entity; readonly ${field}: number };\n`);
writeInputTypes("by");
writeFileSync(inputs, `import { System } from ${source("../../interface/system/system.ts")};
import type { Push } from "./input-types.ts";
const push = System.create({}, (_context, input: Push) => { void input; });
const label = System.create({}, (_context, input: { readonly text?: string }) => { void input; });
export const schemas = [push, label].map(system => Reflect.get(system, "input"));
`);
/** A kernel spawning through a list another module declares, which the test edits. */
const listing = join(directory, "listing.js");
const listed = join(directory, "listed.js");
const writeListed = (keys: string) => writeFileSync(listed, `import { registerComponent } from ${source("../../interface/registry/declarations.ts")};
import { score } from "./linked-keys.js";
export const extra = Symbol("extra");
registerComponent(extra, { type: { const: true } });
export const Listed = [${keys}];
`);
writeListed("score");
writeFileSync(listing, `import { System } from ${source("../../interface/system/system.ts")};
import { kernelOf } from ${source("../world/attach-kernel.ts")};
import { score } from "./linked-keys.js";
import { Listed } from "./listed.js";
const kernel = System.create({ kernel: true, components: { read: [score] } }, (row, { commands }) => { commands.spawn(Listed)({ [score]: row[score] }); });
export const description = kernelOf(kernel);
`);
/** Two kernels in one module, writing different functions of the entity. */
const pair = join(directory, "pair.js");
writeFileSync(pair, `import { System } from ${source("../../interface/system/system.ts")};
import { registerComponent } from ${source("../../interface/registry/declarations.ts")};
import { kernelOf } from ${source("../world/attach-kernel.ts")};
const score = Symbol("score");
registerComponent(score, { type: { type: "number" } });
const doubled = System.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = row.entity * 2; });
const tripled = System.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = row.entity * 3; });
export const descriptions = [kernelOf(doubled), kernelOf(tripled)];
`);
/** A module of keys and what it declares with them, which serving evaluates again under another query. */
const keys = (declaration: string, released = "score") => `import { System as Systems } from ${source("../../interface/system/system.ts")};
import { registerComponent } from ${source("../../interface/registry/declarations.ts")};
import { Finalizer } from ${source("../../interface/finalizer/finalizer.ts")};
import { Rule } from ${source("../../interface/rule/rule.ts")};
import { labelOf } from ${source("../../interface/registry/names.ts")};
export const score = Symbol("score");
const shown = Symbol("shown");
registerComponent(score, ${declaration});
registerComponent(shown, { type: { const: true }, derived: true });
export const rule = Rule.create({ components: { has: [score] }, derive: [shown] });
export const release = Finalizer.create({ components: { read: [${released}] } }, () => {});
export const system = Systems.create({ components: { write: [score] } }, (row) => { row[score] = 1; });
export const kernel = Systems.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = 2; });
export const label = labelOf(score);
`;
const evaluated = join(directory, "evaluated.js");
writeFileSync(evaluated, keys(`{ type: { type: "number" } }`));
const changed = join(directory, "changed.js");
writeFileSync(changed, keys(`{ type: { type: "number" } }`));
const changedItems = join(directory, "changed-items.js");
writeFileSync(changedItems, keys(`{ type: { type: "number" } }`));
/** An application whose keys are its own and a dependency's, and a worker's. */
const identified = join(directory, "identified.js");
mkdirSync(join(directory, "node_modules/key-library/dist"), { recursive: true });
writeFileSync(join(directory, "node_modules/key-library/package.json"), JSON.stringify({ name: "key-library", type: "module", exports: "./dist/index.js" }));
writeFileSync(join(directory, "node_modules/key-library/dist/index.js"), `export const marker = Symbol("marker");\n`);
writeFileSync(join(directory, "worker-keys.js"), `export const message = Symbol("message");\nself.postMessage(String(message.description));\n`);
writeFileSync(identified, `import { labelOf } from ${source("../../interface/registry/names.ts")};
import { registerComponent } from ${source("../../interface/registry/declarations.ts")};
import { marker } from "key-library";
export const score = Symbol("score");
const twin = Symbol("score");
export default Symbol();
registerComponent(score, { type: { type: "number" } });
registerComponent(twin, { type: { type: "number" } });
export const labels = [labelOf(score), labelOf(twin), labelOf(marker)];
export const worker = () => new Worker(new URL("./worker-keys.js", import.meta.url), { type: "module" });
`);
/** Kernels adding a key and a list a package external to the build declares, so the build can't read them. */
mkdirSync(join(directory, "node_modules/external-keys"), { recursive: true });
writeFileSync(join(directory, "node_modules/external-keys/package.json"), JSON.stringify({ name: "external-keys", type: "module", exports: "./index.js" }));
writeFileSync(join(directory, "node_modules/external-keys/index.js"), `export const heat = Symbol("heat");\nexport const Pair = [Symbol("left"), Symbol("right")];\n`);
const externalKernel = (name: string, added: string) => `import { System } from ${source("../../interface/system/system.ts")};
import { registerComponent } from ${source("../../interface/registry/declarations.ts")};
import { kernelOf } from ${source("../world/attach-kernel.ts")};
import { ${added} } from "external-keys";
const score = Symbol("score");
registerComponent(score, { type: { type: "number" } });
const kernel = System.create({ kernel: true, components: { read: [score] } }, (row, { commands }) => { commands.add(row.entity, ${added}, row[score]); });
export const description = kernelOf(kernel);
`;
const externalKey = join(directory, "external-key.js");
writeFileSync(externalKey, externalKernel("externalKey", "heat"));
const externalList = join(directory, "external-list.js");
writeFileSync(externalList, externalKernel("externalList", "Pair"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const own = fileURLToPath(new URL("../../..", import.meta.url));
/** The modules an installed copy's code starts from: its root, its worker, and those compiled code imports. */
const copyEntries = ["index", "implementation/world/worker", "implementation/world/attach-kernel", "implementation/world/prepared-spawn", "implementation/world/prepared-lookup"];
let builtDist: Promise<ReadonlyMap<string, string>> | null = null;

/** Every relative module a module's code imports or re-exports from. */
const relativeImports = (code: string): readonly string[] => parseAst(code).body.flatMap(statement =>
    (statement.type === "ImportDeclaration" || statement.type === "ExportAllDeclaration" || statement.type === "ExportNamedDeclaration")
        && typeof statement.source?.value === "string" && statement.source.value.startsWith(".") ? [statement.source.value] : []);

/**
 * The package's `dist` code by path within it, built from the sources as `tsc` emits each module on its own: the
 * modules the entries reach at runtime, so no test reads a previous build. Built once per test file.
 */
const distFromSources = (): Promise<ReadonlyMap<string, string>> => builtDist ??= (async () => {
    const sources = join(own, "src");
    const files = new Map<string, string>();
    const visit = async (file: string): Promise<void> => {
        const path = relative(sources, file).replace(/\.ts$/, ".js");
        if (files.has(path)) return;
        files.set(path, "");
        const { code } = await transformWithOxc(readFileSync(file, "utf8"), file, { lang: "ts" });
        files.set(path, code);
        await Promise.all(relativeImports(code).map(specifier => visit(resolve(dirname(file), specifier.replace(/\.js$/, ".ts")))));
    };
    await Promise.all(copyEntries.map(entry => visit(join(sources, `${entry}.ts`))));
    return files;
})();

/** Installs a built copy of the package in a project's `node_modules`, a directory of its own as an install makes. */
const installCopy = async (project: string): Promise<string> => {
    const copy = join(project, "node_modules/@adobe/ecs");
    mkdirSync(copy, { recursive: true });
    writeFileSync(join(copy, "package.json"), readFileSync(join(own, "package.json")));
    // The package ships its sources beside its build, as types for its build read them.
    cpSync(join(own, "src"), join(copy, "src"), { recursive: true });
    for (const [path, code] of await distFromSources()) {
        mkdirSync(dirname(join(copy, "dist", path)), { recursive: true });
        writeFileSync(join(copy, "dist", path), code);
    }
    return copy;
};

/** Runs a one-column kernel writing a function of the entity, for entities 3 and 4. */
const runs = (module: KernelModule, description: KernelDescription): readonly number[] => {
    const entities = Float64Array.from([3, 4]);
    const columns = description.columns.map(column => column.kind === "entity" ? entities : column.kind === "changed" ? new Uint32Array(2) : new Float64Array(2));
    const commands = { spawners: [], begin: () => {}, value: () => {}, component: () => {} };
    module.create(columns.map(() => false), columns.map(() => 1), columns.map(() => 0))(columns, 0, 2, [], [], description.keys, undefined, commands, 1, new Float64Array(0), 0);
    return [...columns[description.columns.findIndex(column => column.kind === "field")] ?? []];
};

test("a build emits each kernel as its own chunk, referenced by the description's url", async () => {
    const outDir = join(directory, "dist");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [plugin()],
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
        configFile: false, logLevel: "silent", root: directory, plugins: [plugin()],
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
        configFile: false, logLevel: "silent", root: directory, plugins: [plugin()],
        build: { outDir, minify: false, lib: { entry: pair, formats: ["es"], fileName: "main" } },
    });
    const main = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .find((item): item is Rollup.OutputChunk => item.type === "chunk" && item.facadeModuleId === pair);
    const { descriptions }: { descriptions: readonly KernelDescription[] } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    expect(new Set(descriptions.map(description => description.url)).size).toBe(2);
    const results = await Promise.all(descriptions.map(async description => runs(await import(/* @vite-ignore */ description.url), description)));
    expect(results).toEqual([[6, 8], [9, 12]]);
});

/** The url a page's code gives a module's first kernel, as the dev server serves it to a browser and its workers. */
const servedUrl = async (server: ViteDevServer, module: string): Promise<string> => {
    const code = (await server.transformRequest(module))?.code ?? "";
    return /"(\/@ecs-kernel\/[^"]+)"/.exec(code)?.[1] ?? "";
};

test("serve loads a kernel module by url, also before its parent was transformed", async () => {
    // Modules are untyped here; their shapes are what the plugin emits.
    const description: KernelDescription = await serve(async server => {
        const parent = await server.ssrLoadModule(fixture);
        expect(server.config.optimizeDeps.exclude).toContain("@adobe/ecs");
        return parent.description;
    });
    const url = await serve(server => servedUrl(server, fixture));
    expect(url).toMatch(/^\/@ecs-kernel\/.+\?h=/);
    const module = await serve(server => server.ssrLoadModule(url));
    expect(runs({ create: module.create }, description)).toEqual([6, 8]);
});

test("serve in node gives each kernel a url a node worker imports, as a pool's do outside the dev server", async () => {
    const description: KernelDescription = await serve(async server => (await server.ssrLoadModule(fixture)).description);
    expect(description.url).toMatch(/^data:text\/javascript;base64,/);
    const { Worker } = await import("node:worker_threads");
    const worker = new Worker(`const { parentPort } = require("node:worker_threads");
import(${JSON.stringify(description.url)}).then(module => parentPort.postMessage(typeof module.create), error => parentPort.postMessage(String(error)));`, { eval: true });
    const reply = await new Promise<unknown>(resolve => worker.once("message", resolve));
    await worker.terminate();
    expect(reply).toBe("function");
});

test("serve rejects a url for a different version of the kernel", async () => {
    const stale = (await serve(server => servedUrl(server, fixture))).replace(/\?h=.*/, "?h=stale");
    await expect(serve(server => server.ssrLoadModule(stale))).rejects.toThrow(/changed since its description was compiled/);
});

test("a build inlines functions from TypeScript modules and packages", async () => {
    const outDir = join(directory, "dist-linked");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [plugin()],
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

test("serve compiles kernels again when a list they import changes", async () => {
    try {
        await serve(async server => {
            const before: KernelDescription = (await server.ssrLoadModule(listing)).description;
            expect(before.keys.map(String)).toEqual(["Symbol(score)"]);
            writeListed("score, extra");
            server.watcher.emit("change", listed);
            const after: KernelDescription = (await server.ssrLoadModule(listing)).description;
            expect(after.url).not.toBe(before.url);
            expect(after.keys.map(String)).toEqual(["Symbol(score)", "Symbol(extra)"]);
        });
    } finally {
        writeListed("score");
    }
});

test("an application's build compiles the kernels a library ships uncompiled", async () => {
    // An application importing a kernel a library ships uncompiled, from its `dist`, with the package installed.
    const project = join(directory, "shipped");
    const copy = await installCopy(project);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shipped-app", type: "module" }));
    mkdirSync(join(project, "node_modules/kernel-library/dist"), { recursive: true });
    writeFileSync(join(project, "node_modules/kernel-library/package.json"), JSON.stringify({ name: "kernel-library", type: "module", exports: "./dist/index.js" }));
    // As the library's own build with the plugin left it, recording its keys' declarations for every copy to read.
    writeFileSync(join(project, "node_modules/kernel-library/dist/index.js"), `import { System } from "@adobe/ecs";
const score = Symbol("score");
declare$(score, "component", { type: { type: "number" } });
${recorder}
export const kernel = System.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = row.entity * 2; });
`);
    // The test hook comes from the installed copy, which the library's compiled kernel attaches to.
    const application = join(project, "application.js");
    writeFileSync(application, `import { kernelOf } from ${JSON.stringify(join(copy, "dist/implementation/world/attach-kernel.js"))};
import { kernel } from "kernel-library";
export const description = kernelOf(kernel);
`);
    const outDir = join(project, "dist");
    const output = await build({
        configFile: false, logLevel: "silent", root: project, plugins: [plugin()],
        build: { outDir, minify: false, lib: { entry: application, formats: ["es"], fileName: "main" } },
    });
    const main = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .find((item): item is Rollup.OutputChunk => item.type === "chunk" && item.facadeModuleId === application);
    const { description }: { description: KernelDescription | undefined } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    expect(description).toBeDefined();
    const module: KernelModule = await import(/* @vite-ignore */ description?.url ?? "");
    expect(description === undefined ? [] : runs(module, description)).toEqual([6, 8]);
});

test("an application's build compiles a library's reducing kernel, with the operator the library's registration gives", async () => {
    const project = join(directory, "reducing");
    const copy = await installCopy(project);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "reducing-app", type: "module" }));
    mkdirSync(join(project, "node_modules/reducing-library/dist"), { recursive: true });
    writeFileSync(join(project, "node_modules/reducing-library/package.json"), JSON.stringify({ name: "reducing-library", type: "module", exports: "./dist/index.js" }));
    // As its build in library mode left it: types stripped, the registrations it gave in their place.
    writeFileSync(join(project, "node_modules/reducing-library/dist/index.js"), `import { System } from "@adobe/ecs";
const score = Symbol();
declare$(score, "component", { type: { type: "number" } });
const largest = Symbol();
declare$(largest, "resource", { type: { type: "number", default: 0 }, reduce: "max" });
${recorder}
export const kernel = System.create({ kernel: true, components: { read: [score] }, resources: { reduce: [largest] } }, (row, { reduce }) => { reduce[largest](row[score]); });
`);
    const application = join(project, "application.js");
    writeFileSync(application, `import { kernelOf } from ${JSON.stringify(join(copy, "dist/implementation/world/attach-kernel.js"))};
import { kernel } from "reducing-library";
export const description = kernelOf(kernel);
`);
    const outDir = join(project, "dist");
    const output = await build({
        configFile: false, logLevel: "silent", root: project, plugins: [plugin()],
        build: { outDir, minify: false, lib: { entry: application, formats: ["es"], fileName: "main" } },
    });
    const main = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .find((item): item is Rollup.OutputChunk => item.type === "chunk" && item.facadeModuleId === application);
    const { description }: { description: KernelDescription | undefined } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    expect(description?.reductions.map(reduced => reduced.operator)).toEqual(["max"]);
});

test("an application's build says so when a library's dist doesn't register a resource it reduces", async () => {
    const project = join(directory, "unregistered");
    await installCopy(project);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "unregistered-app", type: "module" }));
    mkdirSync(join(project, "node_modules/unregistered-library/dist"), { recursive: true });
    writeFileSync(join(project, "node_modules/unregistered-library/package.json"), JSON.stringify({ name: "unregistered-library", type: "module", exports: "./dist/index.js" }));
    // As a build without library mode leaves it: the types gone and no registrations in their place.
    writeFileSync(join(project, "node_modules/unregistered-library/dist/index.js"), `import { System } from "@adobe/ecs";
const score = Symbol();
const largest = Symbol();
export const kernel = System.create({ kernel: true, components: { read: [score] }, resources: { reduce: [largest] } }, (row, { reduce }) => { reduce[largest](row[score]); });
`);
    const application = join(project, "application.js");
    writeFileSync(application, `export { kernel } from "unregistered-library";
`);
    const built = build({
        configFile: false, logLevel: "silent", root: project, plugins: [plugin()],
        build: { outDir: join(project, "dist"), minify: false, lib: { entry: application, formats: ["es"], fileName: "main" } },
    });
    await expect(built).rejects.toThrow("which its module's JavaScript doesn't register: declare it in TypeScript, and build a library declaring it with Compiler.plugin({ library: true })");
});

test("a build records the keys a module declares, which the copy of the package the application loads registers", async () => {
    const project = join(directory, "declaring");
    const copy = await installCopy(project);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "declaring-app", version: "1.0.0", type: "module" }));
    const keys = join(project, "keys.ts");
    writeFileSync(keys, `import type { F32 } from "@adobe/ecs";
export const speed = Symbol();
declare module "@adobe/ecs" {
    interface Resources { [speed]: { type: F32; default: 2 } }
}
`);
    const application = join(project, "application.js");
    writeFileSync(application, `export { speed } from "./keys.ts";\n`);
    const outDir = join(project, "dist");
    const output = await build({
        configFile: false, logLevel: "silent", root: project, plugins: [plugin()],
        build: { outDir, minify: false, lib: { entry: application, formats: ["es"], fileName: "main" }, rolldownOptions: { external: ["@adobe/ecs"] } },
    });
    const chunks = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .filter((item): item is Rollup.OutputChunk => item.type === "chunk");
    // A library's build ships this: its declarations recorded for every copy of the package, importing nothing.
    expect(chunks.map(chunk => chunk.code).join("\n")).toContain(`Symbol.for("@adobe/ecs/declarations@1")`);
    expect(chunks.map(chunk => chunk.code).join("\n")).not.toMatch(/^import /m);
    const main = chunks.find(chunk => chunk.facadeModuleId === application);
    const { speed }: { speed: symbol } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    // The registry of the installed copy, loaded as an application loads the package, reads it.
    await import(/* @vite-ignore */ pathToFileURL(join(copy, "dist/index.js")).href);
    const { declarationOf }: { declarationOf: (key: unknown) => unknown } = await import(/* @vite-ignore */ pathToFileURL(join(copy, "dist/interface/registry/names.js")).href);
    expect(declarationOf(speed)).toEqual({ type: { type: "number", precision: 1, default: 2 } });
});

test("a library's build in library mode ships its registrations and input schemas, its kernels as source and no ids", async () => {
    const project = join(directory, "library");
    await installCopy(project);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "a-library", version: "2.0.0", type: "module" }));
    const entry = join(project, "library.ts");
    writeFileSync(entry, `import { System, type F32 } from "@adobe/ecs";
export const speed = Symbol();
declare module "@adobe/ecs" {
    interface Components { [speed]: { type: F32 } }
}
export const push = System.create({}, (_context, input: { readonly by: number }) => { void input; });
export const slow = System.create({ kernel: true, components: { write: [speed] } }, row => { row[speed] = row[speed] / 2; });
`);
    const outDir = join(project, "dist");
    const output = await build({
        configFile: false, logLevel: "silent", root: project, plugins: [plugin({ library: true })],
        build: { outDir, minify: false, lib: { entry, formats: ["es"], fileName: "index" }, rolldownOptions: { external: ["@adobe/ecs"] } },
    });
    const code = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .flatMap(item => item.type === "chunk" ? [item.code] : []).join("\n");
    expect(code).toContain(`Symbol.for("@adobe/ecs/declarations@1")`);
    expect(code).toMatch(/declare\$\(speed, "component", \{ type: \{\s*"type": "number",\s*"precision": 1\s*\} \}\)/);
    // The input's schema, passed to its create.
    expect(code).toMatch(/"by": \{\s*"type": "number"\s*\}/);
    expect(code).toContain(`row[speed] = row[speed] / 2`);
    expect(code).not.toContain("attachKernel");
    expect(code).not.toContain("identify$");
});

test("serve accepts a module of keys evaluated again, which makes the same keys, systems, rules and finalizers by their ids", async () => {
    await serve(async server => {
        const first = await server.ssrLoadModule(evaluated);
        const again = await server.ssrLoadModule(`${evaluated}?evaluated=again`);
        const { sameItem } = await server.ssrLoadModule(JSON.parse(source("../../interface/registry/items.ts")));
        expect(again.score).not.toBe(first.score);
        expect([first.label, again.label]).toEqual(["score", "score"]);
        expect(again.system).not.toBe(first.system);
        expect([sameItem(again.system, first.system), sameItem(again.kernel, first.kernel), sameItem(again.kernel, again.system)]).toEqual([true, true, false]);
        expect(again.rule).toBe(first.rule);
        expect(again.release).toBe(first.release);
        // Each is labeled by its binding.
        expect([again.system.name, first.kernel.name]).toEqual(["system", "kernel"]);
    });
});

test("serve reports a finalizer evaluated again under its id with another declaration", async () => {
    await serve(async server => {
        await server.ssrLoadModule(changedItems);
        writeFileSync(changedItems, keys(`{ type: { type: "number" } }`, "shown"));
        await expect(server.ssrLoadModule(`${changedItems}?evaluated=changed`)).rejects.toThrow(`Cannot declare "release" (fixture-app/changed-items.js#release): its id is another item's, with another declaration; if a module was evaluated again with a changed declaration, reload the page.`);
    });
});

test("serve reports a key evaluated again with another declaration", async () => {
    await serve(async server => {
        await server.ssrLoadModule(changed);
        writeFileSync(changed, keys(`{ type: { type: "string" } }`));
        await expect(server.ssrLoadModule(`${changed}?evaluated=changed`)).rejects.toThrow(`Cannot register component "score" (fixture-app/changed.js#score): its id is another key's, with another declaration`);
    });
});

/** Every id a build's code gives a symbol. */
const idsIn = (code: string): readonly string[] => [...code.matchAll(/identify\$[$\d]*\(Symbol\([^)]*\), "([^"]*)"\)/g)].map(match => match[1] ?? "");

test("a build gives top-level symbols ids naming no absolute path, also in workers", async () => {
    const outDir = join(directory, "dist-identified");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [plugin()],
        build: { outDir, minify: false, rolldownOptions: { input: identified, preserveEntrySignatures: "strict" } },
    });
    const items = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : []);
    const main = items.find((item): item is Rollup.OutputChunk => item.type === "chunk" && item.facadeModuleId === identified);
    expect(new Set(idsIn(main?.code ?? "").filter(id => !id.startsWith("@adobe/ecs/")))).toEqual(new Set(["fixture-app/identified.js#score", "fixture-app/identified.js#twin", "fixture-app/identified.js#default", "key-library/dist/index.js#marker"]));
    const worker = items.find(item => item.fileName.includes("worker-keys"));
    expect(idsIn(worker === undefined ? "" : worker.type === "chunk" ? worker.code : String(worker.source))).toEqual(["fixture-app/worker-keys.js#message"]);
    const ids = items.flatMap(item => idsIn(item.type === "chunk" ? item.code : String(item.source)));
    expect(ids.filter(id => id.startsWith("/") || id.includes(directory) || id.includes(tmpdir()))).toEqual([]);
    const { labels }: { labels: readonly string[] } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    // Keys are labeled by their descriptions, however many share one.
    expect(labels).toEqual(["score", "score", "marker"]);
});

test("a second instance of the plugin in one bundle does nothing, as when an application also lists it for workers", async () => {
    const outDir = join(directory, "dist-twice");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [plugin(), plugin()],
        build: { outDir, minify: false, lib: { entry: fixture, formats: ["es"], fileName: "main" } },
    });
    const chunks = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .filter((item): item is Rollup.OutputChunk => item.type === "chunk");
    expect(chunks.filter(chunk => chunk.name.startsWith("kernel-"))).toHaveLength(1);
    const main = chunks.find(chunk => chunk.facadeModuleId === fixture);
    expect(idsIn(main?.code ?? "").filter(id => id.startsWith("fixture-app/"))).toEqual(["fixture-app/fixture.js#score"]);
    const { description }: { description: KernelDescription } = await import(/* @vite-ignore */ pathToFileURL(join(outDir, main?.fileName ?? "")).href);
    expect(runs(await import(/* @vite-ignore */ description.url), description)).toEqual([6, 8]);
});

test("a build takes a name from a package external to it as one key, and registration rejects a list there", async () => {
    const outDir = join(directory, "dist-external");
    const output = await build({
        configFile: false, logLevel: "silent", root: directory, plugins: [plugin()],
        build: { outDir, minify: false, rolldownOptions: { input: [externalKey, externalList], external: ["external-keys"], preserveEntrySignatures: "strict" } },
    });
    const chunks = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : [])
        .filter((item): item is Rollup.OutputChunk => item.type === "chunk");
    const url = (entry: string) => pathToFileURL(join(outDir, chunks.find(chunk => chunk.facadeModuleId === entry)?.fileName ?? "")).href;
    const { description }: { description: KernelDescription } = await import(/* @vite-ignore */ url(externalKey));
    expect(description.keys.map(String)).toEqual(["Symbol(heat)"]);
    await expect(import(/* @vite-ignore */ url(externalList))).rejects.toThrow(`names a list of components where a command takes one component; its kernel's build couldn't read the list, so name it from a module the build reads, or as an array literal.`);
});

test("compiled code imports the runtime from the copy of the package its module imports, not the plugin's own", async () => {
    // A project whose installed copy of the package is a directory of its own, as a lockfile's copy is beside a linked one.
    const project = join(directory, "copied");
    await installCopy(project);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "copy-app", type: "module" }));
    const module = join(project, "copied.js");
    writeFileSync(module, `import { System, Component } from "@adobe/ecs";
const score = Symbol("score");
declare$(score, "component", { type: { type: "number" } });
export const kernel = System.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = row.entity * 2; });
${recorder}
export const spawner = System.create({ kernel: false, components: { read: [score] } }, (row, { commands }) => { commands.spawn([score])({ [score]: row[score] }); });
`);
    const server = await createServer({
        configFile: false, logLevel: "silent", root: project, plugins: [plugin()],
        appType: "custom", server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true },
    });
    try {
        const code = (await server.transformRequest(module))?.code ?? "";
        const imported = [...code.matchAll(/^import .* from "([^"]+)";$/gm)].map(match => match[1] ?? "");
        // The server serves files under its root by their path from it: here, the project's copy.
        expect(imported.filter(path => path.includes("/implementation/world/"))).toEqual([
            "/node_modules/@adobe/ecs/dist/implementation/world/attach-kernel.js",
            "/node_modules/@adobe/ecs/dist/implementation/world/prepared-spawn.js",
        ]);
        expect(code).not.toContain(own);
        // The copy's System namespace is recognized, so its declarations take their ids.
        expect(code).toContain(`"copy-app/copied.js#kernel"`);
    } finally {
        await server.close();
    }
});

test("serve passes each system the schema of its body's input, from types other modules declare, and again when they change", async () => {
    try {
        await serve(async server => {
            expect((await server.ssrLoadModule(inputs)).schemas).toEqual([
                { type: "object", properties: { entity: { type: "integer", format: "entity" }, by: { type: "number" } } },
                { type: "object", properties: { text: { type: "string" } }, required: [] },
            ]);
            writeInputTypes("to");
            server.watcher.emit("change", inputTypes);
            const [push] = (await server.ssrLoadModule(inputs)).schemas;
            expect(push).toEqual({ type: "object", properties: { entity: { type: "integer", format: "entity" }, to: { type: "number" } } });
        });
    } finally {
        writeInputTypes("by");
    }
});

test("a build fails at a system's input whose type can't be one", async () => {
    const entry = join(directory, "bad-input.ts");
    writeFileSync(entry, `import { System } from ${source("../../interface/system/system.ts")};\nexport const bad = System.create({}, (_context, input: { readonly when: Big["when"] }) => { void input; });\n`);
    await expect(build({
        configFile: false, logLevel: "silent", root: directory, plugins: [plugin()],
        build: { outDir: join(directory, "dist-bad-input"), minify: false, lib: { entry, formats: ["es"], fileName: "main" } },
    })).rejects.toThrow("(typeof X)[keyof typeof X]");
});
