// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { Database, Store } from "@adobe/data/ecs";
import type { Entity } from "@adobe/data/ecs";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { runTransactions } from "./run-transactions.js";
import { runActions } from "./run-actions.js";
import { runComputeds } from "./run-computeds.js";
import { refifyState, type SchemaSource } from "./refify.js";

// The feature's ecs↔`State` projection — the one genuinely feature-specific piece.
export interface Projection<Store, State> {
  readonly fromState: (store: Store, state: State) => ReadonlyMap<unknown, Entity> | void;
  readonly toState: (store: Store) => State;
  readonly toData?: (store: Store, entity: Entity) => unknown;
}

// One call conforms a whole feature. The runner pulls the ops off the plugin's
// registered facets (`plugin.transactions` / `plugin.actions` /
// `computedPlugin.computed`) and constructs the stores/dbs itself, so a feature
// supplies only its `State` namespace (default + representative samples), the
// `data/state` glob (the `{ fn, cases }` source), the plugin(s), and its
// projection. It runs the transaction, action, and computed conformance plus a
// projection round-trip (`toState ∘ fromState ≡ identity`) over `State.samples`.
//
// A feature whose ops aren't registered in the facet (a conformance-only action),
// or that needs ambient per-case context (a user-scoped `userId`), uses the
// lower-level `runTransactions`/`runActions`/`runComputeds` directly instead.
export interface FeatureRunConfig<State, StoreT, Db extends { store: StoreT }> {
  // The `State` namespace: `create()` is the default seed each case's `before`
  // deltas over; `samples` (optional) are representative full states for the
  // projection round-trip.
  readonly state: { create(): State; readonly samples?: readonly State[] };
  // `import.meta.glob(["../../../data/state/*.ts", "!**/*.test.ts", "!**/*.type-test.ts"], { eager: true })`.
  readonly transitions: Record<string, Record<string, unknown>>;
  // The assembled feature plugin (`MainService.plugin`) — its `.transactions` and
  // `.actions` facets are the ops, and it builds the transaction store + action db.
  readonly plugin: Database.Plugin;
  // The `ComputedDatabase` layer plugin — its `.computed` facet is the ops, built
  // from this layer for seed-freshness. Omit when the feature has no derivations.
  readonly computedPlugin?: Database.Plugin;
  readonly projection: Projection<StoreT, State>;
  // Names of computeds that emit an entity-id list (hydrated through `toData`).
  readonly hydrate?: readonly string[];
  readonly match?: MatchOptions;
  // Override the ops discovered from the plugin when they aren't registered in a
  // facet (e.g. per-transition actions kept out of the plugin to bound its type).
  readonly ops?: {
    readonly transactions?: Record<string, unknown>;
    readonly actions?: Record<string, unknown>;
    readonly computeds?: Record<string, unknown>;
  };
}

// Runtime invariant: a plugin object carries its registered facet maps (see
// `create-plugin.ts`), so this reads the ops directly off it.
type PluginFacets = { transactions: Record<string, unknown>; actions: Record<string, unknown>; computed: Record<string, unknown> };

export function runFeature<State, StoreT extends SchemaSource, Db extends { store: StoreT }>(
  config: FeatureRunConfig<State, StoreT, Db>,
): void {
  const initial = config.state.create();
  const { fromState, toState, toData } = config.projection;
  const facets = config.plugin as unknown as PluginFacets;
  // A plugin carries the schema facets, so `Store.create` / `Database.create`
  // accept it; the resulting store/db is the projection's `StoreT`/`Db`.
  const makeStore = (): StoreT => Store.create(config.plugin as never) as unknown as StoreT;

  runTransactions<StoreT, State>({
    createStore: makeStore,
    fromState,
    toState,
    initial,
    transitions: config.transitions,
    transactions: config.ops?.transactions ?? facets.transactions,
    match: config.match,
  });

  runActions<Db, StoreT, State>({
    makeDb: (services) => Database.toSystemDatabase(Database.create(config.plugin as never, { services })) as unknown as Db,
    store: (db) => db.store,
    fromState,
    toState,
    initial,
    transitions: config.transitions,
    actions: config.ops?.actions ?? facets.actions,
    match: config.match,
  });

  if (config.computedPlugin) {
    const computedFacets = config.computedPlugin as unknown as PluginFacets;
    runComputeds<Db, StoreT, State>({
      makeDb: () => Database.toSystemDatabase(Database.create(config.computedPlugin as never)) as unknown as Db,
      store: (db) => db.store,
      fromState,
      toData,
      initial,
      derivations: config.transitions,
      computeds: config.ops?.computeds ?? computedFacets.computed,
      hydrate: config.hydrate,
      match: config.match,
    });
  }

  const samples = config.state.samples ?? [];
  if (samples.length > 0) {
    describe("projection round-trips (toState ∘ fromState ≡ identity)", () => {
      samples.forEach((sample, index) => {
        it(`sample ${index}`, () => {
          const store = makeStore();
          fromState(store, sample);
          assert(toState(store), refifyState(sample, store), config.match);
        });
      });
    });
  }
}
