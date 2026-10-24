// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';

/** What `Index.create` takes, its fields documented there; not exported from the package. */
export type Declaration = {
    readonly key: readonly Component.Key[];
    readonly components?: { readonly has?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
    readonly sorted?: boolean;
    readonly unique?: boolean;
};
