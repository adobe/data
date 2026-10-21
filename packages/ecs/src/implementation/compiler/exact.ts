import type { Expression, ObjectExpression, Pattern } from 'estree';
import { fail } from './failure.js';
import type { Lists } from './lists.js';
import type { ModuleScope } from './module-scope.js';

type Access = { readonly read: ReadonlySet<string>; readonly write: ReadonlySet<string> };

/** The keys a body reads, writes and contributes to, by module-scope binding name; null where the body doesn't show every use. */
export type Used = {
    readonly query: Access | null;
    readonly resources: (Access & { readonly reduce: ReadonlySet<string> }) | null;
    /** The components read from each lookup's results, by lookup name: null for one whose results aren't followed. */
    readonly lookups: ReadonlyMap<string, ReadonlySet<string> | null> | null;
    /** The components read from `up`, when the body's uses are all known. */
    readonly up?: ReadonlySet<string>;
};

/** An object literal's plain-named properties; none for anything else. */
const fields = (node: Expression | Pattern | undefined): ReadonlyMap<string, Expression | Pattern> => new Map(node?.type !== "ObjectExpression" ? [] :
    node.properties.flatMap((property): (readonly [string, Expression | Pattern])[] =>
        property.type === "Property" && !property.computed && property.key.type === "Identifier" ? [[property.key.name, property.value]] : []));

/**
 * Requires a list to name only keys in `used`. A list `lists` can't read isn't checked, since its keys can't be matched
 * to the body's.
 */
const requireUsed = (node: Expression | Pattern | undefined, used: ReadonlySet<string>, lists: Lists, message: (name: string) => string): void => {
    const names = node === undefined ? null : lists.names(node);
    if (node === undefined || names === null || "error" in names) return;
    // A key of an array literal is reported where it's listed, and one of a list declared elsewhere where the system names the list.
    names.forEach((name, k) => {
        const element = node.type === "ArrayExpression" ? node.elements[k] : null;
        if (!used.has(name)) fail(element ?? node, message(name));
    });
};

/** Requires `reduce` to name only resources in `contributed`, when it names each by a computed module-scope key. */
const requireContributed = (reduce: Expression | Pattern | undefined, contributed: ReadonlySet<string>, module: ModuleScope): void => {
    if (reduce?.type !== "ObjectExpression") return;
    const keys = reduce.properties.map(property =>
        property.type === "Property" && property.computed && property.key.type === "Identifier" && module.has(property.key.name) ? property.key : null);
    for (const key of keys) if (key === null) return;
    for (const key of keys) if (key !== null && !contributed.has(key.name)) fail(key, `${key.name} is in reduce but never contributed to; remove it`);
};

/**
 * Requires a system's declared `read`, `write` and `reduce` to be exactly what its body uses: a key it never uses
 * would still narrow which entities match, and hold back systems that could otherwise run alongside it.
 */
export const requireExact = (declaration: ObjectExpression, used: Used, module: ModuleScope, lists: Lists): void => {
    const declared = fields(declaration);
    const components = fields(declared.get("components"));
    const resources = fields(declared.get("resources"));
    if (used.query !== null) {
        requireUsed(components.get("read"), used.query.read, lists, name => `${name} is in components read but never read; remove it, or move it to components has to keep requiring it`);
        requireUsed(components.get("write"), used.query.write, lists, name => `${name} is in components write but never written; remove it, or move it to components read if it's only read`);
    }
    if (used.resources !== null) {
        requireUsed(resources.get("read"), used.resources.read, lists, name => `${name} is in resources read but never read; remove it`);
        requireUsed(resources.get("write"), used.resources.write, lists, name => `${name} is in resources write but never written; remove it, or move it to resources read if it's only read`);
        requireContributed(declared.get("reduce"), used.resources.reduce, module);
    }
    if (used.up !== undefined) {
        requireUsed(fields(declared.get("up")).get("read"), used.up, lists,
            name => `${name} is in up.read but never read; remove it`);
    }
    if (used.lookups !== null) {
        for (const [lookup, value] of fields(declared.get("lookup"))) {
            const read = used.lookups.get(lookup);
            if (read === null) continue;
            const index = fields(value).has("index");
            requireUsed(fields(value).get("read"), read ?? new Set(), lists, name => index
                ? `${name} is in lookup.${lookup} read but never read; remove it`
                : `${name} is in lookup.${lookup} read but never read; remove it, or move it to lookup.${lookup} has to keep requiring it`);
        }
    }
};
