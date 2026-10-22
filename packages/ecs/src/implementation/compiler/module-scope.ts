// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Directive, Expression, FunctionDeclaration, MaybeNamedFunctionDeclaration, ModuleDeclaration, Pattern, Program, Statement } from 'estree';
import { patternNames } from './estree.js';

/**
 * A module-scope binding. Only `const` initializers and function declarations can be inlined into kernels, and imports
 * of them, which the linker follows (`link.ts`).
 */
export type ModuleBinding =
    | { readonly kind: "const"; readonly init: Expression }
    | { readonly kind: "function"; readonly node: FunctionDeclaration | MaybeNamedFunctionDeclaration }
    /** `import { imported as local } from specifier`; a default import imports `default`. */
    | { readonly kind: "import"; readonly specifier: string; readonly imported: string }
    | { readonly kind: "importNamespace"; readonly specifier: string }
    | { readonly kind: "other" };

export type ModuleScope = ReadonlyMap<string, ModuleBinding>;

/** What a module exports under one name. */
export type Export =
    | { readonly kind: "local"; readonly local: string }
    | { readonly kind: "reexport"; readonly specifier: string; readonly imported: string }
    | { readonly kind: "namespace"; readonly specifier: string };

/** A parsed module: its bindings, its exports, and the modules `export *` re-exports, by specifier. */
export type Module = {
    readonly file: string;
    readonly bindings: ModuleScope;
    readonly exports: ReadonlyMap<string, Export>;
    readonly stars: readonly string[];
    /** The source line and column of an offset in the parsed code, both counted from 1. */
    readonly locate: (offset: number) => { readonly line: number; readonly column: number };
};

/** The binding an `export default <expression>` declares. Not a valid identifier, so it can't be shadowed. */
const defaultBinding = "*default*";

const nameOf = (node: { readonly type: string; readonly name?: string; readonly value?: unknown }): string | undefined =>
    node.type === "Identifier" ? node.name : typeof node.value === "string" ? node.value : undefined;

const declare = (scope: Map<string, ModuleBinding>, statement: Statement | ModuleDeclaration | Directive): void => {
    switch (statement.type) {
        case "ImportDeclaration": {
            const specifier = statement.source.value;
            if (typeof specifier !== "string") return;
            for (const item of statement.specifiers) {
                if (item.type === "ImportNamespaceSpecifier") scope.set(item.local.name, { kind: "importNamespace", specifier });
                else scope.set(item.local.name, { kind: "import", specifier, imported: item.type === "ImportDefaultSpecifier" ? "default" : nameOf(item.imported) ?? "" });
            }
            return;
        }
        case "ExportNamedDeclaration":
            if (statement.declaration) declare(scope, statement.declaration);
            return;
        case "ExportDefaultDeclaration": {
            const declaration = statement.declaration;
            if (declaration.type === "FunctionDeclaration") scope.set(declaration.id?.name ?? defaultBinding, { kind: "function", node: declaration });
            else if (declaration.type === "ClassDeclaration") scope.set(declaration.id?.name ?? defaultBinding, { kind: "other" });
            else scope.set(defaultBinding, { kind: "const", init: declaration });
            return;
        }
        case "VariableDeclaration":
            for (const declarator of statement.declarations) {
                if (statement.kind === "const" && declarator.id.type === "Identifier" && declarator.init) {
                    scope.set(declarator.id.name, { kind: "const", init: declarator.init });
                } else {
                    for (const name of patternNames(declarator.id)) scope.set(name, { kind: "other" });
                }
            }
            return;
        case "FunctionDeclaration":
            if (statement.id) scope.set(statement.id.name, { kind: "function", node: statement });
            return;
        case "ClassDeclaration":
            if (statement.id) scope.set(statement.id.name, { kind: "other" });
            return;
        default:
            return;
    }
};

/** Collects the bindings declared at the top level of `program`. */
export const moduleScope = (program: Program): ModuleScope => {
    const scope = new Map<string, ModuleBinding>();
    for (const statement of program.body) declare(scope, statement);
    return scope;
};

const exportsOf = (program: Program): { readonly exports: Map<string, Export>; readonly stars: string[] } => {
    const exports = new Map<string, Export>();
    const stars: string[] = [];
    for (const statement of program.body) {
        if (statement.type === "ExportAllDeclaration" && typeof statement.source.value === "string") {
            const exported = statement.exported === null || statement.exported === undefined ? undefined : nameOf(statement.exported);
            if (exported === undefined) stars.push(statement.source.value);
            else exports.set(exported, { kind: "namespace", specifier: statement.source.value });
        }
        else if (statement.type === "ExportDefaultDeclaration") {
            const declaration = statement.declaration;
            const named = declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration" ? declaration.id?.name
                : declaration.type === "Identifier" ? declaration.name : undefined;
            exports.set("default", { kind: "local", local: named ?? defaultBinding });
        }
        else if (statement.type === "ExportNamedDeclaration") {
            const declaration = statement.declaration;
            if (declaration?.type === "VariableDeclaration") {
                for (const declarator of declaration.declarations) {
                    for (const name of patternNames(declarator.id)) exports.set(name, { kind: "local", local: name });
                }
            }
            else if (declaration?.type === "FunctionDeclaration" && declaration.id) exports.set(declaration.id.name, { kind: "local", local: declaration.id.name });
            const source = statement.source?.value;
            for (const specifier of statement.specifiers) {
                const exported = nameOf(specifier.exported);
                const local = nameOf(specifier.local);
                if (exported === undefined || local === undefined) continue;
                exports.set(exported, typeof source === "string" ? { kind: "reexport", specifier: source, imported: local } : { kind: "local", local });
            }
        }
    }
    return { exports, stars };
};

/** Lines and columns by counting newlines in `code`. */
export const locateIn = (code: string): Module["locate"] => {
    const starts = [0];
    for (let index = code.indexOf("\n"); index >= 0; index = code.indexOf("\n", index + 1)) starts.push(index + 1);
    return offset => {
        let low = 0;
        let high = starts.length - 1;
        while (low < high) {
            const middle = (low + high + 1) >> 1;
            if (starts[middle] <= offset) low = middle;
            else high = middle - 1;
        }
        return { line: low + 1, column: offset - starts[low] + 1 };
    };
};

export const createModule = (file: string, program: Program, locate: Module["locate"]): Module =>
    ({ file, bindings: moduleScope(program), ...exportsOf(program), locate });
