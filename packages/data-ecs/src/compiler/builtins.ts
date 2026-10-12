/// <reference types="node" />
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ModuleDeclaration, Program, Statement, Directive } from 'estree';
import { moduleScope, type BuiltinTarget, type ModuleBinding, type ModuleScope } from './module-scope.js';

/** Turns a TypeScript module into JavaScript; plain JavaScript passes through. */
export type Strip = (code: string, file: string) => Promise<string>;
export type Parse = (code: string) => Program;

type Export =
    | { readonly kind: "local"; readonly local: string }
    | { readonly kind: "reexport"; readonly file: string; readonly imported: string }
    | { readonly kind: "namespace"; readonly file: string };

type BuiltinModule = { readonly scope: ModuleScope; readonly exports: ReadonlyMap<string, Export>; readonly stars: readonly string[] };

/**
 * The package's math modules (`Vec3`, `Mat4x4`, ...), parsed at build time so kernels inline their functions the way
 * they inline helpers defined in their own module: each function body is compiled in its own module's scope.
 */
export type Builtins = {
    /** The module a `Vec3`-style import from the package root resolves through. */
    readonly entry: string;
    readonly has: (file: string) => boolean;
    /** What `name` exported from `file` is, following re-exports. */
    readonly resolve: (file: string, name: string) => { readonly binding: ModuleBinding; readonly scope: ModuleScope } | { readonly namespace: string } | undefined;
};

const sourceOf = (from: string, specifier: string): string => {
    const path = resolve(dirname(from), specifier);
    const typescript = path.replace(/\.js$/, ".ts");
    return existsSync(typescript) ? typescript : path;
};

const filesIn = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(entry => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return filesIn(path);
        return Promise.resolve(/\.(ts|js)$/.test(entry.name) && !/\.(test|type-test)\.(ts|js)$|\.d\.ts$/.test(entry.name) ? [path] : []);
    }));
    return nested.flat();
};

const isRelative = (specifier: unknown): specifier is string => typeof specifier === "string" && specifier.startsWith(".");

/** Imports of other math modules become builtin bindings; anything else stays an import kernels can't use. */
const linkedScope = (file: string, program: Program): ModuleScope => {
    const scope = new Map(moduleScope(program));
    for (const statement of program.body) {
        if (statement.type !== "ImportDeclaration" || !isRelative(statement.source.value)) continue;
        const from = sourceOf(file, statement.source.value);
        for (const specifier of statement.specifiers) {
            const target: BuiltinTarget = specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier"
                ? { kind: "export", file: from, name: specifier.imported.name }
                : { kind: "namespace", file: from };
            scope.set(specifier.local.name, { kind: "builtin", target });
        }
    }
    return scope;
};

const exportsOf = (file: string, body: readonly (Statement | ModuleDeclaration | Directive)[]): { exports: Map<string, Export>; stars: string[] } => {
    const exports = new Map<string, Export>();
    const stars: string[] = [];
    for (const statement of body) {
        if (statement.type === "ExportAllDeclaration" && isRelative(statement.source.value)) {
            const from = sourceOf(file, statement.source.value);
            if (statement.exported?.type === "Identifier") exports.set(statement.exported.name, { kind: "namespace", file: from });
            else stars.push(from);
        }
        if (statement.type !== "ExportNamedDeclaration") continue;
        const declaration = statement.declaration;
        if (declaration?.type === "VariableDeclaration") {
            for (const declarator of declaration.declarations) if (declarator.id.type === "Identifier") exports.set(declarator.id.name, { kind: "local", local: declarator.id.name });
        }
        else if (declaration?.type === "FunctionDeclaration" && declaration.id) exports.set(declaration.id.name, { kind: "local", local: declaration.id.name });
        const source = statement.source?.value;
        for (const specifier of statement.specifiers) {
            if (specifier.exported.type !== "Identifier" || specifier.local.type !== "Identifier") continue;
            exports.set(specifier.exported.name, isRelative(source)
                ? { kind: "reexport", file: sourceOf(file, source), imported: specifier.local.name }
                : { kind: "local", local: specifier.local.name });
        }
    }
    return { exports, stars };
};

/** Loads every module under `directory`; `entry` is its index. */
export const loadBuiltins = async (directory: string, entry: string, parse: Parse, strip: Strip): Promise<Builtins> => {
    const modules = new Map<string, BuiltinModule>();
    await Promise.all((await filesIn(directory)).map(async file => {
        const program = parse(await strip(await readFile(file, "utf8"), file));
        modules.set(file, { scope: linkedScope(file, program), ...exportsOf(file, program.body) });
    }));
    const resolveIn = (file: string, name: string, seen: Set<string>): ReturnType<Builtins["resolve"]> => {
        const module = modules.get(file);
        if (module === undefined || seen.has(`${file}#${name}`)) return undefined;
        seen.add(`${file}#${name}`);
        const found = module.exports.get(name);
        if (found?.kind === "namespace") return { namespace: found.file };
        if (found?.kind === "reexport") return resolveIn(found.file, found.imported, seen);
        if (found?.kind === "local") {
            const binding = module.scope.get(found.local);
            if (binding?.kind === "builtin") return binding.target.kind === "namespace" ? { namespace: binding.target.file } : resolveIn(binding.target.file, binding.target.name, seen);
            return binding === undefined ? undefined : { binding, scope: module.scope };
        }
        for (const star of module.stars) {
            const result = resolveIn(star, name, seen);
            if (result !== undefined) return result;
        }
        return undefined;
    };
    return { entry, has: file => modules.has(file), resolve: (file, name) => resolveIn(file, name, new Set()) };
};
