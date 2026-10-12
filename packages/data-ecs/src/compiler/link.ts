import type { Program } from 'estree';
import { createModule, locateIn, type Module, type ModuleBinding } from './module-scope.js';

/** How the linker reaches other modules. Errors are reasons, reported only if a kernel uses what failed. */
export type LinkHost = {
    /** The file an import specifier names from `importer`. */
    readonly resolve: (specifier: string, importer: string) => Promise<string | { readonly error: string }>;
    /** A file's code as JavaScript, and how offsets in it map to source lines when it was compiled from another language. */
    readonly load: (file: string) => Promise<{ readonly code: string; readonly locate?: Module["locate"] } | { readonly error: string }>;
};

/**
 * Modules as the compiler sees them. Both answer from what the linker has loaded, and when it hasn't loaded something
 * yet they throw a `Pending`, which `transformKernels` awaits before compiling the kernel again.
 */
export type Link = {
    readonly module: (file: string) => Module | { readonly error: string };
    readonly resolve: (specifier: string, importer: string) => string | { readonly error: string };
};

/** A cache of modules and resolutions shared across transforms. */
export type Linker = Link & {
    /** Adds the module being transformed, so imports back into it resolve to the same module. */
    readonly add: (module: Module) => void;
    /** Drops a changed file, and with `resolutions` every resolution, for files that were created or deleted. */
    readonly forget: (file: string, resolutions: boolean) => void;
};

type Pending = { readonly pending: Promise<void> };

const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);

const pending = (promise: Promise<void>): never => {
    const signal: Pending = { pending: promise };
    throw signal;
};

export const isPending = (error: unknown): error is Pending =>
    typeof error === "object" && error !== null && "pending" in error && error.pending instanceof Promise;

type Loaded = Module | { readonly error: string };
type Resolution = string | { readonly error: string };

export const createLinker = (host: LinkHost, parse: (code: string) => Program): Linker => {
    const modules = new Map<string, Loaded>();
    const loading = new Map<string, Promise<void>>();
    const resolutions = new Map<string, Resolution>();
    const resolving = new Map<string, Promise<void>>();
    const load = async (file: string): Promise<void> => {
        const loaded = await host.load(file).catch((error: unknown) => ({ error: `${file} can't be read: ${reason(error)}` }));
        if ("error" in loaded) {
            modules.set(file, loaded);
            return;
        }
        try {
            modules.set(file, createModule(file, parse(loaded.code), loaded.locate ?? locateIn(loaded.code)));
        } catch (error) {
            modules.set(file, { error: `${file} can't be parsed: ${reason(error)}` });
        }
    };
    return {
        module: file => {
            const loaded = modules.get(file);
            if (loaded !== undefined) return loaded;
            let promise = loading.get(file);
            if (promise === undefined) {
                promise = load(file).finally(() => loading.delete(file));
                loading.set(file, promise);
            }
            return pending(promise);
        },
        resolve: (specifier, importer) => {
            const key = `${importer}\0${specifier}`;
            const resolved = resolutions.get(key);
            if (resolved !== undefined) return resolved;
            let promise = resolving.get(key);
            if (promise === undefined) {
                promise = host.resolve(specifier, importer)
                    .catch((error: unknown) => ({ error: `${specifier} can't be resolved from ${importer}: ${reason(error)}` }))
                    .then(result => { resolutions.set(key, result); })
                    .finally(() => resolving.delete(key));
                resolving.set(key, promise);
            }
            return pending(promise);
        },
        add: module => { modules.set(module.file, module); },
        forget: (file, all) => {
            modules.delete(file);
            if (all) resolutions.clear();
        },
    };
};

/** A name as the linker resolves it: a definition in its module, a module namespace, or why it isn't one. */
export type Resolved =
    | { readonly kind: "binding"; readonly module: Module; readonly name: string; readonly binding: Exclude<ModuleBinding, { kind: "import" | "importNamespace" }> }
    | { readonly kind: "namespace"; readonly file: string }
    | { readonly kind: "error"; readonly error: string };

const sameResolution = (a: Resolved, b: Resolved): boolean =>
    a.kind === "binding" && b.kind === "binding" ? a.module === b.module && a.name === b.name
        : a.kind === "namespace" && b.kind === "namespace" && a.file === b.file;

/** Follows a binding of `module` through imports to its definition. */
export const resolveBinding = (link: Link, module: Module, name: string, binding: ModuleBinding, seen: Set<string> = new Set()): Resolved => {
    switch (binding.kind) {
        case "import": case "importNamespace": {
            const file = link.resolve(binding.specifier, module.file);
            if (typeof file !== "string") return { kind: "error", error: file.error };
            return binding.kind === "importNamespace" ? { kind: "namespace", file } : resolveExport(link, file, binding.imported, seen);
        }
        default:
            return { kind: "binding", module, name, binding };
    }
};

/** What `file` exports as `name`, following re-exports and `export *`. */
export const resolveExport = (link: Link, file: string, name: string, seen: Set<string> = new Set()): Resolved => {
    const module = link.module(file);
    if ("error" in module) return { kind: "error", error: module.error };
    const missing: Resolved = { kind: "error", error: `${name} isn't exported by ${file}` };
    const key = `${file}\0${name}`;
    if (seen.has(key)) return missing;
    seen.add(key);
    const exported = module.exports.get(name);
    if (exported !== undefined) {
        switch (exported.kind) {
            case "local": {
                const binding = module.bindings.get(exported.local);
                return binding === undefined ? missing : resolveBinding(link, module, exported.local, binding, seen);
            }
            case "reexport": case "namespace": {
                const target = link.resolve(exported.specifier, file);
                if (typeof target !== "string") return { kind: "error", error: target.error };
                return exported.kind === "namespace" ? { kind: "namespace", file: target } : resolveExport(link, target, exported.imported, seen);
            }
        }
    }
    if (name === "default") return missing;
    const found: Resolved[] = [];
    for (const star of module.stars) {
        const target = link.resolve(star, file);
        if (typeof target !== "string") continue;
        const result = resolveExport(link, target, name, new Set(seen));
        if (result.kind !== "error" && !found.some(item => sameResolution(item, result))) found.push(result);
    }
    if (found.length > 1) return { kind: "error", error: `${name} is exported by more than one export * of ${file}` };
    return found[0] ?? missing;
};
