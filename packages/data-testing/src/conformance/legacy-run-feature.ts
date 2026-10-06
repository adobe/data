// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { Database, Store } from "@adobe/data/ecs";
import type { MatchOptions } from "../match/match.js";
import { runTransactions } from "./run-transactions.js";
import { runActions } from "./run-actions.js";
import { runComputeds } from "./run-computeds.js";
import { expectAfter } from "./expect-after.js";
import type { Projection } from "./run-feature.js";
import type { SchemaSource } from "./refify.js";

/**
 * @deprecated The runner behind `Conformance.feature`. Each spec transition conforms
 * against the plugin's same-named TRANSACTION and its same-named ACTION, whichever
 * exist. New features use `Conformance.implementation`, which conforms actions only.
 */
export interface LegacyFeatureRunConfig<State, StoreT> {
  readonly state: { create(): State; readonly samples?: readonly State[] };
  // The adapted `{ fn, cases }` map (see `adaptCases`).
  readonly transitions: Record<string, Record<string, unknown>>;
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

// Runtime invariant: a plugin object carries its registered facet maps (see
// `create-plugin.ts`), so this reads the ops directly off it.
type PluginFacets = { transactions: Record<string, unknown>; actions: Record<string, unknown>; computed: Record<string, unknown> };

export function runLegacyFeature<State, StoreT extends SchemaSource, Db extends { store: StoreT }>(
  config: LegacyFeatureRunConfig<State, StoreT>,
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
          // A full-state round-trip: the whole sample is the expectation (no delta),
          // compared up to an id-bijection.
          expectAfter(toState(store), {}, sample as object, store, config.match);
        });
      });
    });
  }
}
