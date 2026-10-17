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

type Group = "resources" | "lookup" | "reduce";

const isGroup = (name: string): name is Group => name === "resources" || name === "lookup" || name === "reduce";

/**
 * What a main-thread body reads, writes and contributes to through its row and context, for the parts where every use
 * shows in its source. `row` and `context` are the indexes of those parameters, or -1 for none. The row and the
 * context's `resources`, `lookup` and `reduce` are indexed only by module-scope keys the body doesn't shadow, or
 * destructured by them, and never passed on, aliased or spread. A lookup's results are followed where each is indexed
 * by such keys or tested, directly or through a `const` declared once.
 */
export const usedBy = (declaration: ObjectExpression, body: Node, module: ModuleScope, positions: { readonly row: number; readonly context: number }): Used => {
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
    const unknownGroup = (group: Group): void => {
        if (group === "lookup") lookupsKnown = false;
        else resourcesKnown = false;
    };

    /** Names bound to a context group, to a lookup function, or to a lookup's result. */
    const groups = new Map<string, Group>();
    const callers = new Map<string, string>();
    const results = new Map<string, string>();
    /** The initializers `collect` followed: the context or a group, destructured or bound to a name. */
    const followed = new Set<Node>();

    /** Reads `pattern`'s computed module-scope keys; false when it does anything else. Named properties go to `named`. */
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
    const lookupNamed = (property: string, value: Pattern): boolean => {
        if (lookups === null || !lookups.includes(property)) return false;
        if (value.type === "Identifier" && counts.get(value.name) === (parameters.has(value.name) ? undefined : 1)) callers.set(value.name, property);
        else unknownLookup(property);
        return true;
    };
    /** Destructures a group: lookups by name, resources by key as reads, and reductions not at all. */
    const destructureGroup = (group: Group, pattern: Pattern): void => {
        if (group === "lookup") {
            if (!destructure(pattern, lookupNamed, () => { lookupsKnown = false; })) lookupsKnown = false;
        }
        else if (group === "resources") {
            if (!destructure(pattern, () => false, key => resources.read.add(key))) resourcesKnown = false;
        }
        else resourcesKnown = false;
    };
    /** Binds the context's groups from a destructuring of it; `declaredOnce` says whether a bound name is safe to follow. */
    const contextNamed = (declaredOnce: (name: string) => boolean) => (property: string, value: Pattern): boolean => {
        if (!isGroup(property)) return true;
        if (value.type === "Identifier" && declaredOnce(value.name)) groups.set(value.name, property);
        else if (value.type === "ObjectPattern") destructureGroup(property, value);
        else unknownGroup(property);
        return true;
    };
    const unknownContext = (): void => {
        resourcesKnown = false;
        lookupsKnown = false;
    };

    const row = positions.row < 0 ? undefined : body.params[positions.row];
    const context = positions.context < 0 ? undefined : body.params[positions.context];
    const rowName = row?.type === "Identifier" && !counts.has(row.name) ? row.name : null;
    const contextName = context?.type === "Identifier" && !counts.has(context.name) ? context.name : null;
    if (row !== undefined && rowName === null && !destructure(row, rowNamed, key => query.read.add(key))) queryKnown = false;
    if (context !== undefined && contextName === null && !destructure(context, contextNamed(name => !counts.has(name)), () => unknownContext())) unknownContext();

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

    /** The group `node` is: a name bound to one, or `context.group`. */
    const groupAt = (node: Node): Group | undefined => {
        if (node.type === "Identifier") return groups.get(node.name);
        if (node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier" && node.object.name === contextName
            && node.property.type === "Identifier" && isGroup(node.property.name)) return node.property.name;
        return undefined;
    };
    /** The lookup a call calls, when it's a lookup's function by name or through its group. */
    const calledLookup = (call: Node): string | undefined => {
        if (call.type !== "CallExpression") return undefined;
        const { callee } = call;
        if (callee.type === "Identifier") return callers.get(callee.name);
        if (callee.type === "MemberExpression" && !callee.computed && groupAt(callee.object) === "lookup"
            && callee.property.type === "Identifier" && lookups?.includes(callee.property.name)) return callee.property.name;
        return undefined;
    };
    /** Finds groups and lookups bound by `const` declarations declared once, and `const`s holding a lookup's result, before any reference is classified. */
    const collect = (node: Node, kind: string | undefined): void => {
        if (node.type === "VariableDeclarator" && kind === "const" && node.init) {
            const once = (name: string): boolean => counts.get(name) === 1;
            const group = groupAt(node.init);
            if (node.id.type === "Identifier" && once(node.id.name)) {
                const lookup = calledLookup(node.init);
                if (lookup !== undefined) results.set(node.id.name, lookup);
                if (group !== undefined) {
                    groups.set(node.id.name, group);
                    followed.add(node.init);
                }
            }
            else if (node.init.type === "Identifier" && node.init.name === contextName) {
                if (destructure(node.id, contextNamed(once), () => unknownContext())) followed.add(node.init);
            }
            else if (group !== undefined) {
                destructureGroup(group, node.id);
                followed.add(node.init);
            }
        }
        for (const child of children(node)) collect(child, node.type === "VariableDeclaration" ? node.kind : kind);
    };
    collect(body.body, undefined);

    /** A use of group `group` at `node`, whose parent is `parent`. */
    const useGroup = (group: Group, node: Node, parent: Node | undefined, grandparent: Node | undefined, above: Node | undefined): void => {
        if (followed.has(node)) return;
        if (parent?.type !== "MemberExpression" || parent.object !== node) return unknownGroup(group);
        const { property } = parent;
        if (group === "lookup") {
            if (!parent.computed && property.type === "Identifier" && lookups?.includes(property.name)) called(property.name, parent, grandparent, above);
            else lookupsKnown = false;
            return;
        }
        if (!parent.computed || property.type !== "Identifier" || !isKey(property.name)) return unknownGroup(group);
        if (group === "reduce") {
            if (grandparent?.type === "CallExpression" && grandparent.callee === parent) resources.reduce.add(property.name);
            else resourcesKnown = false;
            return;
        }
        const use = useOf(parent, grandparent);
        if (use === null) return unknownGroup(group);
        if (use.read) resources.read.add(property.name);
        if (use.write) resources.write.add(property.name);
    };

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
            if (parent?.type === "MemberExpression" && parent.object === node && !parent.computed && parent.property.type === "Identifier") {
                const property = parent.property.name;
                if (isGroup(property)) useGroup(property, parent, grandparent, ancestors.at(-3), ancestors.at(-4));
                return;
            }
            if (!followed.has(node)) unknownContext();
        }
        else {
            const group = groups.get(name);
            if (group !== undefined) return useGroup(group, node, parent, grandparent, ancestors.at(-3));
            const caller = callers.get(name);
            if (caller !== undefined) return called(caller, node, parent, grandparent);
            const lookup = results.get(name);
            if (lookup !== undefined) result(lookup, node, parent);
        }
    };

    const ancestors: Node[] = [];
    /** A declaration's target pattern only binds names, so only its initializer holds references. */
    const visit = (node: Node): void => {
        if (node.type === "Identifier" && !isName(node, ancestors.at(-1))) reference(node, ancestors);
        ancestors.push(node);
        for (const child of node.type === "VariableDeclarator" ? (node.init === null || node.init === undefined ? [] : [node.init]) : children(node)) visit(child);
        ancestors.pop();
    };
    visit(body.body);
    return {
        query: queryKnown ? query : null,
        resources: resourcesKnown ? resources : null,
        lookups: lookupsKnown ? lookupReads : null,
    };
};
