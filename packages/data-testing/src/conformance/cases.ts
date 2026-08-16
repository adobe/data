// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import type { Case } from "./types.js";

type AnyFn = (...args: never[]) => unknown;
// The transition's args type — its second parameter, or `void` when it takes none.
type ArgsOf<F extends AnyFn> = Parameters<F> extends [unknown, infer A, ...unknown[]] ? A : void;

// Surfaced at the call when the `args` schema does not describe the transition's
// args faithfully (a typo, a wrong or too-narrow field type). It only bites when
// the args type is NOT assignable to `Schema.ToType<args>`.
type ArgsSchemaMismatch = {
  readonly __argsSchemaMismatch: "the transition's args type must be assignable to Schema.ToType<options.args>";
};

// Options for a transition's cases. An object (not a bare schema) so more options
// can be added later without changing the call shape. `name?: never` keeps a `Case`
// (which always has a `name`) from matching this overload, so `cases(fn, ...cases)`
// with no options resolves to the second overload.
type CasesOptions<F extends AnyFn, S extends Schema> = {
  readonly name?: never;
  /**
   * Optional schema for this transition's `args`. Conformance uses it for ONE
   * purpose: to identify which argument fields are ENTITY REFERENCES — a field
   * typed with `Entity.schema` — so the runner resolves that spec-id to the entity
   * seeded for it (the args-side counterpart of the component schemas it reads for
   * state). Provide it whenever a transition addresses an entity by id in its
   * `args`; omit it otherwise. Describe only the fields you need identified — an
   * injected service, and any non-reference arg, may be left off. The args type
   * must be assignable to this schema's `Schema.ToType`, so the schema cannot drift
   * from the signature.
   */
  readonly args?: S & (ArgsOf<F> extends Schema.ToType<S> ? unknown : ArgsSchemaMismatch);
};

// The value a transition's `cases` export holds when options are given — the schema
// travels with the case list so discovery reads both.
export type CasesWithOptions<State, F extends AnyFn> = {
  readonly args?: Schema;
  readonly cases: readonly Case<State, ArgsOf<F>>[];
};

// The `State`-bound cases builder a feature aliases (`Conformance.cases`). `fn` is
// passed for TYPING only (so both the case types and the `args`-schema pin infer);
// discovery pairs the ecs op by the function's own name, so the builder ignores
// `fn` at runtime. The cases use a `const` type parameter `C` so their literals keep
// their narrow types — a `Vec2` tuple stays `readonly [number, number]` rather than
// widening to `number[]` — while `C`'s constraint still checks each case's shape.
export interface CasesBuilder<State> {
  // No-options overload FIRST: a `cases(fn, ...cases)` call matches here immediately,
  // so the case literals keep their contextual types (a `Vec2` tuple stays a tuple).
  // `NoInfer` pins `F` to `fn`, not the cases.
  <F extends AnyFn>(fn: F, ...cases: readonly Case<State, ArgsOf<NoInfer<F>>>[]): readonly Case<State, ArgsOf<NoInfer<F>>>[];
  // Options overload SECOND: reached only when the second arg is an options object
  // (a `Case` has a `name`, which the options type forbids, so it can't match here).
  <F extends AnyFn, const S extends Schema = Schema>(
    fn: F,
    options: CasesOptions<F, S>,
    ...cases: readonly Case<State, ArgsOf<NoInfer<F>>>[]
  ): CasesWithOptions<State, F>;
}

export const casesBuilder = <State>(): CasesBuilder<State> => {
  const build = (_fn: AnyFn, ...rest: readonly unknown[]): unknown => {
    const first = rest[0];
    // An options object has no `name` (every case does), so it discriminates the
    // two overloads at runtime.
    const isOptions =
      first !== null && typeof first === "object" && !Array.isArray(first) && !("name" in first);
    return isOptions ? { ...(first as object), cases: rest.slice(1) } : rest;
  };
  return build as CasesBuilder<State>;
};
