import type { Node, Property, SpreadElement } from 'estree';
import { children, declaredIn } from './estree.js';
import { fail } from './failure.js';
import type { ModuleScope } from './module-scope.js';

type Range = { readonly start: number; readonly end: number };

/**
 * A `commands.spawn({ ... })` or `commands.add(entity, { ... })` call with literal keys: key expressions as module-scope
 * source, and source ranges of the entity, for an add, and of the values in order.
 */
export type SpawnSite = Range & {
    readonly kind: "spawn" | "add";
    readonly entity: Range | null;
    readonly keys: readonly string[];
    readonly values: readonly Range[];
};

/**
 * A key as a module-scope expression, or null when the property isn't a module constant's computed key. A plain,
 * string or number key fails the build: it's never a component's, since component keys are symbols.
 */
const keyOf = (property: Property | SpreadElement, module: ModuleScope, declared: ReadonlySet<string>): string | null => {
    if (property.type !== "Property" || property.kind !== "init" || property.method) return null;
    const { key } = property;
    if (!property.computed || key.type === "Literal") return fail(key, "a command's keys are its components' symbols, as [key]; a plain or string key is never a component's");
    if (key.type !== "Identifier") return null;
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
 * The spawn and add sites in a main-thread system body whose values can pass positionally: calls of `spawn` or `add`
 * on the commands of the body's own context parameter, at index `context`, with an object literal of computed keys,
 * each a module-scope constant. A body that redeclares the context or its commands anywhere is left alone, and so is a
 * key it shadows.
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
            && isCommands(node.callee.object) && node.callee.property.type === "Identifier") {
            const method = node.callee.property.name;
            const [first, second] = node.arguments;
            const kind = method === "spawn" && node.arguments.length === 1 ? "spawn" : method === "add" && node.arguments.length === 2 && first.type !== "SpreadElement" ? "add" : null;
            const values = kind === "spawn" ? first : kind === "add" ? second : undefined;
            if (kind !== null && values?.type === "ObjectExpression") {
                const keys = values.properties.map(property => keyOf(property, module, declared));
                if (keys.every((key): key is string => key !== null)) {
                    sites.push({
                        kind,
                        start: node.start,
                        end: node.end,
                        entity: kind === "add" ? { start: first.start, end: first.end } : null,
                        keys,
                        values: values.properties.flatMap(property => property.type === "Property" ? [{ start: property.value.start, end: property.value.end }] : []),
                    });
                    return;
                }
            }
        }
        for (const child of children(node)) visit(child);
    };
    visit(body.body);
    return { commands: reached.viaContext ? `${reached.name}.commands` : reached.name, sites };
};
