// © 2026 Adobe. MIT License. See /LICENSE for details.
import { it } from "vitest";
import { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Resolve a spec domain `id` to the ecs entity seeded for it. `fromState`
// returns the seeded entities in display order, so the i-th `before` todo maps
// to the i-th entity; an id no todo carries resolves to `Entity.none`, so an
// id-addressed transaction reads no such entity and is a no-op.
export type ResolveEntity = (specId: number) => Entity;

// The conformance runner, bound to THIS feature's projection (`fromState` /
// `toState`). For each case it proves the one conformance property
//
//   toState(apply(fromState(before), args)) ≡ spec(before, args)
//
// in two asserted halves:
//   1. `spec(before, args) ≡ after` — keeps the shared case honest (a
//      mis-authored `after` is caught here, independent of the ecs path).
//   2. seed `fromState(before)` → run the caller's `apply` → `toState ≡ after`
//      — the ecs implementation reproduces the pure transform.
//
// `apply` receives the seeded writable store, the case args, and a `resolve`
// that maps a spec `id` to the seeded entity, then calls the raw transaction
// function directly (a transaction is `(store, …) => void`, so no `Database`
// is involved). The `after` authors ids as `anyNumber`, so the same
// `expectStateMatches` compares both halves — the ecs owns its entity-id space
// and conforms only up to a renaming of ids, which the matcher expresses.
export const expectConforms = <Args>(config: {
  readonly cases: readonly ConformanceCase<Args>[];
  // Optional: half 1 (spec(before,args) ≡ after) is already asserted for every
  // case by `data/state/spec.test.ts`, so the conformance aggregator omits it and
  // this runner asserts only the ecs half. Pass `spec` to re-check it in place.
  readonly spec?: (before: State, args: Args) => State;
  readonly apply: (store: CoreDatabase.Store, args: Args, resolve: ResolveEntity) => void;
}): void => {
  for (const testCase of config.cases) {
    it(testCase.name, () => {
      if (config.spec) {
        expectStateMatches(config.spec(testCase.before, testCase.args), testCase.after);
      }

      const store = createStore();
      const entities = fromState(store, testCase.before);
      const bySpecId = new Map(testCase.before.todos.map((todo, i) => [todo.id, entities[i]]));
      const resolve: ResolveEntity = (specId) => bySpecId.get(specId) ?? Entity.none;
      config.apply(store, testCase.args, resolve);
      expectStateMatches(toState(store), testCase.after);
    });
  }
};
