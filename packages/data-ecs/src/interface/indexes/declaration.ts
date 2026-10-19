import type { Component } from '../component/component.js';
import type { Name } from './name.js';

/** What `Index.create` takes, its fields documented there; not exported from the package. */
export type Declaration = {
    readonly name?: Name;
    readonly key: readonly [Component.Key, ...Component.Key[]];
    readonly components?: { readonly has?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
    readonly sorted?: boolean;
    readonly unique?: boolean;
};
