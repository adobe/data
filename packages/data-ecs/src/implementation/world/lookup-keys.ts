import type { Lookup } from '../../interface/system/access.js';
import { indexDefinitionOf, indexOfLookup } from '../../interface/registry/index.js';
import type { Component } from '../../interface/component/component.js';

/** Every component a lookup names: what it reads, matches on and watches, and for an index lookup the index's own. */
export const lookupComponentsOf = (lookup: Lookup): readonly Component.Key[] => {
    const index = indexOfLookup(lookup);
    if (index === undefined) return [...lookup.read ?? [], ..."has" in lookup ? lookup.has ?? [] : [], ..."not" in lookup ? lookup.not ?? [] : []];
    const { key, components } = index.declaration;
    return [...lookup.read ?? [], ..."changed" in lookup ? lookup.changed ?? [] : [], ...key, ...components?.has ?? [], ...components?.not ?? []];
};

const none: readonly Component.Key[] = [];

/**
 * The components whose changes the indexes of a declaration's lookups follow, which keep ticks and kernels' stamps
 * while it lives: each index's key parts, and what its lookups watch.
 */
export const indexWatchesOf = (lookup: { readonly [name: string]: Lookup } | undefined): readonly Component.Key[] => {
    if (lookup === undefined) return none;
    const keys: Component.Key[] = [];
    for (const name in lookup) {
        const declared = lookup[name];
        const index = indexOfLookup(declared);
        if (index === undefined) continue;
        keys.push(...index.declaration.key, ..."changed" in declared ? declared.changed ?? [] : []);
    }
    return keys;
};

/** Every component the index a declaration orders its rows by names: its key parts, `has` and `not`. */
export const orderComponentsOf = (declaration: { readonly order?: unknown }): readonly Component.Key[] => {
    const index = indexDefinitionOf(declaration.order);
    if (index === undefined) return none;
    const { key, components } = index.declaration;
    return [...key, ...components?.has ?? [], ...components?.not ?? []];
};
