// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Expression, Node, Property, SpreadElement } from 'estree';
import { children, declaredIn } from './estree.js';
import { fail } from './failure.js';
import type { ModuleScope } from './module-scope.js';

type Range = { readonly start: number; readonly end: number };

/**
 * A `commands.spawn(components)({ ... })` or `commands.add(entity, components, { ... })` call with literal keys: key
 * expressions as module-scope source, and source ranges of the entity, for an add, of the components and of the values
 * in order.
 */
export type SpawnSite = Range & {
    readonly kind: "spawn" | "add";
    readonly entity: Range | null;
    readonly components: Range;
    readonly keys: readonly string[];
    readonly values: readonly Range[];
};

/** A plain, string or number key, which is never a component's, since component keys are symbols. */
const plainKey = (property: Property | SpreadElement): boolean =>
    property.type === "Property" && property.kind === "init" && !property.method && (!property.computed || property.key.type === "Literal");

/** A key as a module-scope expression, or null when the property isn't a module constant's computed key. */
const keyOf = (property: Property | SpreadElement, module: ModuleScope, declared: ReadonlySet<string>): string | null => {
    if (property.type !== "Property" || property.kind !== "init" || property.method || !property.computed) return null;
    const { key } = property;
    if (key.type !== "Identifier") return null;
    return module.has(key.name) && !declared.has(key.name) ? key.name : null;
};

/** Whether an add's components are a list as written: an array literal, or a module constant of one, as the plugin may give it an index. */
const listed = (components: Expression, module: ModuleScope, declared: ReadonlySet<string>): boolean => {
    if (components.type === "ArrayExpression") return true;
    if (components.type !== "Identifier" || declared.has(components.name)) return false;
    const binding = module.get(components.name);
    if (binding?.kind !== "const") return false;
    const { init } = binding;
    return init.type === "ArrayExpression" || (init.type === "CallExpression" && init.callee.type === "Identifier" && /^archetype\$\d*$/.test(init.callee.name)
        && init.arguments[0]?.type === "ArrayExpression");
};

const plainKeyFailure = "a command's keys are its components' symbols, as [key]; a plain or string key is never a component's";

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
 * The spawn and add sites in a main-thread system body whose values can pass positionally: `spawn(components)(values)`
 * and `add(entity, components, values)` on the commands of the body's own context parameter, at index `context`, with
 * an object literal of computed keys, each a module-scope constant. A body that redeclares the context or its commands anywhere is left alone, and so is a
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
    /** The method a call makes on the commands, and its arguments, or null. */
    const method = (node: Node): { readonly name: string; readonly arguments: readonly (Expression | SpreadElement)[] } | null =>
        node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed && !node.optional
            && isCommands(node.callee.object) && node.callee.property.type === "Identifier"
            ? { name: node.callee.property.name, arguments: node.arguments }
            : null;
    const visit = (node: Node): void => {
        if (node.type === "CallExpression" && !node.optional) {
            const spawned = method(node.callee);
            const called = method(node);
            const spawn = spawned?.name === "spawn" && spawned.arguments.length === 1 && node.arguments.length === 1 ? spawned.arguments[0] : null;
            const add = called?.name === "add" && called.arguments.length === 3 ? called.arguments : null;
            const components = spawn ?? add?.[1] ?? null;
            const values = spawn !== null ? node.arguments[0] : add?.[2];
            const entity = add?.[0] ?? null;
            if (components !== null && components.type !== "SpreadElement" && entity?.type !== "SpreadElement" && values?.type === "ObjectExpression") {
                // A spawn's values, or a list add's, are keyed by components; one component's object value has keys of its own.
                const plain = values.properties.find(plainKey);
                if (plain !== undefined && (spawn !== null || listed(components, module, declared))) return fail(plain.type === "Property" ? plain.key : plain, plainKeyFailure);
                const keys = plain === undefined ? values.properties.map(property => keyOf(property, module, declared)) : [null];
                if (keys.every((key): key is string => key !== null)) {
                    sites.push({
                        kind: spawn !== null ? "spawn" : "add",
                        start: node.start,
                        end: node.end,
                        entity: entity === null ? null : { start: entity.start, end: entity.end },
                        components: { start: components.start, end: components.end },
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

/** An array literal of keys a command takes as its components, and the keys' names. */
export type ListSite = { readonly start: number; readonly end: number; readonly names: readonly string[] };

/** Whether a module-scope name is a key: a constant of `Symbol(...)`, or an import, which the appended function checks. */
const isKeyName = (name: string, module: ModuleScope, declared: ReadonlySet<string>): boolean => {
    if (declared.has(name)) return false;
    const binding = module.get(name);
    if (binding?.kind === "import") return true;
    return binding?.kind === "const" && binding.init.type === "CallExpression" && binding.init.callee.type === "Identifier" && binding.init.callee.name === "Symbol";
};

/**
 * The array literals of keys a main-thread system body passes its own commands as components, `spawn([...])`,
 * `add(entity, [...], ...)` and `remove(entity, [...])`, which the transform makes once, with an index, rather than on
 * every call. A list naming a key twice fails.
 */
export const listSites = (body: Node, module: ModuleScope, context: number): readonly ListSite[] => {
    if (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") return [];
    const reached = commandsOf(body.params[context]);
    if (reached === null) return [];
    const declared = new Set<string>();
    declaredIn(body.body, name => declared.add(name));
    if (declared.has(reached.name)) return [];
    const isCommands = (node: Node): boolean => reached.viaContext
        ? node.type === "MemberExpression" && !node.computed && !node.optional && node.object.type === "Identifier" && node.object.name === reached.name
            && node.property.type === "Identifier" && node.property.name === "commands"
        : node.type === "Identifier" && node.name === reached.name;
    const sites: ListSite[] = [];
    const visit = (node: Node): void => {
        if (node.type === "CallExpression" && !node.optional && node.callee.type === "MemberExpression" && !node.callee.computed && !node.callee.optional
            && isCommands(node.callee.object) && node.callee.property.type === "Identifier") {
            const { name } = node.callee.property;
            const list = name === "spawn" && node.arguments.length === 1 ? node.arguments[0]
                : (name === "add" || name === "remove") && node.arguments.length >= 2 ? node.arguments[1]
                : undefined;
            if (list?.type === "ArrayExpression" && list.elements.length > 0) {
                const names = list.elements.map(element => element?.type === "Identifier" && isKeyName(element.name, module, declared) ? element.name : null);
                if (names.every((key): key is string => key !== null)) {
                    const repeated = names.find((key, k) => names.indexOf(key) < k);
                    if (repeated !== undefined) return fail(list, `this list names ${repeated} twice; a list of components names each once`);
                    sites.push({ start: list.start, end: list.end, names });
                }
            }
        }
        for (const child of children(node)) visit(child);
    };
    visit(body.body);
    return sites;
};
