/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Plugin, Rollup, ViteDevServer } from 'vite';
import { describeFailure } from './failure.js';
import { buildId, kernelHash, parseKernelId, serveUrl } from './kernel-id.js';
import { createLinker, type LinkHost, type Linker } from './link.js';
import { isSystemModule, packageIndex } from './paths.js';
import { locateThroughMap } from './source-map.js';
import { transformKernels } from './transform.js';

const scripts = /\.[cm]?[jt]sx?$/;
const packageName = "@adobe/data-ecs";

type CachedKernel = { readonly source: string; readonly hash: string };

const loaders: { readonly [extension: string]: "ts" | "tsx" | "jsx" } = { ts: "ts", mts: "ts", cts: "ts", tsx: "tsx", jsx: "jsx" };

/** A file's code as JavaScript, with types stripped and lines mapped back to the source. */
const loadFile = async (file: string): Promise<{ readonly code: string; readonly locate?: ReturnType<typeof locateThroughMap> }> => {
    const code = await readFile(file, "utf8");
    const loader = loaders[file.slice(file.lastIndexOf(".") + 1)];
    if (loader === undefined) return { code };
    const { transformWithEsbuild } = await import("vite");
    const result = await transformWithEsbuild(code, file, { loader, sourcemap: true });
    return { code: result.code, locate: locateThroughMap(result.code, result.map.mappings) };
};

/** Resolves imports through the build, from whichever transform runs. */
const buildHost = (resolver: () => Rollup.PluginContext): LinkHost => ({
    resolve: async (specifier, importer) => {
        const resolved = await resolver().resolve(specifier, importer, { skipSelf: true });
        if (resolved === null) return { error: `${specifier} can't be resolved from ${importer}` };
        if (resolved.external) {
            return specifier === packageName ? packageIndex : { error: `${specifier} is external to the build, so kernels can't inline from it` };
        }
        const id = resolved.id.split("?")[0] ?? resolved.id;
        return id.includes("\0") || !isAbsolute(id) ? { error: `${specifier} isn't a file` } : id;
    },
    load: loadFile,
});

/**
 * Compiles kernel systems (`kernel: "cpu"` or `"gpu"`). Runs after TypeScript is stripped and before minification, so it sees plain JS
 * with source names. Each kernel's `create` becomes its own module at `description.url`: served from a
 * root-absolute url in dev, and emitted as a chunk in a build.
 *
 * Functions and constants kernels import are read from their files, with types stripped, and inlined (`link.ts`).
 *
 * Dev dep pre-bundling bypasses plugins and breaks the runtime's worker url, so `@adobe/data-ecs` is excluded from it.
 * Consumers must also add to `optimizeDeps.exclude` any dependency that defines kernels, imports `@adobe/data-ecs`, or
 * has functions kernels import; otherwise its kernels reach the runtime uncompiled, which fails at registration, or
 * its functions can't be read.
 */
export const kernelPlugin = (): Plugin => {
    let serve = true;
    let server: ViteDevServer | undefined;
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
        const linker = createLinker(buildHost(() => contexts.get(ssr) ?? context), input => (contexts.get(ssr) ?? context).parse(input));
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
    return {
        name: `${packageName}/kernel`,
        enforce: "post",
        // Dep pre-bundling breaks the runtime's `new Worker(new URL("./worker.js", import.meta.url))`.
        config: () => ({ optimizeDeps: { exclude: [packageName] } }),
        configResolved: config => {
            serve = config.command === "serve";
        },
        configureServer: devServer => {
            server = devServer;
        },
        resolveId: id => parseKernelId(id) === undefined ? null : id,
        async load(id) {
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
            if (!scripts.test(id.split("?")[0] ?? id)) return null;
            const linker = linkerFor(options?.ssr === true, this);
            const hashes: string[] = [];
            const result = await transformKernels(code, id, input => this.parse(input), async source => {
                const resolved = await this.resolve(source, id);
                return resolved !== null && isSystemModule(resolved.id);
            }, (index, identity) => {
                const hash = kernelHash(identity);
                hashes[index] = hash;
                return serve
                    ? JSON.stringify(serveUrl(id, index, hash))
                    : `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: "chunk", id: buildId(id, index), name: "kernel" })}`;
            }, linker);
            const parent = id.split("?")[0] ?? id;
            if (result === null) {
                kernels.delete(id);
                depend(parent, []);
                return null;
            }
            for (const dependency of result.dependencies) this.addWatchFile(dependency);
            depend(parent, result.dependencies);
            if ("failure" in result) return this.error(describeFailure(result.failure), result.failure.position);
            kernels.set(id, result.kernels.map((source, index) => ({ source, hash: hashes[index] ?? "" })));
            return { code: result.code, map: null };
        },
    };
};
