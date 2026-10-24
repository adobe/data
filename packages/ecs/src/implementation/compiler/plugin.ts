// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Plugin, Rollup, ViteDevServer } from 'vite';
import { estreeOf } from './estree.js';
import { describeFailure } from './failure.js';
import { identify as identifyModule, moduleIdOf, type PackageOf } from './identify.js';
import { buildId, kernelHash, parseKernelId, serveUrl } from './kernel-id.js';
import { createLinker, type LinkHost, type Linker } from './link.js';
import { augmentationInsertions, reductionsIn, registeredReductionsIn, type AugmentationHost } from './augmentations.js';
import { inputInsertions, type InputHost } from './input-schemas.js';
import { copyForImporter, isInPackageCopy, namespaceCopyOf, packagePathOf, typesFileOf } from './paths.js';
import { moduleOf, type TypedProgram } from './type-schemas.js';
import { insertInto, locateThroughMap } from './source-map.js';
import { transformKernels } from './transform.js';

const scripts = /\.[cm]?[jt]sx?$/;
const packageName = "@adobe/ecs";

type CachedKernel = { readonly source: string; readonly hash: string };

const loaders: { readonly [extension: string]: "ts" | "tsx" | "jsx" } = { ts: "ts", mts: "ts", cts: "ts", tsx: "tsx", jsx: "jsx" };

/** A file's code as JavaScript, with types stripped and lines mapped back to the source. */
const loadFile = async (file: string): Promise<{ readonly code: string; readonly locate?: ReturnType<typeof locateThroughMap> }> => {
    const code = await readFile(file, "utf8");
    const loader = loaders[file.slice(file.lastIndexOf(".") + 1)];
    if (loader === undefined) return { code };
    const { transformWithOxc } = await import("vite");
    const result = await transformWithOxc(code, file, { lang: loader, sourcemap: true });
    return { code: result.code, locate: result.map === undefined ? undefined : locateThroughMap(result.code, result.map.mappings) };
};

/** The name and version each directory's package.json gives, read once per directory. */
const packages = (): PackageOf => {
    const found = new Map<string, ReturnType<PackageOf>>();
    return directory => {
        if (found.has(directory)) return found.get(directory);
        let entry: ReturnType<PackageOf>;
        try {
            const json: unknown = JSON.parse(readFileSync(`${directory}/package.json`, "utf8"));
            const name: unknown = typeof json === "object" && json !== null ? Reflect.get(json, "name") : undefined;
            const version: unknown = typeof json === "object" && json !== null ? Reflect.get(json, "version") : undefined;
            entry = typeof name !== "string" || name === "" ? null : typeof version === "string" && version !== "" ? { name, version } : { name };
        }
        catch {
            // No package.json here, or none that parses.
            entry = undefined;
        }
        found.set(directory, entry);
        return entry;
    };
};

/** Vite's parser of TypeScript, loaded by the first kernel transform, which reads `reduce` traits with it. */
let parseTypes: typeof import("vite").parseAst | null = null;

const noReductions: ReadonlyMap<string, string> = new Map();

/**
 * The `reduce` traits a file's declarations give: read from a TypeScript file's source, and from the registrations a
 * JavaScript file's build gave them, as a library's `dist` ships them.
 */
const reductionsOf = (file: string): ReadonlyMap<string, string> => {
    const extension = file.slice(file.lastIndexOf(".") + 1);
    const lang = loaders[extension] ?? (extension === "js" || extension === "mjs" ? "js" : undefined);
    if (parseTypes === null || lang === undefined) return noReductions;
    let code: string;
    try {
        code = readFileSync(file, "utf8");
    }
    catch {
        return noReductions;
    }
    if (!code.includes("reduce")) return noReductions;
    if (lang === "ts" || lang === "tsx") return code.includes("declare module") ? reductionsIn(parseTypes(code, { lang }, file)) : noReductions;
    // A bundle may have renamed the registrations' import, so any JavaScript giving `reduce` is read.
    return registeredReductionsIn(parseTypes(code, { lang }, file));
};

/** Resolves imports through the build, from whichever transform runs. */
const buildHost = (resolver: () => Rollup.PluginContext): LinkHost => ({
    reductions: reductionsOf,
    resolve: async (specifier, importer) => {
        const resolved = await resolver().resolve(specifier, importer, { skipSelf: true });
        if (resolved === null) return { error: `${specifier} can't be resolved from ${importer}` };
        if (resolved.external) {
            return specifier === packageName ? copyForImporter(importer).index : { error: `${specifier} is external to the build, so kernels can't inline from it`, unreadable: true };
        }
        const id = resolved.id.split("?")[0] ?? resolved.id;
        return id.includes("\0") || !isAbsolute(id) ? { error: `${specifier} isn't a file` } : id;
    },
    load: loadFile,
});

