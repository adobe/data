import type { Node, ObjectExpression, Pattern } from 'estree';
import { children, declaredIn, patternNames } from './estree.js';
import type { Used } from './exact.js';
import type { ModuleScope } from './module-scope.js';

const unknown: Used = { query: null, resources: null, lookups: null };

/** Whether `node`, a child of `parent`, names a property or label, or declares a binding, rather than referring to one. */
const isName = (node: Node, parent: Node | undefined): boolean => {
    switch (parent?.type) {
        case "MemberExpression": return parent.property === node && !parent.computed;
        case "Property": return parent.key === node && !parent.computed && !parent.shorthand;
        case "MethodDefinition": case "PropertyDefinition": return parent.key === node && !parent.computed;
        case "LabeledStatement": case "BreakStatement": case "ContinueStatement": return true;
        case "VariableDeclarator": return parent.id === node;
        default: return false;
    }
};

/** How `member`, a `name[key]` expression, is used: read, written, or both; null when it's a destructuring target or deleted. */
const useOf = (member: Node, parent: Node | undefined): { readonly read: boolean; readonly write: boolean } | null => {
    switch (parent?.type) {
        case "AssignmentExpression":
            return parent.left !== member ? { read: true, write: false } : { read: parent.operator !== "=", write: true };
        case "UpdateExpression": return { read: true, write: true };
        case "UnaryExpression": return parent.operator === "delete" ? null : { read: true, write: false };
        case "ArrayPattern": case "RestElement": case "AssignmentPattern": case "ForInStatement": case "ForOfStatement":
            return null;
        case "Property": return parent.value === member && parent.shorthand ? null : { read: true, write: false };
        default: return { read: true, write: false };
    }
};

/** Whether a lookup result `value`, a child of `parent`, is only tested: compared with null, or used as a condition. */
const isTested = (value: Node, parent: Node | undefined): boolean => {
    switch (parent?.type) {
        case "BinaryExpression": {
            const other = parent.left === value ? parent.right : parent.left;
            return ["===", "!==", "==", "!="].includes(parent.operator) && other.type === "Literal" && other.value === null;
        }
        case "IfStatement": case "ConditionalExpression": case "WhileStatement": return parent.test === value;
        case "UnaryExpression": return parent.operator === "!";
        case "LogicalExpression": return parent.operator === "&&" && parent.left === value;
        default: return false;
    }
};

const isFunctionBody = (node: Node): node is Node & { readonly type: "ArrowFunctionExpression" | "FunctionExpression" } =>
    node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const mentions = (node: Node, name: string): boolean =>
    (node.type === "Identifier" && node.name === name) || children(node).some(child => mentions(child, name));

/** The plain names of a declaration's lookups, or null when `lookup` isn't an object literal of them. */
const lookupNames = (declaration: ObjectExpression): readonly string[] | null => {
    const lookup = declaration.properties.find(property =>
        property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "lookup");
    if (lookup === undefined) return [];
    if (lookup.type !== "Property" || lookup.value.type !== "ObjectExpression") return null;
    const names = lookup.value.properties.map(property =>
        property.type === "Property" && !property.computed && property.key.type === "Identifier" ? property.key.name : null);
    return names.every(name => name !== null) ? names.filter(name => name !== null) : null;
};

/**
 * What a main-thread body reads, writes and contributes to through its row and context, for the parts where every use
 * shows in its source. The row and context are indexed only by module-scope keys the body doesn't shadow, or
 * destructured by them, and never passed on, aliased or spread. A lookup's results are followed where each is indexed
 * by such keys or tested, directly or through a `const` declared once.
 */
