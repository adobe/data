// © 2026 Adobe. MIT License. See /LICENSE for details.
import { reductionsIn, registeredReductionsIn, registeredSharedIn, sharedIn, type AugmentationHost } from './augmentations.js';
import { estreeOf } from './estree.js';
import { describeSystems, type DescribedSystem } from './describe.js';
import { describeFailure } from './failure.js';
import { identify, moduleIdOf, moduleLabelOf, type PackageOf } from './identify.js';
import type { InputHost } from './input-schemas.js';
import { createLinker, type LinkHost } from './link.js';
import { locateIn } from './module-scope.js';
import { createPackageCopies, type PackageCopies } from './package-copies.js';
import { inputPass, mayHaveInput } from './passes.js';
import * as posix from './posix.js';
import { locateThroughMap } from './source-map.js';
import { transformKernels, type KernelUrl } from './transform.js';
import type { TypedProgram } from './type-schemas.js';

/**
 * The compiler's core without node or a bundler: a module compiled as the plugin compiles it (`plugin.ts`), its
 * imports resolved among files held in memory. A browser runs it with a parser and a type stripper of its own that give
 * what the bundler's do.
 */

/** Parses a module as the bundler's `parseAst` does: JavaScript, or TypeScript with its types. */
export type ParseModule = (code: string, options: { readonly lang: "js" | "ts" | "tsx" }, file?: string) => TypedProgram;

/** Strips a TypeScript module's types as the bundler does: its JavaScript and the mappings of its map back. */
export type StripTypes = (code: string, file: string, lang: "ts" | "tsx") => { readonly code: string; readonly mappings: string } | { readonly error: string; readonly position?: number };

export type MemoryHost = {
    /** Every file by its absolute path: packages, with their package.json files, and modules the compiled ones import. */
    readonly files: ReadonlyMap<string, string>;
    readonly parse: ParseModule;
    readonly strip: StripTypes;
    /** The root of the copy of the package the compiled code runs with, as installed: its `dist` is what it imports. */
    readonly packageRoot: string;
};

/** Where a failure is in the module compiled, counted from 1. */
export type Location = { readonly line: number; readonly column: number };

/**
 * A system of the module compiled (`describe.ts`), located in the source: its `System.create` or `System.render` call's
 * start and end offsets, and the line and column of its start, counted from 1.
 */
export type SystemDescription = DescribedSystem & Location;

/**
 * A module compiled: its code, each kernel's module, the build's warnings, and when asked what each system compiled
 * to; or why it failed, located in the source when the build can tell where.
 */
export type MemoryCompiled =
    | { readonly code: string; readonly kernels: readonly string[]; readonly warnings: readonly string[]; readonly systems?: readonly SystemDescription[] }
    | { readonly failure: string; readonly location: Location | null };

export type MemoryCompiler = {
    /**
     * Compiles `code` as the module at `file`, its kernels' modules at the urls `kernelUrl` gives; with `describe`, also
     * describes each system, which costs more compiling.
     */
    readonly compile: (file: string, code: string, kernelUrl: KernelUrl, options?: { readonly describe?: boolean }) => Promise<MemoryCompiled>;
};


/** The language a file's extension gives its module, null for a file that isn't one. */
const languageOf = (file: string): "js" | "ts" | "tsx" | null =>
    /\.[cm]?ts$/.test(file) ? "ts" : file.endsWith(".tsx") ? "tsx" : /\.([cm]?js|jsx)$/.test(file) ? "js" : null;

/** A failure's position in the code it was found in, at the line and column of the source the maps lead back to. */
type Locate = (offset: number) => Location;

/** Locates through `locate`, into the code before, and on through `earlier`, that code's own locator. */
const through = (locate: Locate, earlier: { readonly code: string; readonly locate: Locate }): Locate => {
    const starts = [0];
    for (let index = earlier.code.indexOf("\n"); index >= 0; index = earlier.code.indexOf("\n", index + 1)) starts.push(index + 1);
    return offset => {
        const { line, column } = locate(offset);
        return earlier.locate((starts[line - 1] ?? 0) + column - 1);
    };
};

