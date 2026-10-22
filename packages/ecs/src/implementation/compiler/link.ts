// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Program } from 'estree';
import { createModule, locateIn, type Module, type ModuleBinding } from './module-scope.js';

/**
 * Why a specifier names no file the linker can read. `unreadable` marks one the build leaves unread, such as a package
 * external to it, rather than one that fails to resolve.
 */
export type Unresolved = { readonly error: string; readonly unreadable?: boolean };

/** How the linker reaches other modules. Errors are reasons, reported only if a kernel uses what failed. */
export type LinkHost = {
    /** The file an import specifier names from `importer`. */
    readonly resolve: (specifier: string, importer: string) => Promise<string | Unresolved>;
    /** A file's code as JavaScript, and how offsets in it map to source lines when it was compiled from another language. */
    readonly load: (file: string) => Promise<{ readonly code: string; readonly locate?: Module["locate"] } | { readonly error: string }>;
};

/**
 * Modules as the compiler sees them. Both answer from what the linker has loaded, and when it hasn't loaded something
 * yet they throw a `Pending`, which `transformKernels` awaits before compiling the kernel again.
 */
export type Link = {
    readonly module: (file: string) => Module | { readonly error: string };
    readonly resolve: (specifier: string, importer: string) => string | Unresolved;
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
type Resolution = string | Unresolved;

export const createLinker = (host: LinkHost, parse: (code: string) => Program): Linker => {
    const modules = new Map<string, Loaded>();
    const loading = new Map<string, Promise<void>>();
    const resolutions = new Map<string, Resolution>();
    const resolving = new Map<string, Promise<void>>();
    /** Bumped when a file changes, or every resolution is dropped, so loads and resolutions in flight are discarded. */
    const versions = new Map<string, number>();
    let resolutionVersion = 0;
    /** Starts resolving `specifier` and loading its file, unless either is known or in flight. */
    const prefetch = (specifier: string, importer: string): Promise<void> => {
        const key = `${importer}\0${specifier}`;
        const resolved = resolutions.get(key);
        if (resolved !== undefined) return typeof resolved === "string" ? startLoad(resolved) : Promise.resolve();
        let promise = resolving.get(key);
        if (promise === undefined) {
            const version = resolutionVersion;
            promise = host.resolve(specifier, importer)
                .catch((error: unknown) => ({ error: `${specifier} can't be resolved from ${importer}: ${reason(error)}` }))
                .then(result => {
                    if (version !== resolutionVersion) return;
                    resolutions.set(key, result);
                    if (typeof result === "string") void startLoad(result);
                })
                .finally(() => resolving.delete(key));
            resolving.set(key, promise);
        }
        return promise;
    };
    const startLoad = (file: string): Promise<void> => {
        if (modules.has(file)) return Promise.resolve();
        let promise = loading.get(file);
        if (promise === undefined) {
            promise = load(file).finally(() => loading.delete(file));
            loading.set(file, promise);
        }
        return promise;
    };
    /**
     * Loads a module, then starts on the modules it re-exports: compiling stops at each module it doesn't have yet,
     * and a namespace's members are usually found through re-exports.
     */
    const load = async (file: string): Promise<void> => {
        const version = versions.get(file) ?? 0;
        const loaded = await host.load(file).catch((error: unknown) => ({ error: `${file} can't be read: ${reason(error)}` }));
        if (version !== (versions.get(file) ?? 0)) return;
        if ("error" in loaded) {
            modules.set(file, loaded);
            return;
        }
        let module: Module;
        try {
            module = createModule(file, parse(loaded.code), loaded.locate ?? locateIn(loaded.code));
        } catch (error) {
            modules.set(file, { error: `${file} can't be parsed: ${reason(error)}` });
            return;
        }
        modules.set(file, module);
        for (const exported of module.exports.values()) if (exported.kind !== "local") void prefetch(exported.specifier, file);
        for (const star of module.stars) void prefetch(star, file);
    };
    return {
        module: file => modules.get(file) ?? pending(startLoad(file)),
        resolve: (specifier, importer) => resolutions.get(`${importer}\0${specifier}`) ?? pending(prefetch(specifier, importer)),
        add: module => { modules.set(module.file, module); },
        forget: (file, all) => {
            modules.delete(file);
            loading.delete(file);
            versions.set(file, (versions.get(file) ?? 0) + 1);
            if (all) {
                resolutions.clear();
                resolving.clear();
                resolutionVersion++;
            }
        },
    };
};

/** A name as the linker resolves it: a definition in its module, a module namespace, or why it isn't one. */
export type Resolved =
    | { readonly kind: "binding"; readonly module: Module; readonly name: string; readonly binding: Exclude<ModuleBinding, { kind: "import" | "importNamespace" }> }
    | { readonly kind: "namespace"; readonly file: string }
    /**
     * `cause` tells a name a module doesn't export, one several `export *` provide, and one in a module the build leaves
     * unread, from failing to tell.
     */
    | { readonly kind: "error"; readonly error: string; readonly cause?: "missing" | "ambiguous" | "unreadable" };

/** A resolution that names no file, as a `Resolved`. */
const unresolved = ({ error, unreadable }: Unresolved): Resolved => unreadable === true ? { kind: "error", error, cause: "unreadable" } : { kind: "error", error };

const sameResolution = (a: Resolved, b: Resolved): boolean =>
    a.kind === "binding" && b.kind === "binding" ? a.module === b.module && a.name === b.name
        : a.kind === "namespace" && b.kind === "namespace" && a.file === b.file;

/** Follows a binding of `module` through imports to its definition. */
export const resolveBinding = (link: Link, module: Module, name: string, binding: ModuleBinding, seen: Set<string> = new Set()): Resolved => {
    switch (binding.kind) {
        case "import": case "importNamespace": {
            const file = link.resolve(binding.specifier, module.file);
            if (typeof file !== "string") return unresolved(file);
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
    const missing: Resolved = { kind: "error", error: `${name} isn't exported by ${file}`, cause: "missing" };
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
                if (typeof target !== "string") return unresolved(target);
                return exported.kind === "namespace" ? { kind: "namespace", file: target } : resolveExport(link, target, exported.imported, seen);
            }
        }
    }
    if (name === "default") return missing;
    // Every star is searched, to find ambiguity; what isn't loaded yet is waited for together. A star that is
    // ambiguous itself makes the name ambiguous, and one that fails is the reason when no other star exports it.
    const found: Resolved[] = [];
    const failures: Resolved[] = [];
    const waiting: Promise<void>[] = [];
    for (const star of module.stars) {
        try {
            const target = link.resolve(star, file);
            const result: Resolved = typeof target === "string" ? resolveExport(link, target, name, new Set(seen)) : unresolved(target);
            if (result.kind !== "error") {
                if (!found.some(item => sameResolution(item, result))) found.push(result);
            }
            else if (result.cause === "ambiguous") return result;
            else if (result.cause !== "missing") failures.push(result);
        } catch (error) {
            if (!isPending(error)) throw error;
            waiting.push(error.pending);
        }
    }
    if (waiting.length > 0) pending(Promise.all(waiting).then(() => undefined));
    if (found.length > 1) return { kind: "error", error: `${name} is exported by more than one export * of ${file}`, cause: "ambiguous" };
    return found[0] ?? failures[0] ?? missing;
};
