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
    const values: unknown[] = new Array<unknown>(count).fill(undefined);
    let last: unknown = null;
    let site: Site | null = null;
    const sites = new WeakMap<object, Site>();
    return {
        find: (lookup: unknown, a0?: unknown, a1?: unknown, a2?: unknown, a3?: unknown, a4?: unknown, a5?: unknown, a6?: unknown, a7?: unknown,
            a8?: unknown, a9?: unknown, a10?: unknown, a11?: unknown, a12?: unknown, a13?: unknown, a14?: unknown, a15?: unknown): unknown => {
            if (lookup !== last || site === null) {
                const found = indexLookupOf(lookup);
                if (found === undefined || typeof lookup !== "function") {
                    const given = [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15].slice(0, count);
                    return typeof lookup === "function" ? Reflect.apply(lookup, undefined, argumentsOf(shape, given)) : undefined;
                }
                site = sites.get(lookup) ?? createSite(found, shape);
                sites.set(lookup, site);
                last = lookup;
            }
            if (count > 0) values[0] = a0;
            if (count > 1) values[1] = a1;
            if (count > 2) values[2] = a2;
            if (count > 3) values[3] = a3;
            if (count > 4) values[4] = a4;
            if (count > 5) values[5] = a5;
            if (count > 6) values[6] = a6;
            if (count > 7) values[7] = a7;
            if (count > 8) values[8] = a8;
            if (count > 9) values[9] = a9;
            if (count > 10) values[10] = a10;
            if (count > 11) values[11] = a11;
            if (count > 12) values[12] = a12;
            if (count > 13) values[13] = a13;
            if (count > 14) values[14] = a14;
            if (count > 15) values[15] = a15;
            return site.find(values);
        },
    };
};
