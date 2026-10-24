// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import type { Expression, Node, Program } from 'estree';
import { posix } from 'node:path';
import { idsName, labelsName } from '../../interface/registry/ids.js';
import { children, isFunction } from './estree.js';
import { moduleScope } from './module-scope.js';
import { isAttachKernelModule } from './paths.js';
import { insertInto, type Insertion, type SourceMap } from './source-map.js';

export type Parse = (code: string) => Program;

/** Code with its top-level symbols identified, and its map back to the code given. */
export type Identified = { readonly code: string; readonly map: SourceMap };

/** A dependency's path inside the last `node_modules`: its package name and subpath. */
const dependency = /\/node_modules\/(?!.*\/node_modules\/)(.+)$/;

/** What a directory's package.json gives: undefined without one, null for one without a name. */
export type PackageOf = (directory: string) => { readonly name: string; readonly version?: string } | null | undefined;

/** A module's file without a query, with forward slashes. */
const pathOf = (file: string): string => (file.split("?")[0] ?? file).replace(/\\/g, "/");

/** The nearest package.json above a module that has a name, with the module's path in it. */
const packageAbove = (file: string, packageOf: PackageOf): { readonly name: string; readonly version?: string; readonly path: string } | null => {
    const path = pathOf(file);
    for (let directory = posix.dirname(path); ; directory = posix.dirname(directory)) {
        const found = packageOf(directory);
        if (found !== null && found !== undefined) return { ...found, path: posix.relative(directory, path) };
        // A filesystem's root, `/` or a drive's `C:`, whose parent posix paths give as itself or as `.`.
        const parent = posix.dirname(directory);
        if (parent === directory || parent === ".") return null;
    }
};

/**
 * A module's id: the name and version of the nearest package.json above it that has a name, and its path in that
 * package, else for a dependency its package name and subpath; null outside both. Without a query and with forward
 * slashes, so it's the same on every machine and names no directory outside its package. Copies of one package at
 * different versions have different ids.
 */
export const moduleIdOf = (file: string, packageOf: PackageOf): string | null => {
    const found = packageAbove(file, packageOf);
    if (found !== null) return `${found.name}${found.version === undefined ? "" : `@${found.version}`}/${found.path}`;
    return dependency.exec(pathOf(file))?.[1] ?? null;
};

/** How messages name a module: its package's name and its path there, as its id has them, else the file's name. */
export const moduleLabelOf = (file: string, packageOf: PackageOf): string => {
    const found = packageAbove(file, packageOf);
    return found !== null ? `${found.name}/${found.path}` : dependency.exec(pathOf(file))?.[1] ?? posix.basename(pathOf(file));
};

/** Whether a binding named `name` is declared in the module's scope: at top level, or as a `var` in any of its blocks. */
const declaresInModule = (program: Program, name: string): boolean => {
    if (moduleScope(program).has(name)) return true;
    const hoists = (node: Node): boolean => {
        if (isFunction(node)) return false;
        if (node.type === "VariableDeclaration" && node.kind === "var" && node.declarations.some(declarator => declarator.id.type === "Identifier" && declarator.id.name === name)) return true;
        return children(node).some(hoists);
    };
    return hoists(program);
};

/** A call of the global `Symbol`. */
const isSymbolCall = (node: Expression | null | undefined): node is Expression =>
    node?.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "Symbol";

/** The package's namespaces whose constructors declare systems, rules, finalizers and indexes. */
export type Namespace = "System" | "Rule" | "Finalizer" | "Index";

const constructors: { readonly [N in Namespace]: ReadonlySet<string> } = {
    System: new Set(["create", "render"]),
    Rule: new Set(["create"]),
    Finalizer: new Set(["create", "changes"]),
    Index: new Set(["create"]),
};

const isNamespace = (name: string): name is Namespace => name === "System" || name === "Rule" || name === "Finalizer" || name === "Index";

