// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';

/** What `Index.create` takes, its fields documented there; not exported from the package. */
export type Declaration = {
    readonly key: readonly Component.Key[];
    readonly components?: { readonly with?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
    readonly sorted?: boolean;
    readonly unique?: boolean;
};

/** An index's declaration as the world takes it: what it requires in `has`. */
export type Stored = Omit<Declaration, "components"> & {
    readonly components?: { readonly has?: readonly symbol[]; readonly not?: readonly symbol[] };
};