export const createMemoryCompiler = (host: MemoryHost): MemoryCompiler => {
    const { parse } = host;
    /** The code each module was last compiled from, which its compile reads in place of its file's. */
    const compiled = new Map<string, string>();
    const files = {
        get: (file: string): string | undefined => compiled.get(file) ?? host.files.get(file),
        has: (file: string): boolean => compiled.has(file) || host.files.has(file),
    };
    const read = (file: string): string => {
        const text = files.get(file);
        if (text === undefined) throw new Error(`${file} doesn't exist`);
        return text;
    };
    const packages: PackageCopies = createPackageCopies({
        read,
        exists: file => files.has(file),
        realpath: path => path,
        dirname: posix.dirname,
        extname: posix.extname,
        isAbsolute: posix.isAbsolute,
        ownRoot: host.packageRoot,
        ownModule: `${host.packageRoot}/dist/implementation/compiler/memory-compiler.js`,
    });

    /** The name and version each directory's package.json gives, as the plugin reads them. */
    const found = new Map<string, ReturnType<PackageOf>>();
    const packageOf: PackageOf = directory => {
        if (found.has(directory)) return found.get(directory);
        let entry: ReturnType<PackageOf>;
        try {
            const json: unknown = JSON.parse(read(`${directory}/package.json`));
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

    /** A file, or the file a path without its extension names, as the bundler finds a TypeScript importer's imports. */
    const fileAt = (path: string): string | null => {
        if (files.has(path)) return path;
        const typescript = path.replace(/\.([cm]?)js$/, ".$1ts");
        if (typescript !== path && files.has(typescript)) return typescript;
        for (const extension of [".ts", ".js", "/index.ts", "/index.js"]) if (files.has(`${path}${extension}`)) return `${path}${extension}`;
        return null;
    };

    /** The target a package.json's `exports` gives a subpath, under the conditions the bundler resolves imports with. */
    const exported = (exports: unknown, subpath: string): string | null => {
        const entry: unknown = typeof exports === "string" ? (subpath === "." ? exports : null)
            : typeof exports === "object" && exports !== null ? Reflect.get(exports, subpath) : null;
        const pick = (value: unknown): string | null => {
            if (typeof value === "string") return value;
            if (typeof value !== "object" || value === null) return null;
            for (const condition of ["browser", "import", "default"]) {
                const chosen = pick(Reflect.get(value, condition));
                if (chosen !== null) return chosen;
            }
            return null;
        };
        return pick(entry);
    };

    /** The file an import resolves to: a relative or absolute path, or a package installed above the importer. */
    const resolveFile = (specifier: string, importer: string): string | null => {
        if (specifier.startsWith(".") || specifier.startsWith("/")) return fileAt(posix.resolve(posix.dirname(importer), specifier));
        const parts = specifier.split("/");
        const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0] ?? specifier;
        const subpath = specifier === name ? "." : `.${specifier.slice(name.length)}`;
        for (let directory = posix.dirname(importer); ; directory = posix.dirname(directory)) {
            const root = `${directory === "/" ? "" : directory}/node_modules/${name}`;
            const manifest = files.get(`${root}/package.json`);
            if (manifest !== undefined) {
                const json: unknown = JSON.parse(manifest);
                const exports: unknown = typeof json === "object" && json !== null ? Reflect.get(json, "exports") : undefined;
                const target = exports === undefined ? (subpath === "." ? "index.js" : subpath) : exported(exports, subpath);
                return target === null ? null : fileAt(posix.resolve(root, target));
            }
            if (directory === "/" || directory === ".") return null;
        }
    };

    /** A file's code as JavaScript, with types stripped and lines mapped back to the source. */
    const load: LinkHost["load"] = async file => {
        const code = files.get(file);
        if (code === undefined) return { error: `${file} doesn't exist` };
        const lang = languageOf(file);
        if (lang === null || lang === "js") return { code };
        const stripped = host.strip(code, file, lang);
        if ("error" in stripped) return { error: stripped.error };
        return { code: stripped.code, locate: locateThroughMap(stripped.code, stripped.mappings) };
    };

    const noReductions: ReadonlyMap<string, string> = new Map();
    /** The `reduce` traits a file's declarations give, as the plugin reads them (`reductionsOf` in `plugin.ts`). */
    const reductions = (file: string): ReadonlyMap<string, string> => {
        const lang = languageOf(file);
        const code = files.get(file);
        if (lang === null || code === undefined || !code.includes("reduce")) return noReductions;
        if (lang !== "js") return code.includes("declare module") ? reductionsIn(parse(code, { lang }, file)) : noReductions;
        return registeredReductionsIn(parse(code, { lang }, file));
    };

    const noShared: ReadonlySet<string> = new Set();
    /** The components a file declares `shared`, as the plugin reads them (`sharedOfFile` in `plugin.ts`). */
    const shared = (file: string): ReadonlySet<string> => {
        const lang = languageOf(file);
        const code = files.get(file);
        if (lang === null || code === undefined || !code.includes("shared")) return noShared;
        if (lang !== "js") return code.includes("declare module") ? sharedIn(parse(code, { lang }, file)) : noShared;
        return registeredSharedIn(parse(code, { lang }, file));
    };

    const linker = createLinker({
        packages,
        reductions,
        shared,
        load,
        resolve: async (specifier, importer) => resolveFile(specifier, importer) ?? { error: `${specifier} can't be resolved from ${importer}` },
    }, input => estreeOf(parse(input, { lang: "js" })));

    /** The package's own files' syntax as last parsed, which every module reading the package's types shares. */
    const parsed = new Map<string, { readonly code: string; readonly program: TypedProgram }>();
    const typeHost: InputHost & AugmentationHost = {
        parse: (source, path) => {
            const known = parsed.get(path);
            if (known !== undefined && known.code === source) return known.program;
            const program = parse(source, { lang: path.endsWith("x") ? "tsx" : "ts" }, path);
            if (packages.packagePathOf(path) !== null) parsed.set(path, { code: source, program });
            return program;
        },
        resolve: async (specifier, importer) => {
            const path = resolveFile(specifier, importer);
            return path === null ? null : packages.typesFileOf(path);
        },
        load: async file => read(file),
        packagePath: packages.packagePathOf,
        isSystem: async (specifier, importer) => {
            const path = resolveFile(specifier, importer);
            return path !== null && packages.namespaceCopyOf(path, "System") !== null;
        },
    };

    /** A parse error's message and position, as the parsers report them. */
    const parseFailure = (error: unknown, locate: Locate): MemoryCompiled => {
        const message = error instanceof Error ? error.message : String(error);
        const position: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "pos") : undefined;
        return { failure: message, location: typeof position === "number" ? locate(position) : null };
    };

    /** Compiles a module, or says why it can't be: a failure the hosts throw is one too. */
    /** JavaScript printed readably, as the type stripper prints what it strips; as given when it can't. */
    const format = (code: string): string => {
        const printed = host.strip(code, "/format.ts", "ts");
        return "error" in printed ? code : printed.code;
    };

    const compile = async (file: string, source: string, kernelUrl: KernelUrl, describe: boolean): Promise<MemoryCompiled> => {
        compiled.set(file, source);
        linker.forget(file, false);
        let code = source;
        let locate: Locate = locateIn(source);
        const lang = languageOf(file);
        if (lang === null) return { code: source, kernels: [], warnings: [], ...describe ? { systems: [] } : {} };
        if (lang !== "js") {
            if (mayHaveInput(code)) {
                let pass: Awaited<ReturnType<typeof inputPass>>;
                try {
                    pass = await inputPass(code, file, typeHost);
                } catch (error) {
                    return parseFailure(error, locate);
                }
                if (pass.result !== null && "failure" in pass.result) return { failure: describeFailure(pass.result.failure), location: locate(pass.result.failure.position) };
                if (pass.result !== null) {
                    locate = through(locateThroughMap(pass.result.code, pass.result.map.mappings), { code, locate });
                    code = pass.result.code;
                }
            }
            const stripped = host.strip(code, file, lang);
            if ("error" in stripped) return { failure: stripped.error, location: stripped.position === undefined ? null : locate(stripped.position) };
            locate = through(locateThroughMap(stripped.code, stripped.mappings), { code, locate });
            code = stripped.code;
        }
        const parseJs = (input: string) => estreeOf(parse(input, { lang: "js" }));
        let transformed: Awaited<ReturnType<typeof transformKernels>>;
        let described: readonly DescribedSystem[] = [];
        try {
            transformed = await transformKernels(code, file, parseJs, async (specifier, namespace) => {
                const path = resolveFile(specifier, file);
                return path === null ? null : packages.namespaceCopyOf(path, namespace);
            }, kernelUrl, linker, true, moduleLabelOf(file, packageOf), undefined, describe ? async sites => { described = await describeSystems(sites, format); } : undefined);
        } catch (error) {
            return parseFailure(error, locate);
        }
        if (transformed !== null && "failure" in transformed) return { failure: describeFailure(transformed.failure), location: locate(transformed.failure.position) };
        const kernelCode = transformed?.code ?? code;
        const identified = await identify(kernelCode, moduleIdOf(file, packageOf), parseJs, async (specifier, namespace) => {
            const path = resolveFile(specifier, file);
            return path !== null && packages.namespaceCopyOf(path, namespace) !== null;
        }, packages);
        if (identified !== null && "failure" in identified) return { failure: identified.failure, location: null };
        const result = { code: identified?.code ?? kernelCode, kernels: transformed?.kernels ?? [], warnings: transformed?.warnings ?? [] };
        if (!describe) return result;
        const starts = [0];
        for (let index = source.indexOf("\n"); index >= 0; index = source.indexOf("\n", index + 1)) starts.push(index + 1);
        const offsetOf = ({ line, column }: Location): number => (starts[line - 1] ?? 0) + column - 1;
        const systems = described.map((system): SystemDescription => {
            const at = locate(system.start);
            return { ...system, ...at, start: offsetOf(at), end: offsetOf(locate(system.end - 1)) + 1 };
        });
        return { ...result, systems };
    };
    return {
        compile: async (file, source, kernelUrl, options) => {
            try {
                return await compile(file, source, kernelUrl, options?.describe === true);
            } catch (error) {
                return { failure: `The compiler failed: ${error instanceof Error ? error.message : String(error)}`, location: null };
            }
        },
    };
};