/** Whether an import specifier, resolved from the module being transformed, is a module of the package exporting `namespace`. */
export type ResolveNamespace = (source: string, namespace: Namespace) => Promise<boolean>;

/** The module's local names of the package's namespaces, and of the kernel transform's `attachKernel`. */
const localsOf = async (program: Program, resolve: ResolveNamespace): Promise<{ readonly namespaces: ReadonlyMap<string, Namespace>; readonly attach: ReadonlySet<string> }> => {
    const namespaces = new Map<string, Namespace>();
    const attach = new Set<string>();
    for (const statement of program.body) {
        if (statement.type !== "ImportDeclaration" || typeof statement.source.value !== "string") continue;
        for (const specifier of statement.specifiers) {
            if (specifier.type !== "ImportSpecifier" || specifier.imported.type !== "Identifier") continue;
            const imported = specifier.imported.name;
            if (imported === "attachKernel" && isAttachKernelModule(statement.source.value)) attach.add(specifier.local.name);
            else if (isNamespace(imported) && await resolve(statement.source.value, imported)) namespaces.set(specifier.local.name, imported);
        }
    }
    return { namespaces, attach };
};

/**
 * The declaration a constructor call of a namespace passes, the call possibly wrapped by the kernel transform as
 * `attachKernel$(call, description)`; undefined for any other expression.
 */
const declarationOf = (node: Node | null | undefined, namespaces: ReadonlyMap<string, Namespace>, attach: ReadonlySet<string>): Expression | undefined => {
    if (node?.type !== "CallExpression") return undefined;
    const { callee } = node;
    if (callee.type === "Identifier" && attach.has(callee.name)) {
        const [call] = node.arguments;
        return call === undefined || call.type === "SpreadElement" ? undefined : declarationOf(call, namespaces, new Set());
    }
    if (callee.type !== "MemberExpression" || callee.computed || callee.object.type !== "Identifier" || callee.property.type !== "Identifier") return undefined;
    const namespace = namespaces.get(callee.object.name);
    if (namespace === undefined || !constructors[namespace].has(callee.property.name)) return undefined;
    const [declaration] = node.arguments;
    return declaration === undefined || declaration.type === "SpreadElement" ? undefined : declaration;
};

const uniqueName = (code: string, base: string): string => {
    let name = base;
    for (let n = 1; code.includes(name); n++) name = `${base}${n}`;
    return name;
};

