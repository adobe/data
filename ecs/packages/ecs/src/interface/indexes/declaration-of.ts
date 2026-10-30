// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import { indexDefinitionOf } from '../registry/indexes.js';
import { kindOf } from '../registry/names.js';
import type { Index } from './index-type.js';

/**
 * An index's declaration as `Index.create` registered it: its key, the components it holds by besides its key and those
 * it excludes, and whether it's sorted or unique.
 */
export type Declared = {
    readonly key: readonly Component.Key[];
    readonly components: { readonly with?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
    readonly sorted?: boolean;
    readonly unique?: boolean;
};

/** Registration takes only components for a key part, `with` and `not`. */
const isComponent = (key: symbol): key is Component.Key => kindOf(key) === "component";

/** The declaration `index` was created from, as registered, or undefined for a value `Index.create` didn't return. */
export const declarationOf = <D extends object>(index: Index<D>): Declared | undefined => {
    const created = indexDefinitionOf(index);
    if (created === undefined) return undefined;
    const { key, components, sorted, unique } = created.declaration;
    const held = components?.has?.filter(isComponent);
    const excluded = components?.not?.filter(isComponent);
    return {
        key: key.filter(isComponent),
        components: { ...held === undefined ? {} : { with: held }, ...excluded === undefined ? {} : { not: excluded } },
        ...sorted === undefined ? {} : { sorted },
        ...unique === undefined ? {} : { unique },
    };
};
