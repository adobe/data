// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Expression, ObjectExpression, Property, SpreadElement, Pattern } from 'estree';
import type { Reduction } from '../../interface/resource/reduction.js';
import { isReduction, reductionOperators } from '../../interface/registry/reduction.js';
import { fail } from './failure.js';
import type { Lists } from './lists.js';
import type { ModuleScope } from './module-scope.js';

/**
 * A lookup by entity, or through an index (`index`), whose calls take a key and give a list of rows. A lookup by
 * entity that `watches` declares `changed`: its result has `changed` after what it reads.
 */
export type Lookup = { readonly name: string; readonly read: readonly string[]; readonly index: boolean; readonly watches: boolean; readonly optional: boolean };

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
    /** What it requires of its rows, its `with`. */
    readonly has: ReadonlySet<string>;
    /** Components its rows may lack, its `optional`: an archetype without one gives the kernel an empty column. */
    readonly optional: ReadonlySet<string>;
    readonly resources: readonly string[];
    readonly reduced: readonly Reduced[];
    readonly lookups: readonly Lookup[];
    readonly up: Up | null;
    /** Whether its rows run in an index's order, as a list, as `up`'s do. */
    readonly ordered: boolean;
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

/** `resources: { reduce: [resource, ...] }`, each folded with its declaration's `reduce` trait. */
const reductions = (node: Expression | Pattern, lists: Lists): readonly Reduced[] => {
    const names = identifiers(node, "resources.reduce", lists);
    return names.map((resource): Reduced => {
        const found = lists.reduction(resource);
        const operator = found?.operator;
        if (!isReduction(operator)) {
            const missing = found !== null && /\.m?js$/.test(found.file)
                ? `which its module's JavaScript doesn't register: declare it in TypeScript, and build a library declaring it with Compiler.plugin({ library: true })`
                : "which it can't find: declare the resource with reduce in the module that makes its key";
            return fail(node, `${resource} is reduced, so the build reads its operator from its declaration's reduce trait, ${operator === undefined ? missing : `"${operator}", which isn't one of ${reductionOperators.map(item => JSON.stringify(item)).join(", ")}`}`);
        }
        return { resource, operator };
    }).map((entry, index, all) => all.findIndex(other => other.resource === entry.resource) === index ? entry : fail(node, `${entry.resource} is reduced twice`));
};

/** How a `System.create` declaration's body compiles: to `target`, and whether its `kernel` requires it or it's tried. */
export type KernelRequest = { readonly target: "cpu" | "gpu"; readonly required: boolean };

/** Whether a declaration has property `name`, written out. */
const declares = (declaration: ObjectExpression, name: string): boolean => declaration.properties.some(property =>
    property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === name);

/** A declaration's `components.optional` property, or null without one. */
const hasOptional = (declaration: ObjectExpression): Property | null => {
    for (const property of declaration.properties) {
        if (property.type !== "Property" || property.computed || property.key.type !== "Identifier" || property.key.name !== "components") continue;
        if (property.value.type !== "ObjectExpression") return null;
        for (const field of property.value.properties) {
            if (field.type === "Property" && !field.computed && field.key.type === "Identifier" && field.key.name === "optional") return field;
        }
    }
    return null;
};

/**
 * How a `System.create` declaration compiles to a kernel, or null when it doesn't: `kernel: true` or `"gpu"` requires
 * it, `false` rules it out, and without it a system with components is tried, unless it observes, runs on one entity
 * or spreads what the build can't read.
 */
export const kernelOf = (declaration: ObjectExpression): KernelRequest | null => {
    const optional = hasOptional(declaration);
    for (const property of declaration.properties) {
        if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "kernel") {
            const { value } = property;
            if (value.type === "Literal" && value.value === "gpu" && optional !== null) return fail(optional, "a GPU kernel can't have optional components: WGSL has no undefined to read where an archetype lacks one, and a GPU kernel can't fail its system for one row; list them in with, or use kernel: true to run it on the CPU");
            if (value.type === "Literal" && value.value === true) return { target: "cpu", required: true };
            if (value.type === "Literal" && value.value === "gpu") return { target: "gpu", required: true };
            if (value.type === "Literal" && value.value === false) return null;
            return fail(value, `kernel must be the literal true, false or "gpu"`);
        }
    }
    if (declaration.properties.some(property => property.type === "SpreadElement")) return null;
    if (!declares(declaration, "components") || declares(declaration, "observer") || declares(declaration, "target")) return null;
    return { target: "cpu", required: false };
};

