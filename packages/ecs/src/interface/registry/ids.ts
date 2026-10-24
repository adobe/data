// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * The `Symbol.for` name of the global `Map` that code the plugin generates fills: from key to id, and from a
 * system's, rule's or finalizer's declaration to id. Its version changes with the map's format.
 */
export const idsName = "@adobe/ecs/ids@1";

const ids = Symbol.for(idsName);

/**
 * The `Symbol.for` name of the global `Map` code the plugin generates fills, from each key a module declares to its
 * kind and declaration, `{ kind, declaration }`, in the order modules evaluate. Every copy of the package reads it and
 * none changes it. Its version changes with the format.
 */
export const declarationsName = "@adobe/ecs/declarations@1";

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

/**
 * The `Symbol.for` name of the global `WeakMap` from a declaration to the label the plugin gave a constructor call that
 * isn't a top-level binding's, by the binding or function it's in, or an internal factory gave its declaration. Weak,
 * so a declaration whose constructor threw before taking its label isn't kept.
 */
export const labelsName = "@adobe/ecs/labels@1";

const labels = Symbol.for(labelsName);

/** The label given the declaration a constructor call passes, if any, taken out of the map. */
export const takeLabelOfDeclaration = (declaration: object): string | undefined => {
    const map: unknown = Reflect.get(globalThis, labels);
    if (!(map instanceof WeakMap || map instanceof Map)) return undefined;
    const label: unknown = map.get(declaration);
    if (label === undefined) return undefined;
    map.delete(declaration);
    return typeof label === "string" ? label : undefined;
};
