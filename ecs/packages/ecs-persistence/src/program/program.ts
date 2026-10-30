// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component, Resource, type Schema } from "@adobe/ecs";
import { persist } from "../persist.js";

/** A key persisted, with its name and schema. */
export type Persisted<K extends symbol = symbol> = { readonly name: string; readonly key: K; readonly schema: Schema };

/** What the program persists: its components and resources by name. */
export type Program = {
    readonly components: ReadonlyMap<string, Persisted<Component.Key>>;
    readonly resources: ReadonlyMap<string, Persisted<Resource.Key>>;
};

/** The keys of `declarations` with a `persist` trait by name, or why one can't persist: it isn't data, or a name is taken. */
const namedIn = <K extends symbol>(declarations: ReadonlyMap<K, Component.Declared>, kind: string): ReadonlyMap<string, Persisted<K>> | string => {
    const named = new Map<string, Persisted<K>>();
    for (const [key, declaration] of declarations) {
        const name: unknown = declaration[persist];
        if (typeof name !== "string") continue;
        if (declaration.type === undefined) return `The ${kind} persisted as "${name}" isn't data: it has no schema.`;
        if (named.has(name)) return `Two ${kind}s are persisted as "${name}".`;
        named.set(name, { name, key, schema: declaration.type });
    }
    return named;
};

/** What the program persists, as its modules registered so far declare it, or why it can't. */
export const programOf = (): Program | string => {
    const components = namedIn(Component.declarations(), "component");
    if (typeof components === "string") return components;
    const resources = namedIn(Resource.declarations(), "resource");
    if (typeof resources === "string") return resources;
    return { components, resources };
};
