import type { Node, Property, SpreadElement } from 'estree';
import { children, declaredIn } from './estree.js';
import type { ModuleScope } from './module-scope.js';

/** A `commands.spawn({ ... })` call with literal keys: key expressions as module-scope source, value source ranges in order. */
export type SpawnSite = {
    readonly start: number;
    readonly end: number;
    readonly keys: readonly string[];
    readonly values: readonly { readonly start: number; readonly end: number }[];
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

/** Where a body reaches its commands: a name bound to them, or a context parameter's `commands`. */
const commandsOf = (parameter: Node | undefined): { readonly name: string; readonly viaContext: boolean } | null => {
    if (parameter?.type === "Identifier") return { name: parameter.name, viaContext: true };
    if (parameter?.type !== "ObjectPattern") return null;
    for (const property of parameter.properties) {
        if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "commands") {
            return property.value.type === "Identifier" ? { name: property.value.name, viaContext: false } : null;
        }
    }
    return null;
};

/**
 * The spawn sites in a main-thread system body whose values can pass positionally: calls of `spawn` on the commands
 * of the body's own context parameter, at index `context`, with an object literal of plain keys, each a string or a
 * module-scope constant. A body that redeclares the context or its commands anywhere is left alone, and so is a key
 * it shadows.
 */
export const spawnSites = (body: Node, module: ModuleScope, context: number): { readonly commands: string; readonly sites: readonly SpawnSite[] } | null => {
    if (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") return null;
    const reached = commandsOf(body.params[context]);
    if (reached === null) return null;
    const declared = new Set<string>();
    declaredIn(body.body, name => declared.add(name));
    if (declared.has(reached.name)) return null;
    const isCommands = (node: Node): boolean => reached.viaContext
        ? node.type === "MemberExpression" && !node.computed && !node.optional && node.object.type === "Identifier" && node.object.name === reached.name
            && node.property.type === "Identifier" && node.property.name === "commands"
        : node.type === "Identifier" && node.name === reached.name;
    const sites: SpawnSite[] = [];
    const visit = (node: Node): void => {
        if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed && !node.optional
            && isCommands(node.callee.object)
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
    return { commands: reached.viaContext ? `${reached.name}.commands` : reached.name, sites };
};