/**
 * Compiles kernel systems (`kernel: true` or `"gpu"`). Runs after TypeScript is stripped and before minification, so it sees plain JS
 * with source names. Each kernel's `create` becomes its own module at `description.url`: served from a
 * root-absolute url in dev, and emitted as a chunk in a build.
 *
 * Functions and constants kernels import are read from their files, with types stripped, and inlined (`link.ts`).
 * The application's build compiles every kernel, its dependencies' too: a library ships its kernels uncompiled.
 *
 * Also gives each top-level `Symbol(...)` declaration an id, its package's name, its module's path in the package and
 * its binding, by which the registry knows the symbol a module evaluated again makes as the same key, and in the same
 * way the declaration of each top-level binding's system, rule or finalizer, as the same item (`identify.ts`).
 *
 * Dev dep pre-bundling bypasses plugins and breaks the runtime's worker url, so `@adobe/ecs` is excluded from it.
 * Consumers must also add to `optimizeDeps.exclude` any dependency that defines kernels or keys, imports
 * `@adobe/ecs`, or has functions kernels import; otherwise its kernels reach the runtime uncompiled, which fails
 * at registration, its keys have no ids, or its functions can't be read.
 *
 * The plugin adds itself to worker bundles; an instance after the first in one bundle does nothing.
 */
/** Where a served kernel's url goes in node's code, until its module is compiled. */
const inlinePlaceholder = (index: number, hash: string): string => `@ecs-kernel-inline/${index}/${hash}`;

