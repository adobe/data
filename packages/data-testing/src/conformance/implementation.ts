// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type {
  HasDerivations,
  HydrateExact,
  HydrationKeys,
  ProjectionShape,
  ProjectionStore,
  ProjectionValue,
} from "./feature-types.js";
import type { Projection } from "./run-feature.js";
import type { Spec } from "./spec.js";

type AnyFn = (...args: never[]) => unknown;

// A feature's ECS implementation, paired with its pure spec — the manifest a feature's
// `ecs/conformance/` authors. `checkFeature` conforms every spec action against the
// plugin's same-named action and every derivation against its computed.
export interface Implementation<State extends object, Fns extends Record<string, AnyFn>, StoreT> {
  readonly spec: Spec<State, Fns, object>;
  // The assembled feature plugin (`MainService.plugin`): its actions (and, for a spec
  // op with no action, its transactions) are the ops under test.
  readonly plugin: Database.Plugin;
  // The `ComputedDatabase` layer plugin, built alone so a `withCache` value from a
  // layer above can't go stale across the seed. Required when the spec has derivations.
  readonly computedPlugin?: Database.Plugin;
  readonly projection: Projection<StoreT, State>;
  // Names of computeds that emit an entity-id list (hydrated through `toData`).
  readonly hydrate?: readonly string[];
  // Base services injected into every db the runner builds — fakes for services whose
  // factory throws to require injection. Per-case recording doubles override them.
  readonly services?: Readonly<Record<string, () => object>>;
  // Override the ops read off the plugin facets.
  readonly ops?: {
    readonly transactions?: Record<string, unknown>;
    readonly actions?: Record<string, unknown>;
    readonly computeds?: Record<string, unknown>;
  };
}

// Pair a spec with its ECS implementation. A typed identity that arms the guards:
//   • `hydrate` exactness — EXACTLY the entity-list derivations (`HydrateExact`).
//   • `computedPlugin` requiredness — required when the spec has a derivation.
export const implementation = <
  State extends object,
  Fns extends Record<string, AnyFn>,
  C extends object,
  P extends ProjectionShape<State>,
  const H extends readonly Extract<keyof Fns, string>[] = readonly [],
>(
  spec: Spec<State, Fns, C>,
  impl: Omit<Implementation<State, Fns, ProjectionStore<P>>, "spec" | "projection" | "hydrate" | "computedPlugin"> & {
    readonly projection: P;
    readonly hydrate?: H;
  } & (HasDerivations<C> extends true ? { readonly computedPlugin: Database.Plugin } : { readonly computedPlugin?: Database.Plugin }) &
    HydrateExact<H, HydrationKeys<Fns, ProjectionValue<P>>>,
): Implementation<State, Fns, ProjectionStore<P>> =>
  // Runtime invariant the checker can't see: `impl` plus the spec IS this
  // Implementation (`P` widens to the stored `Projection`, `H` to `readonly string[]`;
  // the requiredness factors are compile-only phantoms).
  ({ ...impl, spec }) as unknown as Implementation<State, Fns, ProjectionStore<P>>;
