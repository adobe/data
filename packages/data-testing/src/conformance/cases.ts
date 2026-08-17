// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import type { Case, DerivationCase } from "./types.js";

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

// The single envelope EVERY `cases` export holds — always an object, never a bare
// array, whether or not an `args` schema was given. One shape means discovery and the
// runners read `.cases` / `.args` with no branch, and there is exactly one way to
// author cases (a bare `cases = [ … ]` array is no longer a valid export).
export type CasesResult<State, F extends AnyFn> = {
  readonly args?: Schema;
  readonly cases: readonly Case<State, ArgsOf<F>>[];
};

// The same envelope for a derivation's `{ input, value }` cases (never any `args`).
export type DerivationsResult<F extends AnyFn> = {
  readonly cases: readonly DerivationCase<Parameters<F>[0], ReturnType<F>>[];
};

// The `State`-bound cases builder a feature aliases (`Conformance.cases`). `fn` is
// passed for TYPING only (so both the case types and the `args`-schema pin infer);
// discovery pairs the ecs op by the function's own name, so the builder ignores
// `fn` at runtime. Both overloads emit the SAME `CasesResult` envelope.
export interface CasesBuilder<State> {
  // No-options overload FIRST: a `cases(fn, ...cases)` call matches here immediately,
  // so the case literals keep their contextual types (a `Vec2` tuple stays a tuple).
  // `NoInfer` pins `F` to `fn`, not the cases.
  <F extends AnyFn>(fn: F, ...cases: readonly Case<State, ArgsOf<NoInfer<F>>>[]): CasesResult<State, F>;
  // Options overload SECOND: reached only when the second arg is an options object
  // (a `Case` has a `name`, which the options type forbids, so it can't match here).
  <F extends AnyFn, const S extends Schema = Schema>(
    fn: F,
    options: CasesOptions<F, S>,
    ...cases: readonly Case<State, ArgsOf<NoInfer<F>>>[]
  ): CasesResult<State, F>;
}

// The derivation builder a feature aliases (`Conformance.derivations`) — emits the
// same `{ cases }` envelope so discovery reads one shape for transitions and
// derivations alike (it dispatches on case shape, not export shape).
export interface DerivationsBuilder {
  <F extends AnyFn>(
    fn: F,
    ...cases: readonly DerivationCase<Parameters<NoInfer<F>>[0], ReturnType<NoInfer<F>>>[]
  ): DerivationsResult<F>;
}

export const casesBuilder = <State>(): CasesBuilder<State> => {
  const build = (_fn: AnyFn, ...rest: readonly unknown[]): unknown => {
    const first = rest[0];
    // An options object has no `name` (every case does), so it discriminates the
    // two overloads at runtime; either way the result is one `{ args?, cases }` shape.
    const isOptions =
      first !== null && typeof first === "object" && !Array.isArray(first) && !("name" in first);
    return isOptions ? { ...(first as object), cases: rest.slice(1) } : { cases: rest };
  };
  return build as CasesBuilder<State>;
};

export const derivationsBuilder = (): DerivationsBuilder => {
  const build = (_fn: AnyFn, ...cases: readonly unknown[]): unknown => ({ cases });
  return build as DerivationsBuilder;
};
