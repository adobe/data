import { threadOfDeclaration } from './declarations.js';
import { declarationOf, kindOf, labelOf } from './names.js';

type Key = symbol;
type Lists = {
    readonly read?: readonly Key[];
    readonly write?: readonly Key[];
    readonly added?: readonly Key[];
    readonly changed?: readonly Key[];
    readonly is?: readonly Key[];
};

/** What places a system or finalizer: the names it reads, writes or filters on by change, but not `has` and `not`. */
export type Placed = {
    readonly name: string;
    readonly components?: Lists;
    readonly lookup?: { readonly [name: string]: { readonly read?: readonly Key[] } };
    readonly up?: { readonly read?: readonly Key[] };
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
export const threadOf = (declaration: Placed, what: "System" | "Finalizer"): string | null => {
    const threads = new Set<string>();
    const add = (kind: "component" | "resource", keys: readonly Key[] | undefined): void => {
        requireRegistered(what, declaration.name, kind, keys);
        for (const key of keys ?? []) {
            const found = declarationOf(key);
            const thread = found === undefined ? null : threadOfDeclaration(found);
            if (thread !== null) threads.add(thread);
        }
    };
    const { components, lookup, up, resources } = declaration;
    add("component", components?.read);
    add("component", components?.write);
    add("component", components?.added);
    add("component", components?.changed);
    for (const name in lookup) add("component", lookup[name].read);
    add("component", up?.read);
    add("resource", resources?.read);
    add("resource", resources?.write);
    add("resource", resources?.changed);
    add("resource", resources?.is);
    const found = [...threads];
    if (found.length > 1) {
        throw new Error(`${what} "${declaration.name}" uses values on threads ${found.map(thread => `"${thread}"`).join(" and ")}; its object components and resources live on one thread.`);
    }
    return found[0] ?? null;
};
