import type { Node, Pattern, Property, SpreadElement } from 'estree';
import { children, isFunction } from './estree.js';
import type { ModuleScope } from './module-scope.js';

/** A `commands.spawn({ ... })` call with literal keys: key expressions as module-scope source, value source ranges in order. */
export type SpawnSite = {
    readonly start: number;
    readonly end: number;
    readonly keys: readonly string[];
    readonly values: readonly { readonly start: number; readonly end: number }[];
};

const patternNames = (pattern: Pattern): readonly string[] => {
    switch (pattern.type) {
        case "Identifier": return [pattern.name];
        case "ArrayPattern": return pattern.elements.flatMap(element => element === null ? [] : patternNames(element));
        case "ObjectPattern": return pattern.properties.flatMap(property => patternNames(property.type === "RestElement" ? property.argument : property.value));
        case "RestElement": return patternNames(pattern.argument);
        case "AssignmentPattern": return patternNames(pattern.left);
        case "MemberExpression": return [];
    }
};

/** Every name declared anywhere inside `node`: variables, parameters, functions, classes and catch parameters. */
const declaredIn = (node: Node, names: Set<string>): Set<string> => {
    switch (node.type) {
        case "VariableDeclarator": for (const name of patternNames(node.id)) names.add(name); break;
        case "FunctionDeclaration": case "FunctionExpression": case "ClassDeclaration": case "ClassExpression":
            if (node.id) names.add(node.id.name);
            break;
        case "CatchClause": if (node.param) for (const name of patternNames(node.param)) names.add(name); break;
        default: break;
    }
    if (isFunction(node) && (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression" || node.type === "FunctionDeclaration")) {
        for (const param of node.params) for (const name of patternNames(param)) names.add(name);
    }
    for (const child of children(node)) declaredIn(child, names);
    return names;
};

/** A key as a module-scope expression, or null when the property isn't a plain literal key. */
const keyOf = (property: Property | SpreadElement, module: ModuleScope, declared: ReadonlySet<string>): string | null => {
    if (property.type !== "Property" || property.kind !== "init" || property.method) return null;
    const { key } = property;
    if (key.type === "Literal") return typeof key.value === "string" ? JSON.stringify(key.value) : null;
    if (key.type !== "Identifier") return null;
    if (!property.computed) return JSON.stringify(key.name);
    return module.has(key.name) && !declared.has(key.name) ? key.name : null;
};

/**
 * The spawn sites in a main-thread system body whose values can pass positionally: calls of `commands.spawn` on the
 * body's own `commands` parameter with an object literal of plain keys, each a string or a module-scope constant.
 * A body that redeclares `commands` anywhere is left alone, and so is a key it shadows.
 */
export const spawnSites = (body: Node, module: ModuleScope): { readonly commands: string; readonly sites: readonly SpawnSite[] } | null => {
    if (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") return null;
    const [, , parameter] = body.params;
    if (parameter?.type !== "Identifier") return null;
    const commands = parameter.name;
    const declared = new Set<string>();
    declaredIn(body.body, declared);
    if (declared.has(commands)) return null;
    const sites: SpawnSite[] = [];
    const visit = (node: Node): void => {
        if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed && !node.optional
            && node.callee.object.type === "Identifier" && node.callee.object.name === commands
            && node.callee.property.type === "Identifier" && node.callee.property.name === "spawn"
            && node.arguments.length === 1 && node.arguments[0].type === "ObjectExpression") {
            const { properties } = node.arguments[0];
            const keys = properties.map(property => keyOf(property, module, declared));
            if (keys.every((key): key is string => key !== null)) {
                sites.push({
                    start: node.start,
                    end: node.end,
                    keys,
                    values: properties.flatMap(property => property.type === "Property" ? [{ start: property.value.start, end: property.value.end }] : []),
                });
                return;
            }
        }
        for (const child of children(node)) visit(child);
    };
    visit(body.body);
    return { commands, sites };
};
