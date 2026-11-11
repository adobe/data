// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A derivation `Component.derive` declared: entities with every component in `has` and none in `not` have the
 * components in `derive`.
 */
export type Rule = {
    readonly kind: "rule";
    readonly name: string;
    readonly declaration: {
        readonly components: { readonly has?: readonly symbol[]; readonly not?: readonly symbol[] };
        readonly derive: readonly symbol[];
    };
};
