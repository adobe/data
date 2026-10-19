import type { Expression, ObjectExpression, Property, SpreadElement, Pattern } from 'estree';
import type { Reduction } from '../../interface/resource/reduction.js';
import { isReduction, reductionOperators } from '../../interface/registry/reduction.js';
import { fail } from './failure.js';
import type { Lists } from './lists.js';
import type { ModuleScope } from './module-scope.js';

/** A lookup by entity, or through an index (`index`), whose calls take a key and give a list of rows. */
export type Lookup = { readonly name: string; readonly read: readonly string[]; readonly index: boolean };

/** The reference rows run down, and what the context's `up` reads of the entity it names. */
export type Up = { readonly through: string; readonly read: readonly string[] };

/** A resource the kernel reduces into, by its module-scope binding name. */
export type Reduced = { readonly resource: string; readonly operator: Reduction };

/**
 * The parts of a kernel declaration the compiler needs. Component and resource keys are expressions of the kernel's
 * module: its module-scope bindings, or, for a key only another module's list names, that list indexed (`lists.ts`).
 */
export type Signature = {
    readonly read: ReadonlySet<string>;
    readonly write: ReadonlySet<string>;
    readonly resources: readonly string[];
    readonly reduced: readonly Reduced[];
    readonly lookups: readonly Lookup[];
    readonly up: Up | null;
    /** Whether its rows run in an index's order, as a list, as `up`'s do. */
    readonly ordered: boolean;
    readonly input: boolean;
    /** Whether it filters on `added` or `changed` components, or on changed resources. */
    readonly filtered: boolean;
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

/** Keys a kernel declaration lists, as `Lists.names` reads them; `what` names the list in a failure. */
const identifiers = (node: Expression | Pattern, what: string, lists: Lists): readonly string[] => {
    const names = lists.names(node);
    return "error" in names ? fail(node, `${what}: ${names.error}`) : names;
};

const keyLists = (node: Expression | Pattern, what: string, allowed: readonly string[], lists: Lists): ReadonlyMap<string, readonly string[]> =>
    new Map(properties(node, what).map(([name, property]) => allowed.includes(name)
        ? entry(name, identifiers(property.value, `${what}.${name}`, lists))
        : fail(property, `${what}.${name} is not allowed in a kernel declaration`)));

/** `reduce: { [resource]: "operator", ... }`, with resources bound at module scope. */
const reductions = (node: Expression | Pattern, module: ModuleScope): readonly Reduced[] => {
    if (node.type !== "ObjectExpression") return fail(node, "reduce must be an object literal in a kernel declaration");
    return node.properties.map((property): Reduced => {
        if (property.type === "SpreadElement" || !property.computed || property.key.type !== "Identifier" || !module.has(property.key.name)) {
            return fail(property, "reduce names each resource as a computed key bound at module scope, as in { [total]: \"+\" }");
        }
        const { value } = property;
        const operator = value.type === "Literal" ? value.value : undefined;
        if (!isReduction(operator)) return fail(value, `a resource is reduced with one of ${reductionOperators.map(item => JSON.stringify(item)).join(", ")}`);
        return { resource: property.key.name, operator };
    }).map((entry, index, all) => all.findIndex(other => other.resource === entry.resource) === index ? entry : fail(node, `${entry.resource} is reduced twice`));
};

/** What kind of kernel a `System.create` declaration compiles to, or null when it isn't a kernel. */
export const kernelOf = (declaration: ObjectExpression): "cpu" | "gpu" | null => {
    for (const property of declaration.properties) {
        if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "kernel") {
            const { value } = property;
            if (value.type === "Literal" && (value.value === "cpu" || value.value === "gpu")) return value.value;
            return fail(value, `kernel must be the literal "cpu" or "gpu"`);
        }
    }
    return null;
};

/** Reads and validates a kernel declaration; `lists` reads its lists of keys. */
export const signature = (declaration: ObjectExpression, module: ModuleScope, lists: Lists): Signature => {
    let components: ReadonlyMap<string, readonly string[]> | undefined;
    let resources: readonly string[] = [];
    let reduced: readonly Reduced[] = [];
    let changedResources: readonly string[] = [];
    let input = false;
    let up: Up | null = null;
    let ordered = false;
    const lookups: Lookup[] = [];
    for (const [name, property] of properties(declaration, "a kernel declaration")) {
        switch (name) {
            case "components":
                components = keyLists(property.value, "components", ["read", "write", "has", "not", "added", "changed"], lists);
                break;
            case "resources":
                for (const [list, value] of properties(property.value, "resources")) {
                    // A condition in `is` is readable too; one in `not` is only checked before the kernel runs.
                    if (list === "read" || list === "is") resources = [...resources, ...identifiers(value.value, `resources.${list}`, lists)];
                    else if (list === "changed") changedResources = identifiers(value.value, "resources.changed", lists);
                    else if (list === "not") continue;
                    else fail(value, `resources.${list} is not allowed in a kernel declaration`);
                }
                break;
            case "reduce":
                reduced = reductions(property.value, module);
                break;
            case "lookup":
                for (const [lookup, value] of properties(property.value, "lookup")) {
                    // The index is a value the world resolves; only that a lookup goes through one changes how it compiles.
                    const fields = properties(value.value, `lookup.${lookup}`);
                    const index = fields.some(([field]) => field === "index");
                    const listed = fields.filter(([field]) => field !== "index");
                    const read = listed.flatMap(([field, item]) => {
                        if (index ? field !== "read" && field !== "changed" : field !== "read" && field !== "has" && field !== "not") return fail(item, `lookup.${lookup}.${field} is not allowed in a kernel declaration`);
                        const names = identifiers(item.value, `lookup.${lookup}.${field}`, lists);
                        return field === "read" ? names : [];
                    });
                    lookups.push({ name: lookup, read, index });
                }
                break;
            case "up": {
                let through: string | undefined;
                let read: readonly string[] = [];
                for (const [field, value] of properties(property.value, "up")) {
                    if (field === "through") {
                        const node = value.value;
                        through = node.type === "Identifier" && module.has(node.name) ? node.name : fail(node, "up.through is an identifier bound at module scope");
                    }
                    else if (field === "read") read = identifiers(value.value, "up.read", lists);
                    else fail(value, `up.${field} is not allowed in a kernel declaration`);
                }
                up = { through: through ?? fail(property, "up needs through"), read };
                break;
            }
            case "input":
                input = true;
                break;
            // The index is a value the world resolves; only that rows run as a list changes how it compiles.
            case "order":
                ordered = true;
                break;
            case "name": case "kernel": case "before": case "after": case "during":
                break;
            default:
                fail(property, `${name} is not allowed in a kernel declaration`);
        }
    }
    if (components === undefined) return fail(declaration, "a kernel needs components");
    for (const { resource } of reduced) {
        if (resources.includes(resource) || changedResources.includes(resource)) fail(declaration, `${resource} is reduced, so it can't also be read or filtered on`);
    }
    const write = components.get("write") ?? [];
    const both = (components.get("read") ?? []).find(key => write.includes(key));
    if (both !== undefined) fail(declaration, `${both} is in both components read and write; write already makes it readable`);
    const rowFiltered = (components.get("added")?.length ?? 0) + (components.get("changed")?.length ?? 0) > 0;
    if (up !== null && ordered) fail(declaration, "a kernel can't use both up and order, which both decide the order of its rows");
    return { read: new Set(components.get("read")), write: new Set(write), resources, reduced, lookups, up, ordered, input, filtered: changedResources.length > 0 || rowFiltered };
};
