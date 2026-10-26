// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ArrayExpression, Expression, Identifier, MemberExpression, ObjectExpression, Pattern, Property } from 'estree';
import type { Used } from './body-access.js';

/** An object literal's plain-named properties; none for anything else. */
const fields = (node: Expression | Pattern | undefined): ReadonlyMap<string, Property> => new Map(node?.type !== "ObjectExpression" ? [] :
    node.properties.flatMap((property): (readonly [string, Property])[] =>
        property.type === "Property" && !property.computed && property.key.type === "Identifier" ? [[property.key.name, property]] : []));

/**
 * Whether the build saw every use the body makes of its row, resources and parent, and of its lookups through an
 * index: a kernel compiles from them. A lookup by entity whose rows it didn't follow reads all of its `with`.
 */
export const followsAll = (used: Used, declaration: ObjectExpression): boolean => {
    if (used.query === null || used.resources === null || used.up === null) return false;
    const lookups = fields(valueOf(fields(declaration).get("lookup")));
    if (used.lookups === null) return lookups.size === 0;
    return [...used.lookups].every(([name, read]) => read !== null || !fields(valueOf(lookups.get(name))).has("index"));
};

/** `names` in the order `first` lists them, then the rest in the order the body first used them. */
const ordered = (names: ReadonlySet<string>, first: readonly string[]): ReadonlySet<string> =>
    new Set([...first.filter(name => names.has(name)), ...names]);

/**
 * What a body uses, its row's and each lookup's keys in the order their `with` lists them, so the lists the world
 * takes follow the declaration as written.
 */
export const inOrder = (used: Used, declaration: ObjectExpression): Used => {
    const declared = fields(declaration);
    const components = fields(valueOf(declared.get("components")));
    const members = [...namesIn(valueOf(components.get("with"))), ...namesIn(valueOf(components.get("optional")))];
    const lookups = fields(valueOf(declared.get("lookup")));
    return {
        ...used,
        query: used.query === null ? null : { read: ordered(used.query.read, members), write: ordered(used.query.write, members), mutate: ordered(used.query.mutate, members) },
        lookups: used.lookups === null ? null : new Map([...used.lookups].map(([name, read]) =>
            [name, read === null ? null : ordered(read, namesIn(valueOf(fields(valueOf(lookups.get(name))).get("with"))))])),
    };
};

/**
 * The first key a body uses of its row, or of a lookup's rows by entity, that its declaration doesn't require, and
 * where it's required: types reject it too, but a body the build reads may have none. Null when every one is
 * required, or a list isn't an array literal the build can read.
 */
export const unrequired = (used: Used, declaration: ObjectExpression): { readonly key: string; readonly list: string } | null => {
    const declared = fields(declaration);
    const components = fields(valueOf(declared.get("components")));
    const literal = (names: readonly (Expression | undefined)[]): readonly string[] | null => {
        const lists = names.filter(node => node !== undefined);
        return lists.every(node => node.type === "ArrayExpression" && node.elements.every(element => element?.type === "Identifier" || element?.type === "MemberExpression"))
            ? lists.flatMap(node => namesIn(node)) : null;
    };
    const members = literal(["with", "optional", "added", "changed"].map(name => valueOf(components.get(name))));
    if (used.query !== null && members !== null) {
        const key = [...used.query.read, ...used.query.write].find(name => !members.includes(name));
        if (key !== undefined) return { key, list: "components with or optional" };
    }
    if (used.lookups !== null) {
        for (const [name, lookup] of fields(valueOf(declared.get("lookup")))) {
            const parts = fields(valueOf(lookup));
            const read = used.lookups.get(name);
            if (parts.has("index") || read === null || read === undefined) continue;
            const required = literal([valueOf(parts.get("with")), valueOf(parts.get("optional")), valueOf(parts.get("changed"))]);
            const key = required === null ? undefined : [...read].find(key => !required.includes(key));
            if (key !== undefined) return { key, list: `lookup.${name}.with or optional` };
        }
    }
    return null;
};

const list = (names: Iterable<string>): string => `[${[...names].join(", ")}]`;

/**
 * The source of what the build inferred a body uses, `Access` in `interface/system/resolve.ts`: its keys as the
 * module-scope bindings the body indexes by, null for a group it couldn't follow, and `at` where the body is.
 */
export const accessText = (used: Used, at: string, where?: ReadonlySet<string> | null): string => {
    const { query, resources, lookups, up } = used;
    // Keys changed inside their values are listed only when there are some, for registration to judge by kind.
    const mutate = (keys: ReadonlySet<string>): string => keys.size === 0 ? "" : `, mutate: ${list(keys)}`;
    const components = query === null ? "null" : `{ read: ${list([...query.read].filter(key => !query.write.has(key)))}, write: ${list(query.write)}${mutate(query.mutate)} }`;
    const resourceText = resources === null ? "null" : `{ read: ${list(resources.read)}, write: ${list(resources.write)}, reduce: ${list(resources.reduce)}${mutate(resources.mutate)} }`;
    const lookupText = lookups === null ? "null" : `{ ${[...lookups].map(([name, read]) => `${JSON.stringify(name)}: ${read === null ? "null" : list(read)}`).join(", ")} }`;
    // The resources `where`'s predicates read, only with predicates.
    const whereText = where === undefined ? "" : `, where: ${where === null ? "null" : list(where)}`;
    return `{ components: ${components}, resources: ${resourceText}, lookup: ${lookupText}, up: ${up === null ? "null" : list(up)}${whereText}, at: ${JSON.stringify(at)} }`;
};

