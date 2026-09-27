// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { MatchOptions } from "../match/match.js";
import type {
  CaseModule,
  HasDerivations,
  HydrateExact,
  HydrationKeys,
  ProjectionShape,
  ProjectionStore,
  ProjectionValue,
  RequiredServices,
} from "./feature-types.js";
import type { Projection } from "./run-feature.js";
import type { SchemaSource } from "./refify.js";
import { runSpec } from "./run-spec.js";
import { runFeature } from "./run-feature.js";
import { adaptCases } from "./adapt-spec.js";

type AnyFn = (...args: never[]) => unknown;

// One feature's whole conformance declaration — the single object both
// `spec.test.ts` (pure) and `conformance.test.ts` (ecs) import. It replaces the
// per-file `import.meta.glob` discovery with an explicit, local manifest: adding a
// transform means one line here, checked at COMPILE TIME (see `feature`).
export interface FeatureSpec<State extends object, Fns extends Record<string, AnyFn>, StoreT> {
  // The `State` namespace: `create()` is the default each case's `before`/`input`
  // deltas over; `samples` are full states for the projection round-trip.
  readonly state: { create(): State; readonly samples?: readonly State[] };
  // The conformed functions — exactly the transforms and derivations under test,
  // authored as an `import * as transforms` barrel. Its keys drive the guard below.
  readonly fns: Fns;
  // The corpus, one inert `*.cases.ts` module per fn. The mapped type over `keyof
  // Fns` is the coverage guard: a fn with no cases, or a case with no fn, is a
  // compile error — the guarantee the glob shape could never give.
  readonly cases: { readonly [K in keyof Fns]: CaseModule<State, Fns[K]> };
  // Shape-only recording-double templates, keyed by injected-service arg name. The
  // runner calls each once to enumerate the service's methods (no Proxy), then
  // synthesizes returns from each case's `responses`. Omit for a service-free feature.
  readonly services?: Readonly<Record<string, () => object>>;
  readonly plugin: Database.Plugin;
  readonly computedPlugin?: Database.Plugin;
  readonly projection: Projection<StoreT, State>;
  readonly hydrate?: readonly string[];
  readonly match?: MatchOptions;
  readonly ops?: {
    readonly transactions?: Record<string, unknown>;
    readonly actions?: Record<string, unknown>;
    readonly computeds?: Record<string, unknown>;
  };
}

// Author a feature's conformance manifest. Purely a typed identity — it exists so the
// generics infer from the argument and arm the compile-time guards. `P` (projection)
// and `C` (the concrete case modules) are captured, not widened, so their real types
// feed the checks:
//   • `cases` coverage — `C extends { [K in keyof Fns]: CaseModule }` requires a module
//     for every fn (missing → error); the `NoExtraCases` factor rejects a module whose
//     key is not a fn (extra → error).
//   • `hydrate` exactness — must be EXACTLY the entity-list derivations (`HydrateExact`).
//   • `services` requiredness — exactly the injected-service keys the fns declare, or
//     absent when none (`RequiredServices`); a missing template is a compile error, not
//     a runtime crash.
//   • `computedPlugin` requiredness — required when any authored case module is a
//     derivation (`HasDerivations<C>`), so a feature with derivations can't silently skip
//     its computed conformance by omitting the plugin.
export const feature = <
  State extends object,
  Fns extends Record<string, AnyFn>,
  P extends ProjectionShape<State>,
  C extends { readonly [K in keyof Fns]: CaseModule<State, Fns[K]> },
  const H extends readonly Extract<keyof Fns, string>[] = readonly [],
>(
  spec: Omit<FeatureSpec<State, Fns, ProjectionStore<P>>, "projection" | "cases" | "hydrate" | "services" | "computedPlugin"> & {
    readonly projection: P;
    readonly cases: C;
    readonly hydrate?: H;
  } & RequiredServices<Fns> &
    (HasDerivations<C> extends true ? { readonly computedPlugin: Database.Plugin } : { readonly computedPlugin?: Database.Plugin }) &
    ([Exclude<keyof C, keyof Fns>] extends [never]
      ? unknown
      : { readonly __casesError: "a case module names something that is not a conformed fn"; readonly extra: Exclude<keyof C, keyof Fns> }) &
    HydrateExact<H, HydrationKeys<Fns, ProjectionValue<P>>>,
): FeatureSpec<State, Fns, ProjectionStore<P>> =>
  // Runtime invariant the checker can't see: the constrained param IS this FeatureSpec
  // (`P` widens to the stored `Projection`, `C` to the `cases` mapped type, `H` to
  // `readonly string[]`, the fake factories to `() => object`). The several requiredness
  // factors are compile-only phantoms with no runtime shape, and together they defeat
  // TS's structural-overlap check for a direct `as`, so this goes through `unknown`.
  spec as unknown as FeatureSpec<State, Fns, ProjectionStore<P>>;

// The pure-spec suite for a manifest: adapt the inert cases into the discovery map
// `runSpec` consumes — WITH freshly-built recording doubles merged into each case's
// args from the `services` templates + `responses` — and run it unchanged. This
// test file's doubles are its own, independent of the ecs side's.
export const checkSpec = <State extends object, Fns extends Record<string, AnyFn>, StoreT>(
  spec: FeatureSpec<State, Fns, StoreT>,
): void => {
  runSpec({
    state: spec.state,
    transitions: adaptCases(spec.fns, spec.cases, spec.services, true),
    plugin: spec.plugin,
    match: spec.match,
  });
};

// The ecs conformance suite for a manifest: the same adapted, doubles-injected map
// drives `runFeature` unchanged (transactions ignore the injected services; only the
// actions consume each case's response schedule, exactly once). Fresh doubles again,
// so the pure and ecs runs never share FIFO state.
export const checkFeature = <State extends object, Fns extends Record<string, AnyFn>, StoreT extends SchemaSource>(
  spec: FeatureSpec<State, Fns, StoreT>,
): void => {
  runFeature<State, StoreT, { store: StoreT }>({
    state: spec.state,
    transitions: adaptCases(spec.fns, spec.cases, spec.services, true),
    plugin: spec.plugin,
    computedPlugin: spec.computedPlugin,
    projection: spec.projection,
    hydrate: spec.hydrate,
    match: spec.match,
    ops: spec.ops,
  });
};
