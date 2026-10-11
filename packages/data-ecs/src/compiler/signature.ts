import type { Expression, ObjectExpression, Property, SpreadElement, Pattern } from 'estree';
import { fail } from './failure.js';
import type { ModuleScope } from './module-scope.js';

export type Lookup = { readonly name: string; readonly read: readonly string[] };

/** The parts of a kernel declaration the compiler needs. Component and resource keys are module-scope binding names. */
export type Signature = {
    readonly read: ReadonlySet<string>;
    readonly write: ReadonlySet<string>;
    readonly resources: readonly string[];
    readonly lookups: readonly Lookup[];
    readonly args: boolean;
};

const entry = <T>(name: string, value: T): readonly [string, T] => [name, value];

const propertyName = (property: Property): string => {
    if (!property.computed && property.key.type === "Identifier") return property.key.name;
    if (property.key.type === "Literal" && typeof property.key.value === "string") return property.key.value;
    return fail(property.key, "kernel declaration keys must be plain names");
};

const properties = (node: Expression | Pattern, what: string): readonly (readonly [string, Property])[] => {
    if (node.type !== "ObjectExpression") return fail(node, `${what} must be an object literal in a kernel declaration`);
    return node.properties.map((property: Property | SpreadElement) => property.type === "SpreadElement"
        ? fail(property, `${what} can't use spread in a kernel declaration`)
        : entry(propertyName(property), property));
};

const identifiers = (node: Expression | Pattern, module: ModuleScope): readonly string[] => {
    if (node.type !== "ArrayExpression") return fail(node, "kernel declarations list keys in an array literal");
    return node.elements.map(element => element?.type === "Identifier" && module.has(element.name)
        ? element.name
        : fail(element ?? node, "kernel declarations list keys as identifiers bound at module scope"));
};

const lists = (node: Expression | Pattern, what: string, allowed: readonly string[], module: ModuleScope): ReadonlyMap<string, readonly string[]> =>
    new Map(properties(node, what).map(([name, property]) => allowed.includes(name)
        ? entry(name, identifiers(property.value, module))
        : fail(property, `${what}.${name} is not allowed in a kernel declaration`)));

/** Whether a `System.create` declaration opts into compilation. */
export const isKernel = (declaration: ObjectExpression): boolean => {
    for (const property of declaration.properties) {
        if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "kernel") {
            if (property.value.type === "Literal" && typeof property.value.value === "boolean") return property.value.value;
            return fail(property.value, "kernel must be the literal true or false");
        }
    }
    return false;
};

/** Reads and validates a kernel declaration. */
export const signature = (declaration: ObjectExpression, module: ModuleScope): Signature => {
    let query: ReadonlyMap<string, readonly string[]> | undefined;
    let resources: readonly string[] = [];
    let args = false;
    const lookups: Lookup[] = [];
    for (const [name, property] of properties(declaration, "a kernel declaration")) {
        switch (name) {
            case "query":
                query = lists(property.value, "query", ["read", "write", "has", "not", "added", "changed"], module);
                break;
            case "resources":
                resources = lists(property.value, "resources", ["read", "changed"], module).get("read") ?? [];
                break;
            case "lookup":
                for (const [lookup, value] of properties(property.value, "lookup")) {
                    lookups.push({ name: lookup, read: lists(value.value, `lookup.${lookup}`, ["read", "has", "not"], module).get("read") ?? [] });
                }
                break;
            case "args":
                args = true;
                break;
            case "name": case "kernel": case "before": case "after": case "during":
                break;
            default:
                fail(property, `${name} is not allowed in a kernel declaration`);
        }
    }
    if (query === undefined) return fail(declaration, "a kernel needs a query");
    return { read: new Set(query.get("read")), write: new Set(query.get("write")), resources, lookups, args };
};
