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
import type { FrameArgWriters, FrameCases, SystemKeys, SystemsExact } from "./systems-types.js";

type AnyFn = (...args: never[]) => unknown;

// A feature's ECS implementation, paired with its pure spec — the manifest a feature's
// `ecs/conformance/` authors. `checkFeature` conforms every spec action against the
// plugin's same-named action and every derivation against its computed.
export interface Implementation<State extends object, Fns extends Record<string, AnyFn>, StoreT> {
  readonly spec: Spec<State, Fns, object, Record<string, AnyFn>>;
  // The assembled feature plugin (`MainService.plugin`): its actions are the ops under test.
  readonly plugin: Database.Plugin;
  // A real-time feature's systems (required when the spec has `systems`). `args` writes
  // each frame arg into the store (`dt` → `frameDelta`); `unmodelled` names the systems
  // the spec does not model (wasm physics, init-only seeding), each with its reason.
  // Every spec system conforms by running just that system. Each of `cases` — whole
  // frames — folds the spec systems and runs one ECS frame, both in `db.system.order`,
  // the order the `schedule`s declare; they live here because that order is the ECS's.
  readonly frame?: {
    readonly args: Readonly<Record<string, (db: never, value: never) => void>>;
    readonly unmodelled?: Readonly<Record<string, string>>;
    readonly cases?: object;
  };
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
    readonly actions?: Record<string, unknown>;
    readonly computeds?: Record<string, unknown>;
  };
}

// Pair a spec with its ECS implementation. A typed identity that arms the guards:
//   • `hydrate` exactness — EXACTLY the entity-list derivations (`HydrateExact`).
//   • `computedPlugin` requiredness — required when the spec has a derivation.
//   • `frame` requiredness and exactness — required when the spec has systems; one arg
//     writer per frame data arg; every ECS system modelled xor unmodelled.
export const implementation = <
  State extends object,
  Fns extends Record<string, AnyFn>,
  C extends object,
  P extends ProjectionShape<State>,
  const H extends readonly Extract<keyof Fns, string>[] = readonly [],
  PL extends Database.Plugin = Database.Plugin,
  Sys extends Record<string, AnyFn> = {},
  U extends string = never,
>(
  spec: Spec<State, Fns, C, Sys>,
  impl: Omit<Implementation<State, Fns, ProjectionStore<P>>, "spec" | "plugin" | "projection" | "hydrate" | "computedPlugin" | "frame"> & {
    readonly plugin: PL;
    readonly projection: P;
    readonly hydrate?: H;
  } & (HasDerivations<C> extends true ? { readonly computedPlugin: Database.Plugin } : { readonly computedPlugin?: Database.Plugin }) &
    HydrateExact<H, HydrationKeys<Fns, ProjectionValue<P>>> &
    ([keyof Sys] extends [never]
      ? { readonly frame?: undefined }
      : {
          readonly frame: {
            readonly args: FrameArgWriters<PL, Sys>;
            readonly unmodelled?: { readonly [K in U]: string };
            readonly cases?: FrameCases<State, Sys>;
          } & SystemsExact<Extract<keyof Sys, string>, U, SystemKeys<PL>>;
        }),
): Implementation<State, Fns, ProjectionStore<P>> =>
  // Runtime invariant the checker can't see: `impl` plus the spec IS this
  // Implementation (`P` widens to the stored `Projection`, `H` to `readonly string[]`;
  // the requiredness factors are compile-only phantoms).
  ({ ...impl, spec }) as unknown as Implementation<State, Fns, ProjectionStore<P>>;
