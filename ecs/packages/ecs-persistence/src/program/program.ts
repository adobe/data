// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component, Resource, type Schema, type Traits } from "@adobe/ecs";

/** A key a trait covers, with the name the trait saves it under and its schema. */
export type Persisted<K extends symbol = symbol> = { readonly name: string; readonly key: K; readonly schema: Schema };

/** What a trait covers: its components and resources by name. */
export type Program = {
    readonly by: symbol;
    readonly components: ReadonlyMap<string, Persisted<Component.Key>>;
    readonly resources: ReadonlyMap<string, Persisted<Resource.Key>>;
};

type Keyed = Component.Key | Resource.Key;

/** A trait of an application's own whose value names a key: its key a symbol, its value a string. */
export type NamingTrait = { readonly [T in keyof Traits<Keyed>]: T extends symbol ? [Traits<Keyed>[T]] extends [string] ? T : never : never }[keyof Traits<Keyed>];

/**
 * The keys of `declarations` with the trait `by`, by the name it gives each, or why one can't be saved: the trait's
 * value isn't a string, or the key isn't data, is derived, or has a name another has.
 */
const namedIn = <K extends symbol>(declarations: ReadonlyMap<K, Component.Declared>, kind: string, by: symbol): ReadonlyMap<string, Persisted<K>> | string => {
    const named = new Map<string, Persisted<K>>();
    for (const [key, declaration] of declarations) {
        const name: unknown = Reflect.get(declaration, by);
        if (name === undefined) continue;
        if (typeof name !== "string") return `A ${kind}'s value of the trait isn't a name: ${String(name)}.`;
        if (declaration.type === undefined) return `The ${kind} the trait names "${name}" isn't data: it has no schema.`;
        if (declaration.derived === true) return `The ${kind} the trait names "${name}" is derived, which its rule derives again once its entity is loaded.`;
        if (named.has(name)) return `The trait names two ${kind}s "${name}".`;
        named.set(name, { name, key, schema: declaration.type });
    }
    return named;
};

/** What the trait `by` covers, as the modules registered so far declare it, or why it can't be saved. */
export const programOf = (by: unknown): Program | string => {
    if (typeof by !== "symbol") return "`by` is the key of the trait to save by, a symbol.";
    const components = namedIn(Component.declarations(), "component", by);
    if (typeof components === "string") return components;
    const resources = namedIn(Resource.declarations(), "resource", by);
    if (typeof resources === "string") return resources;
    return { by, components, resources };
};