/** Reads and validates a kernel declaration; `lists` reads its lists of keys. */
export const signature = (declaration: ObjectExpression, module: ModuleScope, lists: Lists): Signature => {
    let components: ReadonlyMap<string, readonly string[]> | undefined;
    let resources: readonly string[] = [];
    let reduced: readonly Reduced[] = [];
    let changedResources: readonly string[] = [];
    let up: Up | null = null;
    let ordered = false;
    const lookups: Lookup[] = [];
    for (const [name, property] of properties(declaration, "a kernel declaration")) {
        switch (name) {
            case "components":
                components = keyLists(property.value, "components", ["read", "write", "with", "optional", "not", "added", "changed"], lists);
                break;
            case "resources":
                for (const [list, value] of properties(property.value, "resources")) {
                    // A condition in `is` is readable too; one in `not` is only checked before the kernel runs.
                    if (list === "read" || list === "is") resources = [...resources, ...identifiers(value.value, `resources.${list}`, lists)];
                    else if (list === "changed") changedResources = identifiers(value.value, "resources.changed", lists);
                    else if (list === "reduce") reduced = reductions(value.value, lists);
                    else if (list === "not") continue;
                    else if (list === "write") fail(value, "a kernel can't write resources: write them from a system that runs as written, or reduce into them");
                    else fail(value, `resources.${list} is not allowed in a kernel declaration`);
                }
                break;
            case "lookup":
                for (const [lookup, value] of properties(property.value, "lookup")) {
                    // The index is a value the world resolves; only that a lookup goes through one changes how it compiles.
                    const fields = properties(value.value, `lookup.${lookup}`);
                    const index = fields.some(([field]) => field === "index");
                    const listed = fields.filter(([field]) => field !== "index");
                    const read = listed.flatMap(([field, item]) => {
                        if (index ? field !== "read" && field !== "changed" : field !== "read" && field !== "with" && field !== "optional" && field !== "not" && field !== "changed") return fail(item, `lookup.${lookup}.${field} is not allowed in a kernel declaration`);
                        // An index lookup's `changed: true` filters the system's runs, which the world does before calling it.
                        if (index && field === "changed" && item.value.type === "Literal" && item.value.value === true) return [];
                        const names = identifiers(item.value, `lookup.${lookup}.${field}`, lists);
                        return field === "read" ? names : [];
                    });
                    lookups.push({ name: lookup, read, index, watches: !index && listed.some(([field]) => field === "changed"), optional: listed.some(([field]) => field === "optional") });
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
            // The index is a value the world resolves; only that rows run as a list changes how it compiles.
            case "order":
                ordered = true;
                break;
            case "kernel": case "before": case "after": case "during":
                break;
            default:
                fail(property, `${name} is not allowed in a kernel declaration`);
        }
    }
    if (components === undefined) return fail(declaration, "a system without components runs once, so there's nothing to compile");
    for (const { resource } of reduced) {
        if (resources.includes(resource) || changedResources.includes(resource)) fail(declaration, `${resource} is reduced, so it can't also be read or filtered on`);
    }
    const write = components.get("write") ?? [];
    const both = (components.get("read") ?? []).find(key => write.includes(key));
    if (both !== undefined) fail(declaration, `${both} is in both components read and write; write already makes it readable`);
    const rowFiltered = (components.get("added")?.length ?? 0) + (components.get("changed")?.length ?? 0) > 0;
    if (up !== null && ordered) fail(declaration, "a kernel can't use both up and order, which both decide the order of its rows");
    return { read: new Set(components.get("read")), write: new Set(write), has: new Set(components.get("with")), optional: new Set(components.get("optional")), resources, reduced, lookups, up, ordered, filtered: changedResources.length > 0 || rowFiltered };
};
