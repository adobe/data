/**
 * The `Symbol.for` name of the global `Map` from key to id that code the plugin generates fills. Its version changes
 * with the map's format.
 */
export const idsName = "@adobe/data-ecs/ids@1";

const ids = Symbol.for(idsName);

/** The id the plugin gave a key, its module path and binding (`src/keys.ts#position`), if it gave one. */
export const idOfKey = (key: symbol): string | undefined => {
    const map: unknown = Reflect.get(globalThis, ids);
    if (!(map instanceof Map)) return undefined;
    const id: unknown = map.get(key);
    return typeof id === "string" ? id : undefined;
};
