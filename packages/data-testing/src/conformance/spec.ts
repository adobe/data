// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import type { MatchOptions } from "../match/match.js";
import type { CaseModule, RequiredServices } from "./feature-types.js";
import type { SpecSystems } from "./systems-types.js";

type AnyFn = (...args: never[]) => unknown;

// A feature's pure spec — the manifest a feature's `spec/spec.ts` authors. It names
// only spec-tier things: no plugin, store or projection, so the spec never depends on
// the ECS implementation. `Conformance.implementation` pairs it with an ECS build.
export interface Spec<State extends object, Fns extends Record<string, AnyFn>, Cases extends object, Sys = {}> {
  // The `State` namespace: `create()` is the default each case's `before`/`input`
  // deltas over; `samples` are full states for the projection round-trip.
  readonly state: { create(): State; readonly samples?: readonly State[] };
  // The conformed functions — every spec action and derivation, authored as an
  // `import * as transforms` barrel. Its keys drive the coverage guard.
  readonly fns: Fns;
  // One inert `*.cases.ts` module per fn (coverage checked at compile time).
  readonly cases: Cases;
  // Shape-only templates, keyed by injected-service arg name. The runner calls each
  // once to enumerate the service's methods; returns come from each case's `responses`.
  readonly services?: Readonly<Record<string, () => object>>;
  // The feature's component + resource schemas (`{ ...components, ...resources }`),
  // keyed by State field name. Needed only when State holds entity references: an
  // `Entity.schema` field marks a reference, compared up to the same id-bijection as
  // entity map keys. Omit for a feature of self-contained values.
  readonly schemas?: Readonly<Record<string, Schema>>;
  readonly match?: MatchOptions;
  // A real-time feature's systems: pure functions named after the ECS systems they
  // specify, one case module each, and `noOp` states every system leaves unchanged.
  // Whole-frame cases depend on the ECS's schedule, so they live on the implementation.
  readonly systems?: SpecSystems<State, Sys>;
}

// Author a feature's spec manifest. A typed identity that arms the compile-time guards:
//   • `cases` coverage — a module for every fn (missing → error), none for a non-fn.
//   • `services` requiredness — exactly the injected-service keys the fns and systems declare.
//   • `systems.cases` coverage — a module for every system function.
export const spec = <
  State extends object,
  Fns extends Record<string, AnyFn>,
  C extends { readonly [K in keyof Fns]: CaseModule<State, Fns[K]> },
  Sys extends Record<string, AnyFn> = {},
>(
  manifest: Omit<Spec<State, Fns, C, Sys>, "services"> &
    RequiredServices<Fns & Sys> &
    ([Exclude<keyof C, keyof Fns>] extends [never]
      ? unknown
      : { readonly __casesError: "a case module names something that is not a conformed fn"; readonly extra: Exclude<keyof C, keyof Fns> }),
): Spec<State, Fns, C, Sys> =>
  // Runtime invariant the checker can't see: the constrained param IS this Spec (the
  // requiredness factors are compile-only phantoms with no runtime shape).
  manifest as unknown as Spec<State, Fns, C, Sys>;
