// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { Database, Store } from "@adobe/data/ecs";
import type { Entity } from "@adobe/data/ecs";
import type { MatchOptions } from "../match/match.js";
import { runTransactions } from "./run-transactions.js";
import { runActions } from "./run-actions.js";
import { runComputeds } from "./run-computeds.js";
import { expectAfter } from "./expect-after.js";
import { discoverTransitions, discoverDerivations, discoverOps } from "./discover.js";
import type { SchemaSource } from "./refify.js";

// The feature's ecs↔`State` projection — the one genuinely feature-specific piece.
export interface Projection<Store, State> {
  readonly fromState: (store: Store, state: State) => ReadonlyMap<unknown, Entity> | void;
  readonly toState: (store: Store) => State;
  readonly toData?: (store: Store, entity: Entity) => unknown;
}

// One call conforms a whole feature. The runner pulls the ops off the plugin's
// registered facets (`plugin.actions` / `plugin.transactions` /
// `computedPlugin.computed`) and constructs the stores/dbs itself. Each spec
// transition conforms against the plugin's same-named ACTION — the spec describes
// actions, and transactions are an implementation detail they cover. A transition
// with no action but a same-named transaction (a system-dispatched step) conforms
// against that transaction instead. A spec op with no implementation at all is a
// named failure. It also round-trips `State.samples` through the projection.
//
// A feature that needs ambient per-case context (a user-scoped `userId`) uses the
// lower-level `runTransactions`/`runActions`/`runComputeds` directly instead.
export interface FeatureRunConfig<State, StoreT, Db extends { store: StoreT }> {
  // The `State` namespace: `create()` is the default seed each case's `before`
  // deltas over; `samples` (optional) are representative full states for the
  // projection round-trip.
  readonly state: { create(): State; readonly samples?: readonly State[] };
  // The adapted `{ fn, cases }` map (see `adaptCases`).
  readonly transitions: Record<string, Record<string, unknown>>;
  // The assembled feature plugin (`MainService.plugin`) — its `.actions` and
  // `.transactions` facets are the ops, and it builds the transaction store + action db.
  readonly plugin: Database.Plugin;
  // The `ComputedDatabase` layer plugin — its `.computed` facet is the ops, built
  // from this layer for seed-freshness. Omit when the feature has no derivations.
  readonly computedPlugin?: Database.Plugin;
  readonly projection: Projection<StoreT, State>;
  // Names of computeds that emit an entity-id list (hydrated through `toData`).
  readonly hydrate?: readonly string[];
  // Base service factories injected into every db (fakes for services whose factory
  // throws to require injection); per-case recording doubles override them.
  readonly services?: Readonly<Record<string, () => object>>;
  readonly match?: MatchOptions;
  // Override the ops discovered from the plugin facets.
  readonly ops?: {
    readonly transactions?: Record<string, unknown>;
    readonly actions?: Record<string, unknown>;
    readonly computeds?: Record<string, unknown>;
  };
}

// Runtime invariant: a plugin object carries its registered facet maps (see
// `create-plugin.ts`), so this reads the ops directly off it.
type PluginFacets = { transactions: Record<string, unknown>; actions: Record<string, unknown>; computed: Record<string, unknown> };

const pick = (source: ReadonlyMap<string, unknown>, names: ReadonlySet<string>): Record<string, unknown> =>
  Object.fromEntries([...source].filter(([name]) => names.has(name)));

export function runFeature<State, StoreT extends SchemaSource, Db extends { store: StoreT }>(
  config: FeatureRunConfig<State, StoreT, Db>,
): void {
  const initial = config.state.create();
  const { fromState, toState, toData } = config.projection;
  const facets = config.plugin as unknown as PluginFacets;
  const computedFacets = config.computedPlugin as unknown as PluginFacets | undefined;
  // A plugin carries the schema facets, so `Store.create` / `Database.create`
  // accept it; the resulting store/db is the projection's `StoreT`/`Db`.
  const makeStore = (): StoreT => Store.create(config.plugin as never) as unknown as StoreT;
  const baseServices = (): Record<string, object> =>
    Object.fromEntries(Object.entries(config.services ?? {}).map(([name, create]) => [name, create()]));

  const transitions = discoverTransitions(config.transitions);
  const derivations = discoverDerivations(config.transitions);
  const actions = discoverOps(config.ops?.actions ?? facets.actions);
  const transactions = discoverOps(config.ops?.transactions ?? facets.transactions);
  const computeds = discoverOps(config.ops?.computeds ?? computedFacets?.computed ?? {});

  const byAction = new Set([...transitions.keys()].filter((name) => actions.has(name)));
  const byTransaction = new Set([...transitions.keys()].filter((name) => !actions.has(name) && transactions.has(name)));
  const missing = [
    ...[...transitions.keys()].filter((name) => !byAction.has(name) && !byTransaction.has(name)),
    ...[...derivations.keys()].filter((name) => !computeds.has(name)),
  ];

  if (missing.length > 0) {
    describe("every spec op has an implementation", () => {
      for (const name of missing) {
        it(name, () => {
          throw new Error(`spec op "${name}" has no same-named action, transaction or computed`);
        });
      }
    });
  }

  runTransactions<StoreT, State>({
    createStore: makeStore,
    fromState,
    toState,
    initial,
    transitions: config.transitions,
    transactions: pick(transactions, byTransaction),
    match: config.match,
  });

  runActions<Db, StoreT, State>({
    makeDb: (services) =>
      Database.toSystemDatabase(
        Database.create(config.plugin as never, { services: { ...baseServices(), ...services } }),
      ) as unknown as Db,
    store: (db) => db.store,
    fromState,
    toState,
    initial,
    transitions: config.transitions,
    actions: pick(actions, byAction),
    match: config.match,
  });

  if (config.computedPlugin) {
    runComputeds<Db, StoreT, State>({
      makeDb: () =>
        Database.toSystemDatabase(
          Database.create(config.computedPlugin as never, { services: baseServices() }),
        ) as unknown as Db,
      store: (db) => db.store,
      fromState,
      toData,
      initial,
      derivations: config.transitions,
      computeds: Object.fromEntries(computeds),
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
          // A full-state round-trip: the whole sample is the expectation (no delta),
          // compared up to an id-bijection.
          expectAfter(toState(store), {}, sample as object, store, config.match);
        });
      });
    });
  }
}
