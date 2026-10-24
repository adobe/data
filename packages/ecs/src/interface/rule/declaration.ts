// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Derived } from '../component/value.js';

export type Declaration = {
    /** Which entities the rule matches, by the components they have and don't have. */
    readonly components: { readonly has?: readonly Component.Key[]; readonly not?: readonly Component.Key[] };
    /** Components present on matching entities, while any rule deriving them matches. */
    readonly derive: readonly Derived[];
};
