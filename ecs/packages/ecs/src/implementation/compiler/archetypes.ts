// © 2026 Adobe. MIT License. See /LICENSE for details.
import { archetypeCountName, archetypeIndexName } from '../../interface/registry/archetypes.js';
import type { PassResult } from './input-schemas.js';
import type { Insertion } from './source-map.js';
import type { Module, Node, Statement } from './type-schemas.js';

/**
 * The function the plugin appends, as `name`, to a module with lists of keys it can read: it gives a list a
 * program-wide index, by which worlds find what they resolved for it without comparing components, when every member is
 * a symbol, each once, and returns the list. It runs where the list is made, before any key's declaration may be
 * registered, so whether they're components is checked where the list is used. Generated code imports nothing, so it
 * shares the count through a global, as every copy of the package does (`registry/archetypes.ts`).
 */
export const archetypeFunction = (name: string): string => [
    `function ${name}(list) {`,
    ` const index = Symbol.for(${JSON.stringify(archetypeIndexName)}), count = Symbol.for(${JSON.stringify(archetypeCountName)});`,
    ` if (Object.prototype.hasOwnProperty.call(list, index) || !Object.isExtensible(list)) return list;`,
    ` for (let k = 0; k < list.length; k++) if (typeof list[k] !== "symbol" || list.indexOf(list[k]) < k) return list;`,
    ` const next = globalThis[count] || 0; globalThis[count] = next + 1; Object.defineProperty(list, index, { value: next });`,
    ` return list;`,
    `}`,
].join("");

const uniqueName = (code: string, base: string): string => {
    let name = base;
    for (let n = 1; code.includes(name); n++) name = `${base}${n}`;
    return name;
};

type Declarations = Extract<Statement, { readonly type: "VariableDeclaration" }>;
type Expression = NonNullable<Declarations["declarations"][number]["init"]>;
/** `[...] as const`. */
type ConstList = Extract<Expression, { readonly type: "TSAsExpression" }> & { readonly expression: Extract<Expression, { readonly type: "ArrayExpression" }> };

const isNode = (value: object): value is Node => typeof Reflect.get(value, "start") === "number" && typeof Reflect.get(value, "type") === "string";

const isConstList = (node: Node): node is ConstList => {
    if (node.type !== "TSAsExpression") return false;
    const expression: unknown = Reflect.get(node, "expression");
    const annotation: unknown = Reflect.get(node, "typeAnnotation");
    const typeName: unknown = typeof annotation === "object" && annotation !== null ? Reflect.get(annotation, "typeName") : undefined;
    return typeof expression === "object" && expression !== null && Reflect.get(expression, "type") === "ArrayExpression"
        && typeof typeName === "object" && typeName !== null && Reflect.get(typeName, "type") === "Identifier" && Reflect.get(typeName, "name") === "const";
};

/** Nodes whose code runs when called, not when the module loads. */
const functions: ReadonlySet<string> = new Set(["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration", "ClassDeclaration", "ClassExpression"]);

/** A top-level statement's variable declaration, exported or not. */
const variablesOf = (statement: Statement): Declarations | null => {
    const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    return declared?.type === "VariableDeclaration" ? declared : null;
};

/** Whether a module binds at top level a global the appended function uses. */
const bindsGlobals = (module: Module): boolean => module.program.body.some(statement => {
    const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    const names = declared?.type === "VariableDeclaration" ? declared.declarations.map(declarator => declarator.id.type === "Identifier" ? declarator.id.name : "")
        : (declared?.type === "FunctionDeclaration" || declared?.type === "ClassDeclaration") ? [declared.id?.name ?? ""]
        : statement.type === "ImportDeclaration" ? statement.specifiers.map(specifier => specifier.local.name)
        : [];
    return names.some(name => name === "Symbol" || name === "globalThis" || name === "Object");
});

/**
 * Gives each top-level list of keys declared `as const`, `const List = [a, b] as const`, a program-wide index: its
 * members are the module's `Symbol()` constants or value imports, and the appended function indexes it once they're
 * all declared components. `as const` makes it a readonly tuple, which nothing changes, as an indexed list must not.
 * A list naming one of the module's keys twice fails; one naming an import twice is left without an index.
 */
export const archetypeInsertions = (module: Module): PassResult | null => {
    const { code, program } = module;
    if (!code.includes("as const") || bindsGlobals(module)) return null;
    const keys = new Set<string>();
    const local = new Set<string>();
    for (const [name, imported] of module.imports) if (imported.value && imported.imported !== null) keys.add(name);
    for (const statement of program.body) {
        const variables = variablesOf(statement);
        if (variables?.kind !== "const") continue;
        for (const { id, init } of variables.declarations) {
            if (id.type === "Identifier" && init?.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "Symbol") {
                keys.add(id.name);
                local.add(id.name);
            }
        }
    }
    if (keys.size === 0 && module.imports.size === 0) return null;
    /** The module's top-level constants holding lists it indexes, which other lists may spread. */
    const lists = new Set<string>();
    const insertions: Insertion[] = [];
    const name = uniqueName(code, "archetype$");
    /** Lists naming one of the module's keys twice, which fail the build. */
    const repeated: { readonly name: string; readonly at: number }[] = [];
    /** Whether a list declared `as const` names only keys: the module's or imported, or spreads lists of them. */
    const indexes = (list: ConstList): boolean => {
        const named: string[] = [];
        for (const element of list.expression.elements) {
            if (element?.type === "Identifier" && keys.has(element.name)) named.push(element.name);
            // A namespace's member, `Shapes.circle`, is a key of the package or a module imported.
            else if (element?.type === "MemberExpression" && !element.computed && element.object.type === "Identifier" && element.property.type === "Identifier"
                && module.imports.get(element.object.name)?.value === true) named.push(`${element.object.name}.${element.property.name}`);
            else if (element?.type !== "SpreadElement" || element.argument.type !== "Identifier" || !(lists.has(element.argument.name) || module.imports.get(element.argument.name)?.value === true)) return false;
        }
        const twice = named.find((member, k) => named.indexOf(member) < k);
        if (twice === undefined) return true;
        if (local.has(twice)) repeated.push({ name: twice, at: list.start });
        return false;
    };
    // Lists made when the module loads: those in functions are made on every call, so they aren't indexed.
    const visit = (node: unknown, binding: string | null): void => {
        if (Array.isArray(node)) {
            for (const item of node) visit(item, null);
            return;
        }
        if (typeof node !== "object" || node === null || !isNode(node) || functions.has(node.type)) return;
        if (isConstList(node) && node.expression.elements.length > 0 && indexes(node)) {
            insertions.push({ at: node.start, text: `${name}(` }, { at: node.end, text: ")" });
            if (binding !== null) lists.add(binding);
            return;
        }
        for (const key of Object.keys(node)) if (key !== "parent") visit(Reflect.get(node, key), null);
    };
    for (const statement of program.body) {
        const variables = variablesOf(statement);
        // A list a top-level `const` holds may be spread by those after it.
        if (variables?.kind === "const") for (const { id, init } of variables.declarations) visit(init, id.type === "Identifier" ? id.name : null);
        else visit(statement, null);
    }
    const [twice] = repeated;
    if (twice !== undefined) return { failure: { message: `this list names ${twice.name} twice; a list of components names each once`, position: twice.at, frames: [] }, dependencies: [] };
    if (insertions.length === 0) return null;
    insertions.push({ at: code.length, text: `\n${archetypeFunction(name)}\n` });
    return { insertions, dependencies: [] };
};