/** A declaration's parts the build makes, located at `at`, so a failure in them points at the declaration. */
const made = (at: { readonly start: number; readonly end: number }) => {
    const identifier = (name: string): Identifier => ({ type: "Identifier", name, start: at.start, end: at.end });
    /** A key as the body named it: a binding, or a namespace's member. */
    const key = (name: string): Identifier | MemberExpression => {
        const [object, member] = name.split(".");
        return member === undefined || object === undefined ? identifier(name) : {
            type: "MemberExpression", object: identifier(object), property: identifier(member), computed: false, optional: false, start: at.start, end: at.end,
        };
    };
    const array = (names: Iterable<string>): ArrayExpression => ({ type: "ArrayExpression", elements: [...names].map(key), start: at.start, end: at.end });
    const property = (name: string, value: Expression): Property => ({
        type: "Property", key: identifier(name), value, kind: "init", computed: false, method: false, shorthand: false, start: at.start, end: at.end,
    });
    const object = (properties: readonly Property[]): ObjectExpression => ({ type: "ObjectExpression", properties: [...properties], start: at.start, end: at.end });
    return { identifier, array, property, object };
};

/** `node`'s value when it's a property whose value is an expression. */
const valueOf = (property: Property | undefined): Expression | undefined =>
    property !== undefined && property.value.type !== "ObjectPattern" && property.value.type !== "ArrayPattern" && property.value.type !== "RestElement" && property.value.type !== "AssignmentPattern"
        ? property.value : undefined;

/** The names an array literal of keys lists: bindings, or namespaces' members (`Shapes.circle`). */
const namesIn = (node: Expression | undefined): readonly string[] => node?.type !== "ArrayExpression" ? [] :
    node.elements.flatMap(element => element?.type === "Identifier" ? [element.name]
        : element?.type === "MemberExpression" && !element.computed && element.object.type === "Identifier" && element.property.type === "Identifier" ? [`${element.object.name}.${element.property.name}`]
        : []);

/**
 * A kernel's declaration as the compiler reads it, from the declaration written and what the build inferred its body
 * uses: `components` with `read` and `write` from the body beside its `with`, `resources` with `read` and `reduce`,
 * each lookup with `read`, and `up` with `read`. `used` follows every use (`followsAll`).
 */
export const resolvedDeclaration = (declaration: ObjectExpression, used: Used): ObjectExpression => {
    const { array, property, object } = made(declaration);
    const keep = (from: ReadonlyMap<string, Property>, names: readonly string[]): Property[] =>
        names.flatMap(name => from.get(name) ?? []);
    const properties: Property[] = [];
    let resourcesDeclared = false;
    for (const original of declaration.properties) {
        if (original.type !== "Property" || original.computed || original.key.type !== "Identifier") {
            properties.push(...original.type === "Property" ? [original] : []);
            continue;
        }
        const value = valueOf(original);
        const parts = fields(value);
        switch (original.key.name) {
            case "components": {
                if (value?.type !== "ObjectExpression" || used.query === null) break;
                const { read, write, mutate } = used.query;
                // A change inside a value is a write to the compiler, which rejects it for values written whole.
                const written = new Set([...write, ...mutate]);
                properties.push(property("components", object([
                    property("read", array([...read].filter(key => !written.has(key)))),
                    property("write", array(written)),
                    ...keep(parts, ["with", "optional", "not", "added", "changed"]),
                ])));
                continue;
            }
            case "resources": {
                if (value?.type !== "ObjectExpression" || used.resources === null) break;
                resourcesDeclared = true;
                properties.push(property("resources", resourcesOf(used.resources, keep(parts, ["is", "not", "changed"]), namesIn(valueOf(parts.get("is"))), array, property, object)));
                continue;
            }
            case "lookup": {
                if (value?.type !== "ObjectExpression" || used.lookups === null) break;
                properties.push(property("lookup", object([...parts].map(([name, lookup]) => {
                    const lookupParts = fields(valueOf(lookup));
                    // A lookup the body never uses reads nothing; null, one whose rows it didn't follow.
                    const found = used.lookups?.get(name);
                    const reads = found === undefined ? [] : found;
                    if (lookupParts.has("index")) {
                        // Rows the build didn't follow read everything the index holds, as the world resolves it.
                        const read = reads === null ? [] : [property("read", array(reads))];
                        return property(name, object([...read, ...keep(lookupParts, ["index", "changed"])]));
                    }
                    const withList = valueOf(lookupParts.get("with"));
                    // Rows the build didn't follow read everything the lookup requires.
                    const read = reads === null ? withList ?? array([]) : array(reads);
                    return property(name, object([property("read", read), ...keep(lookupParts, ["with", "optional", "not", "changed"])]));
                }))));
                continue;
            }
            case "up": {
                if (value?.type !== "ObjectExpression" || used.up === null) break;
                properties.push(property("up", object([...keep(parts, ["through"]), property("read", array(used.up))])));
                continue;
            }
        }
        properties.push(original);
    }
    if (!resourcesDeclared && used.resources !== null) properties.push(property("resources", resourcesOf(used.resources, [], [], array, property, object)));
    return object(properties);
};

/** A kernel's `resources`: what its body reads, but conditions it reads already, and reduces into; a write is refused by the compiler. */
const resourcesOf = (
    resources: NonNullable<Used["resources"]>, declared: readonly Property[], is: readonly string[],
    array: (names: Iterable<string>) => ArrayExpression, property: (name: string, value: Expression) => Property, object: (properties: readonly Property[]) => ObjectExpression,
): ObjectExpression => object([
    property("read", array([...resources.read].filter(key => !resources.write.has(key) && !is.includes(key)))),
    ...resources.write.size === 0 ? [] : [property("write", array(resources.write))],
    ...resources.reduce.size === 0 ? [] : [property("reduce", array(resources.reduce))],
    ...declared,
]);
