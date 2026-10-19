import { createSite, indexLookupOf, type Shape, type Site } from './index-lookups.js';

/** Arguments a site passes at most: its key's scalars, flattened from literals. */
export const maximumArguments = 16;

/** How many arguments a shape passes. */
const countOf = (shape: Shape): number => {
    let count = 0;
    for (const form of shape) {
        if (typeof form === "number") count += Math.max(1, form);
        else for (const [, operand] of form) count += Math.max(1, operand);
    }
    return count;
};

/** The arguments a call with literals would have passed, built back from the values a shape flattened them into. */
const argumentsOf = (shape: Shape, values: readonly unknown[]): unknown[] => {
    const built: unknown[] = [];
    let next = 0;
    const operand = (form: number): unknown => {
        if (form === 0) return values[next++];
        const tuple = values.slice(next, next + form);
        next += form;
        return tuple;
    };
    for (const form of shape) {
        if (typeof form === "number") built.push(operand(form));
        else {
            const comparison: { [operator: string]: unknown } = {};
            for (const [operator, count] of form) comparison[operator] = operand(count);
            built.push(comparison);
        }
    }
    return built;
};

/**
 * One index lookup call site of a main-thread body, for code the plugin emits: `find(lookup, ...values)` takes the
 * key as `shape` flattened it, so a literal tuple or comparison builds nothing, and returns the site's own list, or row
 * for a unique index, reused each time it runs. A function that isn't an index lookup is called as written.
 */
export const prepareLookup = (shape: Shape) => {
    const count = countOf(shape);
    let last: unknown = null;
    let site: Site | null = null;
    const sites = new WeakMap<object, Site>();
    /** The site for `lookup`, or null for a function that isn't an index lookup. */
    const siteOf = (lookup: unknown): Site | null => {
        const found = indexLookupOf(lookup);
        if (found === undefined || typeof lookup !== "function") return null;
        const made = sites.get(lookup) ?? createSite(found, shape);
        sites.set(lookup, made);
        last = lookup;
        site = made;
        return made;
    };
    /** A call of a function that isn't an index lookup, with the arguments a call with literals would have passed. */
    const asWritten = (lookup: unknown, values: readonly unknown[]): unknown =>
        typeof lookup === "function" ? Reflect.apply(lookup, undefined, argumentsOf(shape, values)) : undefined;
    // The commonest counts take exactly their arguments, so a call passes nothing more.
    switch (count) {
        case 1: return {
            find: (lookup: unknown, a0: unknown): unknown => {
                const current = lookup === last ? site : siteOf(lookup);
                return current === null ? asWritten(lookup, [a0]) : current.find(a0);
            },
        };
        case 2: return {
            find: (lookup: unknown, a0: unknown, a1: unknown): unknown => {
                const current = lookup === last ? site : siteOf(lookup);
                return current === null ? asWritten(lookup, [a0, a1]) : current.find(a0, a1);
            },
        };
        case 3: return {
            find: (lookup: unknown, a0: unknown, a1: unknown, a2: unknown): unknown => {
                const current = lookup === last ? site : siteOf(lookup);
                return current === null ? asWritten(lookup, [a0, a1, a2]) : current.find(a0, a1, a2);
            },
        };
        default: return {
            find: (lookup: unknown, a0?: unknown, a1?: unknown, a2?: unknown, a3?: unknown, a4?: unknown, a5?: unknown, a6?: unknown, a7?: unknown,
                a8?: unknown, a9?: unknown, a10?: unknown, a11?: unknown, a12?: unknown, a13?: unknown, a14?: unknown, a15?: unknown): unknown => {
                const current = lookup === last ? site : siteOf(lookup);
                if (current === null) return asWritten(lookup, [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15].slice(0, count));
                return current.find(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15);
            },
        };
    }
};
