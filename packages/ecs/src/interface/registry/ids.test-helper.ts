// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationsName, idsName } from './ids.js';

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
