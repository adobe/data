import { idsName } from './ids.js';

/** Gives a key an id, as code the plugin generates does for a top-level `Symbol(...)` declaration. */
export const identify = (key: symbol, id: string): void => {
    const name = Symbol.for(idsName);
    const existing: unknown = Reflect.get(globalThis, name);
    const map = existing instanceof Map ? existing : new Map<symbol, string>();
    map.set(key, id);
    Reflect.set(globalThis, name, map);
};
