import type { Node, Pattern } from 'estree';
import { children, declaredIn, patternNames } from './estree.js';
import type { Used } from './exact.js';
import type { ModuleScope } from './module-scope.js';

type Access = { readonly read: Set<string>; readonly write: Set<string> };

const unknown: Used = { query: null, resources: null, lookups: null };

/** Whether `node`, a child of `parent`, names a property or label rather than referring to a binding. */
const isName = (node: Node, parent: Node | undefined): boolean => {
    switch (parent?.type) {
        case "MemberExpression": return parent.property === node && !parent.computed;
        case "Property": return parent.key === node && !parent.computed && !parent.shorthand;
        case "MethodDefinition": case "PropertyDefinition": return parent.key === node && !parent.computed;
        case "LabeledStatement": case "BreakStatement": case "ContinueStatement": return true;
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

/** A body's names: those it declares inside, and those it declares as parameters too, which can shadow keys. */
type Names = { readonly inner: ReadonlySet<string>; readonly all: ReadonlySet<string> };

const isKey = (name: string, module: ModuleScope, names: Names): boolean => module.has(name) && !names.all.has(name);

/**
 * The keys a parameter named `name` is indexed by in `body`: each a module-scope identifier the body doesn't shadow.
 * `named` says which plain property names it may also be read through. Null when it's used any other way.
 */
const keysOf = (body: Node, name: string, named: (property: string) => boolean, module: ModuleScope, names: Names): Access | null => {
    if (names.inner.has(name)) return null;
    const access: Access = { read: new Set(), write: new Set() };
    let known = true;
    const visit = (node: Node, parent: Node | undefined, grandparent: Node | undefined): void => {
        if (!known) return;
        if (node.type === "Identifier" && node.name === name && !isName(node, parent)) {
            if (parent?.type !== "MemberExpression" || parent.object !== node) {
                known = false;
                return;
            }
            const { property } = parent;
            if (!parent.computed) {
                if (property.type !== "Identifier" || !named(property.name)) known = false;
                return;
            }
            const use = property.type === "Identifier" && isKey(property.name, module, names) ? useOf(parent, grandparent) : null;
            if (use === null || property.type !== "Identifier") {
                known = false;
                return;
            }
            if (use.read) access.read.add(property.name);
            if (use.write) access.write.add(property.name);
            return;
        }
        for (const child of children(node)) visit(child, node, parent);
    };
    visit(body, undefined, undefined);
    return known ? access : null;
};

/** The keys a destructured parameter reads: its computed module-scope keys. Null when it has a rest element or another key. */
const patternKeysOf = (pattern: Pattern, named: (property: string) => boolean, module: ModuleScope, names: Names): Access | null => {
    if (pattern.type !== "ObjectPattern") return null;
    const access: Access = { read: new Set(), write: new Set() };
    for (const property of pattern.properties) {
        if (property.type === "RestElement") return null;
        const { key } = property;
        if (key.type !== "Identifier") return null;
        if (!property.computed) {
            if (!named(key.name)) return null;
        }
        else if (isKey(key.name, module, names)) access.read.add(key.name);
        else return null;
    }
    return access;
};

const parameterKeys = (body: Node, parameter: Pattern | undefined, named: (property: string) => boolean, module: ModuleScope, names: Names): Access | null =>
    parameter === undefined ? { read: new Set(), write: new Set() }
    : parameter.type === "Identifier" ? keysOf(body, parameter.name, named, module, names)
    : patternKeysOf(parameter, named, module, names);

const mentions = (node: Node, name: string): boolean =>
    (node.type === "Identifier" && node.name === name) || children(node).some(child => mentions(child, name));

/**
 * What a main-thread body reads and writes through its row and context, for the parts where every access shows in
 * its source: each is indexed only by module-scope keys it doesn't shadow, and never passed on, aliased or spread.
 * Lookup results flow through ordinary values, so they aren't followed.
 */
export const usedBy = (body: Node, module: ModuleScope): Used => {
    if (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") return unknown;
    if (body.type === "FunctionExpression" && mentions(body.body, "arguments")) return unknown;
    const inner = declaredIn(body.body, new Set());
    const names: Names = { inner, all: new Set([...inner, ...body.params.flatMap(patternNames)]) };
    const [row, context] = body.params;
    return {
        query: parameterKeys(body.body, row, property => property === "entity", module, names),
        resources: parameterKeys(body.body, context, () => true, module, names),
        lookups: null,
    };
};
