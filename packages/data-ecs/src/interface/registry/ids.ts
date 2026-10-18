/**
 * The `Symbol.for` name of the global `Map` that code the plugin generates fills: from key to id, and from a
 * system's, rule's or finalizer's declaration to id. Its version changes with the map's format.
 */
export const idsName = "@adobe/data-ecs/ids@1";

const ids = Symbol.for(idsName);

const idsMap = (): Map<unknown, unknown> | undefined => {
    const map: unknown = Reflect.get(globalThis, ids);
    return map instanceof Map ? map : undefined;
};

/** The id the plugin gave a key, its module path and binding (`src/keys.ts#position`), if it gave one. */
export const idOfKey = (key: symbol): string | undefined => {
    const id: unknown = idsMap()?.get(key);
    return typeof id === "string" ? id : undefined;
};

/**
 * The id the plugin gave the declaration a top-level binding's constructor call passes (`src/systems.ts#move`), if
 * it gave one, taken out of the map so the object declares nothing else under it.
 */
export const takeIdOfDeclaration = (declaration: object): string | undefined => {
    const map = idsMap();
    const id: unknown = map?.get(declaration);
    if (id === undefined) return undefined;
    map?.delete(declaration);
    return typeof id === "string" ? id : undefined;
};
