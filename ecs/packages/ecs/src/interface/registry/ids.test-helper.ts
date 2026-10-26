// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationsName, idsName, accessName } from './ids.js';

/**
 * Gives a key or a declaration an id, as code the plugin generates does for a top-level `Symbol(...)` declaration or a
 * top-level binding's constructor call. Returns what it was given.
 */
export const identify = <T extends symbol | object>(value: T, id: string): T => {
    const name = Symbol.for(idsName);
    const existing: unknown = Reflect.get(globalThis, name);
    const map = existing instanceof Map ? existing : new Map<unknown, string>();
    map.set(value, id);
    Reflect.set(globalThis, name, map);
    return value;
};

/** Records a key's declaration, as the function the plugin appends to a module declaring keys does. */
export const recordDeclaration = (key: symbol, kind: "component" | "resource" | "trait", declaration?: object): void => {
    const name = Symbol.for(declarationsName);
    const existing: unknown = Reflect.get(globalThis, name);
    const map = existing instanceof Map ? existing : new Map<unknown, unknown>();
    map.set(key, { kind, declaration });
    Reflect.set(globalThis, name, map);
};

/**
 * Gives a declaration, or the body of a system declaring nothing, what its body uses, as the plugin does where it sees
 * the constructor's call: for calls it doesn't see. Each list names keys; what isn't given is used by nothing.
 */
export const giveAccess = <T extends object>(made: T, uses: {
    readonly read?: readonly symbol[];
    readonly write?: readonly symbol[];
    readonly resources?: { readonly read?: readonly symbol[]; readonly write?: readonly symbol[]; readonly reduce?: readonly symbol[] };
    readonly lookup?: { readonly [name: string]: readonly symbol[] };
    readonly up?: readonly symbol[];
} = {}): T => {
    const name = Symbol.for(accessName);
    let map: unknown = Reflect.get(globalThis, name);
    if (!(map instanceof WeakMap)) Reflect.set(globalThis, name, map = new WeakMap<object, unknown>());
    if (map instanceof WeakMap) map.set(made, {
        components: { read: uses.read ?? [], write: uses.write ?? [] },
        resources: { read: uses.resources?.read ?? [], write: uses.resources?.write ?? [], reduce: uses.resources?.reduce ?? [] },
        lookup: uses.lookup ?? {},
        up: uses.up ?? [],
        at: "a test",
    });
    return made;
};