export const usedBy = (declaration: ObjectExpression, body: Node, module: ModuleScope): Used => {
    if (!isFunctionBody(body)) return unknown;
    if (body.type === "FunctionExpression" && mentions(body.body, "arguments")) return unknown;
    const counts = new Map<string, number>();
    declaredIn(body.body, name => counts.set(name, (counts.get(name) ?? 0) + 1));
    const parameters = new Set(body.params.flatMap(parameter => patternNames(parameter)));
    const isKey = (name: string): boolean => module.has(name) && !counts.has(name) && !parameters.has(name);
    const lookups = lookupNames(declaration);

    const query = { read: new Set<string>(), write: new Set<string>() };
    const resources = { read: new Set<string>(), write: new Set<string>(), reduce: new Set<string>() };
    const lookupReads = new Map<string, Set<string> | null>((lookups ?? []).map(name => [name, new Set<string>()]));
    let queryKnown = true;
    let resourcesKnown = true;
    let lookupsKnown = lookups !== null;
    const unknownLookup = (lookup: string): void => { lookupReads.set(lookup, null); };
    const unknownContext = (): void => {
        resourcesKnown = false;
        lookupsKnown = false;
    };

    /** Names bound to a lookup function or to one's result, by the lookup they belong to. */
    const callers = new Map<string, string>();
    const results = new Map<string, string>();

    /** Reads `pattern`, destructuring the row or context, through its computed module-scope keys; false when it does anything else. */
    const destructure = (pattern: Pattern, named: (property: string, value: Pattern) => boolean, keyed: (key: string) => void): boolean => {
        if (pattern.type !== "ObjectPattern") return false;
        for (const property of pattern.properties) {
            if (property.type === "RestElement" || property.key.type !== "Identifier") return false;
            if (!property.computed) {
                if (!named(property.key.name, property.value)) return false;
            }
            else if (isKey(property.key.name)) keyed(property.key.name);
            else return false;
        }
        return true;
    };
    const rowNamed = (property: string): boolean => property === "entity";
    const contextNamed = (property: string, value: Pattern): boolean => {
        if (lookups === null || !lookups.includes(property)) return true;
        if (value.type === "Identifier" && counts.get(value.name) === undefined) callers.set(value.name, property);
        else unknownLookup(property);
        return true;
    };
    const contextKeyed = (key: string): void => {
        resources.read.add(key);
        resources.reduce.add(key);
    };

    const [row, context] = body.params;
    const rowName = row?.type === "Identifier" && !counts.has(row.name) ? row.name : null;
    const contextName = context?.type === "Identifier" && !counts.has(context.name) ? context.name : null;
    if (row !== undefined && rowName === null && !destructure(row, rowNamed, key => query.read.add(key))) queryKnown = false;
    if (context !== undefined && contextName === null && !destructure(context, contextNamed, contextKeyed)) unknownContext();

    /** A lookup's result `value`, a child of `parent`: indexed by a key, bound to a `const`, or tested. */
    const result = (lookup: string, value: Node, parent: Node | undefined): void => {
        if (parent?.type === "MemberExpression" && parent.object === value) {
            if (parent.computed && parent.property.type === "Identifier" && isKey(parent.property.name)) lookupReads.get(lookup)?.add(parent.property.name);
            else unknownLookup(lookup);
        }
        else if (parent?.type === "VariableDeclarator" && parent.init === value && parent.id.type === "Identifier" && results.get(parent.id.name) === lookup) return;
        else if (!isTested(value, parent)) unknownLookup(lookup);
    };
    /** A reference to a lookup's function, `callee`, a child of `parent`. */
    const called = (lookup: string, callee: Node, parent: Node | undefined, grandparent: Node | undefined): void => {
        if (parent?.type === "CallExpression" && parent.callee === callee) result(lookup, parent, grandparent);
        else unknownLookup(lookup);
    };

    /** The lookup a call calls, when it's `context.lookup(...)` or a destructured lookup's function. */
    const calledLookup = (call: Node): string | undefined => {
        if (call.type !== "CallExpression") return undefined;
        const { callee } = call;
        if (callee.type === "Identifier") return callers.get(callee.name);
        if (callee.type === "MemberExpression" && !callee.computed && callee.object.type === "Identifier" && callee.object.name === contextName
            && callee.property.type === "Identifier" && lookups?.includes(callee.property.name)) return callee.property.name;
        return undefined;
    };
    /** Finds the `const` declarations, each declared once, that hold a lookup's result, before any reference is classified. */
    const collect = (node: Node, kind: string | undefined): void => {
        if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && kind === "const" && counts.get(node.id.name) === 1 && node.init) {
            const lookup = calledLookup(node.init);
            if (lookup !== undefined) results.set(node.id.name, lookup);
        }
        for (const child of children(node)) collect(child, node.type === "VariableDeclaration" ? node.kind : kind);
    };
    collect(body.body, undefined);

    /** Classifies a reference; `ancestors` ends with its parent. */
    const reference = (node: Node & { readonly type: "Identifier" }, ancestors: readonly Node[]): void => {
        const { name } = node;
        const parent = ancestors.at(-1);
        const grandparent = ancestors.at(-2);
        if (name === rowName) {
            if (parent?.type === "MemberExpression" && parent.object === node) {
                const { property } = parent;
                if (!parent.computed) {
                    if (property.type !== "Identifier" || !rowNamed(property.name)) queryKnown = false;
                    return;
                }
                const use = property.type === "Identifier" && isKey(property.name) ? useOf(parent, grandparent) : null;
                if (use === null || property.type !== "Identifier") queryKnown = false;
                else {
                    if (use.read) query.read.add(property.name);
                    if (use.write) query.write.add(property.name);
                }
            }
            else if (!(parent?.type === "VariableDeclarator" && parent.init === node && destructure(parent.id, rowNamed, key => query.read.add(key)))) queryKnown = false;
        }
        else if (name === contextName) {
            if (parent?.type === "MemberExpression" && parent.object === node) {
                const { property } = parent;
                if (!parent.computed) {
                    if (property.type === "Identifier" && lookups?.includes(property.name)) called(property.name, parent, grandparent, ancestors.at(-3));
                    return;
                }
                if (property.type !== "Identifier" || !isKey(property.name)) return unknownContext();
                if (grandparent?.type === "CallExpression" && grandparent.callee === parent) {
                    resources.reduce.add(property.name);
                    return;
                }
                const use = useOf(parent, grandparent);
                if (use === null) return unknownContext();
                if (use.read) resources.read.add(property.name);
                if (use.write) resources.write.add(property.name);
            }
            else if (!(parent?.type === "VariableDeclarator" && parent.init === node && destructure(parent.id, contextNamed, contextKeyed))) unknownContext();
        }
        else {
            const caller = callers.get(name);
            if (caller !== undefined) return called(caller, node, parent, grandparent);
            const lookup = results.get(name);
            if (lookup !== undefined) result(lookup, node, parent);
        }
    };

    const ancestors: Node[] = [];
    const visit = (node: Node): void => {
        if (node.type === "Identifier" && !isName(node, ancestors.at(-1))) reference(node, ancestors);
        ancestors.push(node);
        for (const child of children(node)) visit(child);
        ancestors.pop();
    };
    visit(body.body);
    return {
        query: queryKnown ? query : null,
        resources: resourcesKnown ? resources : null,
        lookups: lookupsKnown ? lookupReads : null,
    };
};
