import type { Plugin, ViteDevServer } from 'vite';
import { buildId, kernelHash, parseKernelId, serveUrl } from './kernel-id.js';
import { loadBuiltins, type Builtins } from './builtins.js';
import { isSystemModule, mathDirectory, mathEntry, mathFileOf } from './paths.js';
import { transformKernels } from './transform.js';

const scripts = /\.[cm]?[jt]sx?$/;
const packageName = "@adobe/data-ecs";

type CachedKernel = { readonly source: string; readonly hash: string };

/**
 * Compiles kernel systems (`kernel: "cpu"` or `"gpu"`). Runs after TypeScript is stripped and before minification, so it sees plain JS
 * with source names. Each kernel's `create` becomes its own module at `description.url`: served from a
 * root-absolute url in dev, and emitted as a chunk in a build.
 *
 * Dev dep pre-bundling bypasses plugins and breaks the runtime's worker url, so `@adobe/data-ecs` is excluded from it.
 * Consumers must also add to `optimizeDeps.exclude` any dependency that defines kernels or imports `@adobe/data-ecs`;
 * otherwise its kernels reach the runtime uncompiled, which fails at registration.
 */
/** Strips types from the package's TypeScript sources, when the plugin runs from them rather than from `dist`. */
const strip = async (code: string, file: string): Promise<string> => {
    if (!file.endsWith(".ts")) return code;
    const { transformWithEsbuild } = await import("vite");
    return (await transformWithEsbuild(code, file, { loader: "ts" })).code;
};

export const kernelPlugin = (): Plugin => {
    let serve = true;
    let builtins: Promise<Builtins> | null = null;
    let server: ViteDevServer | undefined;
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
        async transform(code, id) {
            if (!scripts.test(id.split("?")[0] ?? id)) return null;
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
            }, {
                fileOf: async source => {
                    const resolved = await this.resolve(source, id);
                    return resolved === null ? null : mathFileOf(resolved.id);
                },
                builtins: () => builtins ??= loadBuiltins(mathDirectory, mathEntry, input => this.parse(input), strip),
            });
            if (result === null) {
                kernels.delete(id);
                return null;
            }
            if ("failure" in result) return this.error(result.failure.message, result.failure.position);
            kernels.set(id, result.kernels.map((source, index) => ({ source, hash: hashes[index] ?? "" })));
            return { code: result.code, map: null };
        },
    };
};