/** Whether code may hold a constructor call worth resolving its imports for. */
const mayDeclare = /\.(create|render|changes)\(/;

/**
 * Gives each top-level `Symbol(...)` declaration an id, its module's id and its binding (`src/keys.ts#position`, or
 * `#default` for `export default Symbol(...)`): `const`, `let` and `var`, each of several declarators, and their
 * exports. The symbol is still the one `Symbol(...)` makes; a function appended to the module records its id in the
 * global map the registry reads, so the code imports nothing. Symbols made anywhere else, such as in functions, blocks,
 * TypeScript namespaces, class fields or CommonJS exports, have no id, nor does any symbol where `Symbol` or
 * `globalThis` isn't the global.
 *
 * The same bindings initialized by a constructor call of the package's `System`, `Rule`, `Finalizer` or `Index`, imported under
 * any local name, give the call's declaration their id, which the constructor takes from the map: a kernel's call as
 * the kernel transform wrapped it too. Returns null when nothing is identified, and a failure when something is but the
 * module has no id (`moduleIdOf`).
 */
export const identify = async (code: string, id: string | null, parse: Parse, resolve: ResolveNamespace): Promise<Identified | { readonly failure: string } | null> => {
    const symbols = code.includes("Symbol(");
    const items = mayDeclare.test(code);
    if (!symbols && !items) return null;
    const program = parse(code);
    const { namespaces, attach } = items ? await localsOf(program, resolve) : { namespaces: new Map<string, Namespace>(), attach: new Set<string>() };
    const found: { readonly value: Expression; readonly binding: string }[] = [];
    const consider = (init: Expression | null | undefined, binding: string): void => {
        if (isSymbolCall(init)) found.push({ value: init, binding });
        else if (namespaces.size > 0) {
            const declaration = declarationOf(init, namespaces, attach);
            if (declaration !== undefined) found.push({ value: declaration, binding });
        }
    };
    for (const statement of program.body) {
        const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (declaration?.type === "VariableDeclaration") {
            for (const declarator of declaration.declarations) if (declarator.id.type === "Identifier") consider(declarator.init, declarator.id.name);
        } else if (statement.type === "ExportDefaultDeclaration" && statement.declaration.type === "CallExpression") {
            consider(statement.declaration, "default");
        }
    }
    const labeled = namespaces.size > 0 ? labelsOf(program, namespaces, attach, new Set(found.map(({ value }) => value))) : [];
    if ((found.length === 0 && labeled.length === 0) || declaresInModule(program, "Symbol") || declaresInModule(program, "globalThis")) return null;
    const insertions: Insertion[] = [];
    if (found.length > 0) {
        if (id === null) return { failure: "this module's keys and systems need ids, which name its package, but no package.json above it gives a name: give its package one" };
        const identifier = uniqueName(code, "identify$");
        for (const { value, binding } of found) {
            insertions.push({ at: value.start, text: `${identifier}(` }, { at: value.end, text: `, ${JSON.stringify(`${id}#${binding}`)})` });
        }
        const ids = JSON.stringify(idsName);
        insertions.push({ at: code.length, text: `\nfunction ${identifier}(value, id) { const ids = Symbol.for(${ids}); (globalThis[ids] || (globalThis[ids] = new Map())).set(value, id); return value; }\n` });
    }
    if (labeled.length > 0) {
        const identifier = uniqueName(code, "label$");
        for (const { value, label } of labeled) insertions.push({ at: value.start, text: `${identifier}(` }, { at: value.end, text: `, ${JSON.stringify(label)})` });
        const labels = JSON.stringify(labelsName);
        // A label already given, as an internal factory gives its own, stands.
        insertions.push({ at: code.length, text: `\nfunction ${identifier}(value, label) { const labels = Symbol.for(${labels}); const map = globalThis[labels] || (globalThis[labels] = new WeakMap()); if (!map.has(value)) map.set(value, label); return value; }\n` });
    }
    return insertInto(code, insertions, id ?? "");
};

/** The name a node gives what's declared in it: a variable's, a function's, a property's or a method's. */
const nameIn = (node: Node): string | null => {
    switch (node.type) {
        case "VariableDeclarator": return node.id.type === "Identifier" ? node.id.name : null;
        case "FunctionDeclaration": case "FunctionExpression": return node.id?.name ?? null;
        case "Property": case "MethodDefinition": case "PropertyDefinition": return !node.computed && node.key.type === "Identifier" ? node.key.name : null;
        case "AssignmentExpression": return node.left.type === "Identifier" ? node.left.name : null;
        default: return null;
    }
};

/**
 * The declarations of constructor calls that `identified` leaves out, each with a label: the name of the nearest
 * variable, function, property or method it's made in, as `mover` for one made in `const mover = (speed) => ...`.
 */
const labelsOf = (program: Program, namespaces: ReadonlyMap<string, Namespace>, attach: ReadonlySet<string>, identified: ReadonlySet<Expression>): readonly { readonly value: Expression; readonly label: string }[] => {
    const labeled: { readonly value: Expression; readonly label: string }[] = [];
    const visit = (node: Node, names: readonly string[]): void => {
        const declaration = declarationOf(node, namespaces, attach);
        const label = names.at(-1);
        // Calls in its arguments are labeled too, by the names nearest them.
        if (declaration !== undefined && !identified.has(declaration) && label !== undefined) labeled.push({ value: declaration, label });
        const name = nameIn(node);
        const inner = name === null ? names : [...names, name];
        for (const child of children(node)) visit(child, inner);
    };
    visit(program, []);
    return labeled;
};
