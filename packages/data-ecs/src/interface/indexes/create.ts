import type { Component } from '../component/component.js';
import { threadOfDeclaration } from '../registry/declarations.js';
import { takeIdOfDeclaration } from '../registry/ids.js';
import { addIndex } from '../registry/indexes.js';
import { nameOf } from '../registry/items.js';
import { layoutOf } from '../registry/layout.js';
import { declarationOf, firstKeyOf, kindOf, labelOf } from '../registry/names.js';
import type { Schema } from '../schema/schema.js';
import type { Listed, Property } from '../system/property.js';
import type { Created } from './created.js';
import type { Declaration } from './declaration.js';
import type { Index } from './index-type.js';

/** `not` excludes what the index holds by: its key parts and `has`. An index without a key isn't unique. */
type Validate<D extends Declaration> = {
    readonly components?: { readonly not?: readonly Exclude<Component.Key, D["key"][number] | Listed<Property<D, "components">, "has">>[] };
} & (D["key"] extends readonly [] ? { readonly unique?: false } : unknown);

/** Whether a schema's values have an order: numbers, booleans, entities and fixed-length tuples of them, and strings. */
const ordered = (schema: Schema): boolean => {
    if ("type" in schema && schema.type === "string") return true;
    const layout = layoutOf(schema);
    return layout.kind === "linear" && layout.leaves.every(leaf => leaf.path.every(step => typeof step === "number"));
};

/** Whether a schema's values are sets or maps, which a key part can't be yet. */
const collection = (schema: Schema): boolean => "type" in schema && (schema.type === "set" || schema.type === "map");

/**
 * Declares an index over components' values and returns it; nothing is built until a world's system or finalizer uses
 * it. It holds the entities with every key part and every component in `has`, and none in `not`, keyed by the values
 * of `key`, compared part by part: numbers and tuples by value, an entity with its generation, so a stale one finds
 * nothing. With an empty key it holds those entities, every entity but the resource entity when `has` and `not` are
 * empty too, and its lookup takes no key and gives them all, in entity order.
 * - `sorted`: keeps key order, numbers numerically, NaN last, booleans false first, strings by code point, tuples
 *   element by element, then entity order, so a lookup takes a prefix of the key whose last part may be a comparison.
 * - `unique`: at most one entity per key: a lookup by a whole key returns its row or null. When two entities share a
 *   key, the one with the lower entity index is kept, and the run that found them reports an `"index"` failure.
 *
 * Throws if a key part isn't a registered component of data, is listed twice or is a set or map, a sorted part has no
 * order, its object parts live on different threads, or on another than the world's beside a string, which the world
 * keeps its keys of, it's unique without a key, or `has` or `not` names a key that isn't a registered component
 * or `not` names a key part or a `has` component.
 */
export const create = <const D extends Declaration>(declaration: D & Validate<D>): Index<D> => {
    const id = takeIdOfDeclaration(declaration);
    const name = nameOf(declaration.name, id, "index");
    const fail = (message: string): never => { throw new Error(`Index "${name}" ${message}.`); };
    const { key, components, sorted } = declaration;
    if (!Array.isArray(key)) fail("needs a key: a list of components");
    if (key.length === 0 && declaration.unique === true) fail("is unique without a key: it holds at most one entity per key");
    const threads = new Set<string>();
    const parts = new Set<symbol>();
    for (const part of key) {
        const found = declarationOf(part);
        const type = found?.type;
        if (kindOf(part) !== "component" || type === undefined) fail(`has key part "${labelOf(part)}", which isn't a registered component of data`);
        else {
            if (parts.has(firstKeyOf(part))) fail(`lists key part "${labelOf(part)}" twice`);
            parts.add(firstKeyOf(part));
            if (collection(type)) fail(`has key part "${labelOf(part)}", a set or map, which a key part can't be yet`);
            if (sorted === true && !ordered(type)) fail(`is sorted by "${labelOf(part)}", whose values have no order: a sorted part is a number, boolean, entity, string or fixed-length tuple of them`);
            // The world's thread keeps keys of strings, so they hold the index there with its objects.
            const thread = found === undefined ? null : threadOfDeclaration(found) ?? (layoutOf(type).kind === "string" ? "world" : null);
            if (thread !== null) threads.add(thread);
        }
    }
    if (threads.size > 1) fail(`has key parts on threads ${[...threads].map(thread => `"${thread}"`).join(" and ")}; its object parts live on one thread, the world's beside a string`);
    const held = new Set<symbol>(parts);
    for (const component of components?.has ?? []) {
        if (kindOf(component) !== "component") fail(`has "${labelOf(component)}", which isn't a registered component`);
        held.add(firstKeyOf(component));
    }
    for (const component of components?.not ?? []) {
        if (kindOf(component) !== "component") fail(`excludes "${labelOf(component)}", which isn't a registered component`);
        if (held.has(firstKeyOf(component))) fail(`excludes "${labelOf(component)}", which it holds by`);
    }
    const index: Created = { kind: "index", name, declaration };
    return addIndex(index, id);
};
