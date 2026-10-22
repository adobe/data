import { threadOfDeclaration } from './declarations.js';
import { lookupKeysOf, orderKeysOf } from './indexes.js';
import { declarationOf, kindOf, labelOf } from './names.js';

type Key = symbol;
type Lists = {
    readonly read?: readonly Key[];
    readonly write?: readonly Key[];
    readonly added?: readonly Key[];
    readonly changed?: readonly Key[];
    readonly is?: readonly Key[];
};

/**
 * What places a system or finalizer: the names it reads, writes or filters on by change, but not `has` and `not`, and
 * the key parts of the indexes it looks up through or orders its rows by.
 */
export type Placed = {
    readonly components?: Lists;
    readonly lookup?: { readonly [name: string]: { readonly read?: readonly Key[]; readonly index?: unknown } };
    readonly up?: { readonly read?: readonly Key[] };
    readonly order?: unknown;
    readonly resources?: Lists;
};

/** Throws unless each key is registered as `kind`. */
export const requireRegistered = (what: "System" | "Finalizer", name: string, kind: "component" | "resource", keys: readonly Key[] | undefined): void => {
    for (const key of keys ?? []) {
        if (declarationOf(key) === undefined || kindOf(key) !== kind) {
            throw new Error(`${what} "${name}" uses ${kind} "${labelOf(key)}", which isn't a registered ${kind}; import the module that registers it.`);
        }
    }
};

/**
 * The thread a system or finalizer runs on: the one its object components and resources live on, or null when it uses
 * none. Throws when they live on different threads, or a name it's placed by isn't registered as its kind.
 */
export const threadOf = (declaration: Placed, what: "System" | "Finalizer", name: string): string | null => {
    /** By thread, the labels of the keys placing it there. */
    const threads = new Map<string, Set<string>>();
    const add = (kind: "component" | "resource", keys: readonly Key[] | undefined): void => {
        requireRegistered(what, name, kind, keys);
        for (const key of keys ?? []) {
            const found = declarationOf(key);
            const thread = found === undefined ? null : threadOfDeclaration(found);
            if (thread === null) continue;
            const labels = threads.get(thread) ?? new Set<string>();
            labels.add(`"${labelOf(key)}"`);
            threads.set(thread, labels);
        }
    };
    const { components, lookup, up, resources } = declaration;
    add("component", components?.read);
    add("component", components?.write);
    add("component", components?.added);
    add("component", components?.changed);
    for (const name in lookup) {
        add("component", lookup[name].read);
        add("component", lookupKeysOf(lookup[name]));
    }
    add("component", up?.read);
    add("component", orderKeysOf(declaration));
    add("resource", resources?.read);
    add("resource", resources?.write);
    add("resource", resources?.changed);
    add("resource", resources?.is);
    if (threads.size > 1) {
        const placed = [...threads].map(([thread, labels]) => `${[...labels].join(", ")} on "${thread}"`).join(" and ");
        throw new Error(`${what} "${name}" uses ${placed}; its object components and resources live on one thread.`);
    }
    return threads.keys().next().value ?? null;
};
