// © 2026 Adobe. MIT License. See /LICENSE for details.
import { takeAccessOf } from '../registry/ids.js';
import { indexDefinitionOf } from '../registry/indexes.js';
import { declarationOf, labelOf } from '../registry/names.js';
import { isString, isStruct } from '../registry/schemas.js';
import type { ComponentAccess, ComponentLists, Lookup, SystemLookup, SystemLookupLists } from './access.js';

type Key = symbol;

/** What a body reads and writes of a group of keys, and those it changes inside their values, read as well. */
type Used = { readonly read: readonly Key[]; readonly write: readonly Key[]; readonly mutate?: readonly Key[] };

/**
 * What the build infers a body uses, which the plugin gives the declaration or body a constructor is called with: what
 * it reads and writes of its row, and of resources with what it reduces into; what it reads of each lookup's rows,
 * and of its parent's values with `up`. Each is null where the build couldn't follow the body's uses, and `at` names
 * where the body is, for errors.
 */
export type Access = {
    readonly components: Used | null;
    readonly resources: (Used & { readonly reduce: readonly Key[] }) | null;
    readonly lookup: { readonly [name: string]: readonly Key[] | null } | null;
    readonly up: readonly Key[] | null;
    readonly at: string;
};

const isKeys = (value: unknown): value is readonly Key[] => Array.isArray(value) && value.every(key => typeof key === "symbol");

const isUsed = (value: unknown): value is Used => typeof value === "object" && value !== null
    && isKeys(Reflect.get(value, "read")) && isKeys(Reflect.get(value, "write"))
    && (Reflect.get(value, "mutate") === undefined || isKeys(Reflect.get(value, "mutate")));

const isAccess = (value: unknown): value is Access => {
    if (typeof value !== "object" || value === null) return false;
    const components: unknown = Reflect.get(value, "components");
    const resources: unknown = Reflect.get(value, "resources");
    const lookup: unknown = Reflect.get(value, "lookup");
    const up: unknown = Reflect.get(value, "up");
    return (components === null || isUsed(components))
        && (resources === null || (isUsed(resources) && isKeys(Reflect.get(resources, "reduce"))))
        && (lookup === null || (typeof lookup === "object" && Object.values(lookup).every(reads => reads === null || isKeys(reads))))
        && (up === null || isKeys(up)) && typeof Reflect.get(value, "at") === "string";
};

/**
 * What the build inferred the body a constructor is called with uses: given to its declaration, or for a system
 * declaring nothing to its body. Throws when there's none, as when a module isn't built with the plugin.
 */
export const accessOf = (what: string, made: object): Access => {
    const access = takeAccessOf(made);
    if (!isAccess(access)) throw new Error(`${what} has no access the build inferred from its body: the build reads what a body uses where the constructor is called with its declaration written in place, as an object literal, and its body as a function, in a module built with Compiler.plugin().`);
    return access;
};

/**
 * Throws for a body changing something inside a data value, a struct or a string, which a row or the resources give
 * as a copy and take only whole, so the change would be lost. An object, changed in place, is read.
 */
const checkChanges = (what: string, access: Access): void => {
    for (const [group, keys] of [["its row's", access.components?.mutate], ["resources'", access.resources?.mutate]] as const) {
        for (const key of keys ?? []) {
            const type = declarationOf(key)?.type;
            if (type !== undefined && (isStruct(type) || isString(type))) {
                throw new Error(`${what}'s body (${access.at}) changes something inside ${group} "${labelOf(key)}", a value given as a copy and taken only whole: assign it a new value instead.`);
            }
        }
    }
};

/** Throws for a group the build couldn't follow, naming what the body did instead. */
const followed = <T>(what: string, used: T | null, group: string, access: Access): T => {
    if (used !== null) return used;
    throw new Error(`${what}'s body (${access.at}) uses ${group} in a way the build can't follow, so it can't tell what it reads and writes of them: index them by key directly, or destructure them by key, rather than passing them on, aliasing or spreading them.`);
};

const without = (keys: readonly Key[], ...others: (readonly Key[] | undefined)[]): Key[] =>
    keys.filter(key => others.every(other => !other?.includes(key)));

/** `lists` without its empty lists. */
export const compact = <T extends object>(lists: T): T => {
    const result: { [name: string]: unknown } = {};
    for (const [name, value] of Object.entries(lists)) if (value !== undefined && !(Array.isArray(value) && value.length === 0)) result[name] = value;
    // Every field is one of `lists`', with its own value.
    return result as T;
};

/**
 * A row's lists: what the body reads and writes of its members, the others only required. Without the body's uses,
 * conservatively every member is written but references, which change only through commands, or read where it only
 * reads.
 */
export const componentLists = (components: ComponentAccess, used: Used | null, reading: boolean): ComponentLists => {
    // A row holds what its added and changed filters name too.
    const members = [...new Set([...components.with ?? [], ...components.added ?? [], ...components.changed ?? []])];
    const write = used === null
        ? reading ? [] : members.filter(key => declarationOf(key)?.reference === undefined)
        : used.write;
    const read = used === null ? without(members, write) : without(used.read, write);
    const has = without(members, read, write);
    return compact({ read, write, has, not: components.not, added: components.added, changed: components.changed });
};

/**
 * A lookup's lists: what the body reads of its rows, the rest of its `with` only required. Without the body's uses,
 * conservatively everything its rows hold is read: its `with`, or every component its index holds.
 */
export const lookupLists = (lookup: SystemLookup | Lookup, reads: readonly Key[] | null): SystemLookupLists => {
    if (lookup.index !== undefined) {
        const index = indexDefinitionOf(lookup.index)?.declaration;
        const read = reads ?? [...index?.key ?? [], ...index?.components?.has ?? []];
        const { changed } = lookup;
        return changed === true ? { index: lookup.index, read, changed } : compact({ index: lookup.index, read, changed });
    }
    const read = reads ?? lookup.with ?? [];
    return compact({ read, has: without(lookup.with ?? [], read), not: lookup.not, changed: lookup.changed });
};

/** Each lookup's lists, by name. */
export const lookupsLists = <L extends SystemLookup | Lookup>(lookups: { readonly [name: string]: L } | undefined, access: Access): { readonly [name: string]: SystemLookupLists } | undefined => {
    if (lookups === undefined) return undefined;
    const lists: { [name: string]: SystemLookupLists } = {};
    for (const name in lookups) {
        const lookup = lookups[name];
        // A lookup whose rows the build didn't follow is null; one it saw unused has no entry.
        const reads = access.lookup === null ? null : name in access.lookup ? access.lookup[name] ?? null : [];
        if (lookup !== undefined) lists[name] = lookupLists(lookup, reads);
    }
    return lists;
};

/**
 * What a body reads, writes and reduces into of resources, conditions in `is` read already. A read of what it reduces
 * into stays, for registration to reject.
 */
export const resourceUses = (what: string, access: Access, is: readonly Key[] | undefined): { readonly read: Key[]; readonly write: readonly Key[]; readonly reduce: readonly Key[] } => {
    checkChanges(what, access);
    const used = followed(what, access.resources, "its resources", access);
    return { read: without(used.read, used.write, is), write: used.write, reduce: used.reduce };
};

/** What a body reads of its parent's values. */
export const upReads = (what: string, access: Access): readonly Key[] => followed(what, access.up, "its parent's values", access);
