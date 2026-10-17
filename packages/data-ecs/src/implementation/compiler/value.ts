import type { BlockStatement, Expression as SourceExpression, Pattern } from 'estree';
import type { Path, Program } from '../world/kernel.js';
import type { Expression } from './ir.js';
import type { Module } from './module-scope.js';
import type { Snapshot } from './snapshot.js';

/**
 * A compile-time value. `scalar` and `dynamic` hold an expression; `dynamic` is a plain JS value
 * (resource, `args`, lookup element) that may be indexed at runtime. Tuples and structs are scalarized.
 * `component` is an unread `row[component]` reference; `snapshot` is a local copy of one, read lazily per leaf.
 */
export type Value =
    | { readonly kind: "scalar"; readonly expression: Expression }
    | { readonly kind: "dynamic"; readonly expression: Expression }
    | { readonly kind: "tuple"; readonly items: readonly Value[] }
    | { readonly kind: "struct"; readonly fields: readonly (readonly [string, Value])[] }
    /** With `up`, a component of the row's parent, read through `up`. */
    | { readonly kind: "component"; readonly component: string; readonly path: Path; readonly up?: true }
    | { readonly kind: "snapshot"; readonly snapshot: Snapshot; readonly path: Path }
    | { readonly kind: "found"; readonly lookup: number; readonly expression: Expression }
    | { readonly kind: "lookup"; readonly lookup: number }
    /** A resource the kernel reduces into, by its index in `Signature.reduced`. */
    | { readonly kind: "reducer"; readonly reduced: number }
    /**
     * A helper, compiled in its own module. `identity` is unique per definition; `name` is for messages. `intrinsic` is
     * the WGSL builtin it matches, if its module declares one.
     */
    | { readonly kind: "function"; readonly name: string; readonly identity: string; readonly params: readonly Pattern[]; readonly body: BlockStatement | SourceExpression; readonly module: Module; readonly intrinsic?: Program.Intrinsic }
    /** A module namespace, such as `Vec3`, at its file. */
    | { readonly kind: "namespace"; readonly file: string }
    | { readonly kind: "method"; readonly owner: "math" | "commands"; readonly name: string }
    | { readonly kind: "row" }
    | { readonly kind: "context" }
    /** The context's `resources`, `lookup` and `reduce`. */
    | { readonly kind: "resources" }
    | { readonly kind: "lookups" }
    | { readonly kind: "reducers" }
    | { readonly kind: "commands" }
    | { readonly kind: "math" };

export const scalarValue = (expression: Expression): Value => ({ kind: "scalar", expression });

const describe: { readonly [K in Value["kind"]]: string } = {
    scalar: "a number", dynamic: "a value", tuple: "a tuple", struct: "a struct", component: "a component value",
    snapshot: "a component value", found: "a lookup result", lookup: "a lookup", reducer: "a reduction", function: "a helper",
    method: "a method", row: "row", context: "the context", resources: "the resources", lookups: "the lookups", reducers: "the reductions", commands: "commands", math: "Math", namespace: "a namespace",
};

/** A short description of a value's kind, for error messages. */
export const describeValue = (value: Value): string => describe[value.kind];