/** Code with each kernel's placeholder replaced by its module as a `data:` url, which node imports on any thread. */
const inlineKernels = (code: string, kernels: readonly string[], hashes: readonly string[]): string =>
    kernels.reduce((inlined, source, index) => inlined.replaceAll(
        JSON.stringify(inlinePlaceholder(index, hashes[index] ?? "")),
        JSON.stringify(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`),
    ), code);

const typed = /\.[cm]?tsx?$/;

/**
 * Registers the keys `declare module "@adobe/ecs"` blocks declare (`augmentations.ts`), and passes each system's
 * `create` the schema of its body's input, from the type of the body's parameter after its context
 * (`input-schemas.ts`). It runs before TypeScript is stripped, which both read.
 */
const inputPlugin = (): Plugin => {
    let repeated = false;
    let server: ViteDevServer | undefined;
    /** Modules whose input types each file declares, and the files each module's input types were read from. */
    const dependents = new Map<string, Set<string>>();
    const dependencies = new Map<string, readonly string[]>();
    const depend = (parent: string, files: readonly string[]): void => {
        for (const file of dependencies.get(parent) ?? []) dependents.get(file)?.delete(parent);
        dependencies.set(parent, files);
        for (const file of files) {
            const parents = dependents.get(file) ?? new Set<string>();
            parents.add(parent);
            dependents.set(file, parents);
        }
    };
    /** The package's own files' syntax as last parsed, which every module reading the package's types shares. */
    const parsed = new Map<string, { readonly code: string; readonly program: TypedProgram }>();
    const instance: Plugin = {
        name: `${packageName}/input`,
        enforce: "pre",
        configResolved: config => {
            repeated = config.plugins.find(other => other.name === instance.name) !== instance;
        },
        configureServer: devServer => {
            server = devServer;
        },
        // A module whose input types come from a changed file is transformed again, for its schemas.
        watchChange(id) {
            for (const parent of dependents.get(id) ?? []) {
                for (const module of server?.moduleGraph.getModulesByFile(parent) ?? []) server?.moduleGraph.invalidateModule(module);
            }
        },
        async transform(code, id) {
            const file = id.split("?")[0] ?? id;
            if (repeated || id.includes("\0") || !typed.test(file)) return null;
            // Only a module declaring keys, or creating systems, has anything for either pass.
            if (!(code.includes("declare module") && code.includes("@adobe/ecs")) && !(code.includes("System") && code.includes(".create("))) return null;
            const { parseAst } = await import("vite");
            const resolved = async (specifier: string, importer: string) => await this.resolve(specifier, importer, { skipSelf: true });
            const host: InputHost & AugmentationHost = {
                parse: (source, path) => {
                    const known = parsed.get(path);
                    if (known !== undefined && known.code === source) return known.program;
                    const program = parseAst(source, { lang: path.endsWith("x") ? "tsx" : "ts" }, path);
                    if (packagePathOf(path) !== null) parsed.set(path, { code: source, program });
                    return program;
                },
                resolve: async (specifier, importer) => {
                    const found = await resolved(specifier, importer);
                    if (found === null) return null;
                    // A build that treats the package as external still reads its types, from the importer's copy.
                    const path = found.external ? (specifier === packageName ? copyForImporter(importer).index : null) : found.id.split("?")[0] ?? found.id;
                    return path === null || path.includes("\0") || !isAbsolute(path) ? null : typesFileOf(path);
                },
                load: file => readFile(file, "utf8"),
                packagePath: packagePathOf,
                // The package's own modules share the registry of the copy they're in; any other module's registrations,
                // a library's shipped among them, import the copy it resolves.
                declareModule: importer => isInPackageCopy(importer) ? copyForImporter(importer).declare : `${packageName}/declare`,
                isSystem: async (specifier, importer) => {
                    const found = await resolved(specifier, importer);
                    return found !== null && (found.external ? specifier === packageName : namespaceCopyOf(found.id, "System") !== null);
                },
            };
            const module = moduleOf(file, code, host.parse(code, file));
            const results = [await augmentationInsertions(module, host), await inputInsertions(module, host)].filter(result => result !== null);
            const read = [...new Set(results.flatMap(result => result.dependencies))].filter(dependency => dependency !== file);
            for (const dependency of read) this.addWatchFile(dependency);
            depend(file, read);
            for (const result of results) if ("failure" in result) return this.error(describeFailure(result.failure), result.failure.position);
            const insertions = results.flatMap(result => "insertions" in result ? result.insertions : []);
            return insertions.length === 0 ? null : insertInto(code, insertions, file);
        },
    };
    return instance;
};

/**
 * The plugin's two parts: registrations and input schemas, before TypeScript is stripped, and kernels and ids,
 * after. A library's build takes `{ library: true }`, the first part alone: its build then ships the registrations and
 * schemas its types give, which an application's build, reading only JavaScript there, can't make, and leaves its
 * kernels as source and its keys without ids, which the application's plugin compiles and gives.
 */
export const plugin = (options: { readonly library?: boolean } = {}): Plugin[] => pluginWith(options);

/**
 * The plugin, for this package's tests: with `automatic: false`, unflagged systems run as written, so suites of the
 * row path run their bodies that way too.
 */
export const pluginWith = ({ library = false, automatic = true }: { readonly library?: boolean; readonly automatic?: boolean }): Plugin[] =>
    library ? [inputPlugin()] : [inputPlugin(), compilePlugin(automatic)];

const compilePlugin = (automatic: boolean): Plugin => {
    let serve = true;
    /** Whether an earlier instance of the plugin is in the same bundle. */
    let repeated = false;
    let server: ViteDevServer | undefined;
    const packageOf = packages();
    /**
     * A linker per environment, since client and SSR builds resolve imports under different conditions. Each resolves
     * through its environment's latest transform.
     */
    const contexts = new Map<boolean, Rollup.PluginContext>();
    const linkers = new Map<boolean, Linker>();
    const linkerFor = (ssr: boolean, context: Rollup.PluginContext): Linker => {
        contexts.set(ssr, context);
        const existing = linkers.get(ssr);
        if (existing !== undefined) return existing;
        const linker = createLinker(buildHost(() => contexts.get(ssr) ?? context), input => estreeOf((contexts.get(ssr) ?? context).parse(input)));
        linkers.set(ssr, linker);
        return linker;
    };
    /** Modules whose kernels inline each file, and the files each module's kernels inline. */
    const dependents = new Map<string, Set<string>>();
    const dependencies = new Map<string, readonly string[]>();
    const depend = (parent: string, files: readonly string[]): void => {
        for (const file of dependencies.get(parent) ?? []) dependents.get(file)?.delete(parent);
        dependencies.set(parent, files);
        for (const file of files) {
            const parents = dependents.get(file) ?? new Set<string>();
            parents.add(parent);
            dependents.set(file, parents);
        }
    };
    /** Kernel modules by parent module id, kept current as parents are transformed. */
    const kernels = new Map<string, readonly CachedKernel[]>();
    /** Reference ids of the kernel chunks a build emitted. */
    const chunks = new Set<string>();
    /**
     * The bundler gives chunks emitted under one name one reference, so each kernel's name carries its hash. Its
     * `create` is imported at run time, which the bundle can't see, so the chunk keeps its exports even where the
     * build drops entries' signatures, as an application's does.
     */
    const emitChunk = (context: Rollup.PluginContext, id: string, hash: string): string => {
        const referenceId = context.emitFile({ type: "chunk", id, name: `kernel-${hash}`, preserveSignature: "exports-only" });
        chunks.add(referenceId);
        return referenceId;
    };
    const instance: Plugin = {
        name: `${packageName}/kernel`,
        enforce: "post",
        // Dep pre-bundling breaks the runtime's `new Worker(new URL("./worker.js", import.meta.url))`. Kernels are chunks
        // of their own, so a worker bundle holding one is a module, unless the configuration says otherwise.
        config: user => ({
            optimizeDeps: { exclude: [packageName] },
            worker: { plugins: () => plugin(), ...user.worker?.format === undefined ? { format: "es" as const } : {} },
        }),
        configResolved: config => {
            serve = config.command === "serve";
            repeated = config.plugins.find(other => other.name === instance.name) !== instance;
        },
        configureServer: devServer => {
            server = devServer;
        },
        // A kernel chunk's url is relative to the chunk that references it, as Rollup resolves it, rather than to `base`
        // as Vite resolves other files, so a build's kernels load wherever it's served from or run.
        resolveFileUrl: {
            order: "pre",
            handler: ({ referenceId, relativePath }) => chunks.has(referenceId) ? `new URL(${JSON.stringify(relativePath)}, import.meta.url).href` : null,
        },
        resolveId: id => repeated || parseKernelId(id) === undefined ? null : id,
        async load(id) {
            if (repeated) return null;
            const kernel = parseKernelId(id);
            if (kernel === undefined) return null;
            // Transforming the parent fills the cache: for a kernel requested first, or after a restart.
            // In dev, `this.load` doesn't read files from disk, so the server's own pipeline does it.
            if (!kernels.has(kernel.parent)) {
                if (server) await server.transformRequest(kernel.parent);
                else await this.load({ id: kernel.parent });
            }
            const cached = kernels.get(kernel.parent)?.[kernel.index];
            if (cached === undefined) return this.error(`no kernel ${kernel.index} in ${kernel.parent}`);
            // A different version would pair the description's columns with another kernel's code.
            if (kernel.hash !== undefined && kernel.hash !== cached.hash) {
                return this.error(`kernel ${kernel.index} in ${kernel.parent} changed since its description was compiled; reload`);
            }
            return cached.source;
        },
        // Vite only soft-invalidates importers of a changed file, which doesn't transform them again, so kernels that
        // inline from it are invalidated here.
        watchChange(id, change) {
            for (const linker of linkers.values()) linker.forget(id, change.event !== "update");
            for (const parent of dependents.get(id) ?? []) {
                for (const module of server?.moduleGraph.getModulesByFile(parent) ?? []) server?.moduleGraph.invalidateModule(module);
            }
        },
        async transform(code, id, options) {
            if (repeated || id.includes("\0") || !scripts.test(id.split("?")[0] ?? id)) return null;
            const parse = (input: string) => estreeOf(this.parse(input));
            const identify = async (input: string) => {
                const identified = await identifyModule(input, moduleIdOf(id, packageOf), parse, async (source, namespace) => {
                    const resolved = await this.resolve(source, id);
                    return resolved !== null && (resolved.external ? source === packageName : namespaceCopyOf(resolved.id, namespace) !== null);
                });
                return identified !== null && "failure" in identified ? this.error(identified.failure) : identified;
            };
            const ssr = options?.ssr === true;
            parseTypes ??= (await import("vite")).parseAst;
            const linker = linkerFor(ssr, this);
            const hashes: string[] = [];
            const transformed = await transformKernels(code, id, parse, async source => {
                const resolved = await this.resolve(source, id);
                return resolved === null ? null : namespaceCopyOf(resolved.id, "System");
            }, (index, identity) => {
                const hash = kernelHash(identity);
                hashes[index] = hash;
                if (!serve) return `import.meta.ROLLUP_FILE_URL_${emitChunk(this, buildId(id, index), hash)}`;
                // Served to node, a kernel's module is its url, so a pool's workers, which import it outside the server, read it too.
                return JSON.stringify(ssr ? inlinePlaceholder(index, hash) : serveUrl(id, index, hash));
            }, linker, automatic);
            const result = ssr && transformed !== null && !("failure" in transformed) ? { ...transformed, code: inlineKernels(transformed.code, transformed.kernels, hashes) } : transformed;
            const parent = id.split("?")[0] ?? id;
            if (result === null) {
                kernels.delete(id);
                depend(parent, []);
                return await identify(code);
            }
            for (const dependency of result.dependencies) this.addWatchFile(dependency);
            depend(parent, result.dependencies);
            if ("failure" in result) return this.error(describeFailure(result.failure), result.failure.position);
            kernels.set(id, result.kernels.map((source, index) => ({ source, hash: hashes[index] ?? "" })));
            return await identify(result.code) ?? { code: result.code, map: null };
        },
    };
    return instance;
};
