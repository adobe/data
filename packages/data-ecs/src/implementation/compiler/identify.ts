/// <reference types="node" />
import type { Expression, Node, Program } from 'estree';
import MagicString, { type SourceMap } from 'magic-string';
import { posix } from 'node:path';
import { idsName } from '../../interface/registry/ids.js';
import { children, isFunction } from './estree.js';
import { moduleScope } from './module-scope.js';

export type Parse = (code: string) => Program;

/** Code with its top-level symbols identified, and its map back to the code given. */
export type Identified = { readonly code: string; readonly map: SourceMap };

/** A dependency's path inside the last `node_modules`: its package name and subpath. */
const dependency = /\/node_modules\/(?!.*\/node_modules\/)(.+)$/;

/** The name a directory's package.json gives: undefined without one, null for one without a name. */
export type PackageNameOf = (directory: string) => string | null | undefined;

/**
 * A module's id: the name of the nearest package.json above it that has one and its path in that package, else for a
 * dependency its package name and subpath, else its path from `root`. Without a query and with forward slashes, so it's
 * the same on every machine and names no directory outside its package.
 */
export const moduleIdOf = (file: string, root: string, packageNameOf: PackageNameOf): string => {
    const path = (file.split("?")[0] ?? file).replace(/\\/g, "/");
    for (let directory = posix.dirname(path); ; directory = posix.dirname(directory)) {
        const name = packageNameOf(directory);
        if (typeof name === "string") return `${name}/${posix.relative(directory, path)}`;
        if (posix.dirname(directory) === directory) break;
    }
    const found = dependency.exec(path)?.[1];
    if (found !== undefined) return found;
    const relative = posix.relative(root.replace(/\\/g, "/"), path);
    return posix.isAbsolute(relative) ? posix.basename(path) : relative;
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

const uniqueName = (code: string, base: string): string => {
    let name = base;
    for (let n = 1; code.includes(name); n++) name = `${base}${n}`;
    return name;
};

/**
 * Gives each top-level `Symbol(...)` declaration an id, its module's id and its binding (`src/keys.ts#position`, or
 * `#default` for `export default Symbol(...)`): `const`, `let` and `var`, each of several declarators, and their
 * exports. The symbol is still the one `Symbol(...)` makes; a function appended to the module records its id in the
 * global map the registry reads, so the code imports nothing. Symbols made anywhere else, such as in functions, blocks,
 * TypeScript namespaces, class fields or CommonJS exports, have no id, nor does any symbol where `Symbol` or
 * `globalThis` isn't the global. Returns null when nothing is identified.
 */
export const identifySymbols = (code: string, id: string, parse: Parse): Identified | null => {
    if (!code.includes("Symbol(")) return null;
    const program = parse(code);
    const found: { readonly call: Expression; readonly binding: string }[] = [];
    for (const statement of program.body) {
        const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (declaration?.type === "VariableDeclaration") {
            for (const declarator of declaration.declarations) {
                if (declarator.id.type === "Identifier" && isSymbolCall(declarator.init)) found.push({ call: declarator.init, binding: declarator.id.name });
            }
        } else if (statement.type === "ExportDefaultDeclaration" && statement.declaration.type === "CallExpression" && isSymbolCall(statement.declaration)) {
            found.push({ call: statement.declaration, binding: "default" });
        }
    }
    if (found.length === 0 || declaresInModule(program, "Symbol") || declaresInModule(program, "globalThis")) return null;
    const identify = uniqueName(code, "identify$");
    const edited = new MagicString(code);
    for (const { call, binding } of found) {
        edited.appendLeft(call.start, `${identify}(`);
        edited.appendRight(call.end, `, ${JSON.stringify(`${id}#${binding}`)})`);
    }
    const ids = JSON.stringify(idsName);
    edited.append(`\nfunction ${identify}(symbol, id) { const ids = Symbol.for(${ids}); (globalThis[ids] || (globalThis[ids] = new Map())).set(symbol, id); return symbol; }\n`);
    return { code: edited.toString(), map: edited.generateMap({ source: id, hires: "boundary", includeContent: true }) };
};
