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
// returns the seeded entities in `sprites` order, so the i-th `before` sprite
// maps to the i-th entity; an id no sprite carries resolves to `Entity.none`, so
// an id-addressed transaction reads no such entity and is a no-op.
export type ResolveEntity = (specId: number) => Entity;

// The conformance runner, bound to THIS feature's projection (`fromState` /
// `toState`). For each case it proves the one conformance property
//
//   toState(apply(fromState(before), args)) ≡ spec(before, args)
//
// The ecs owns its entity-id space and conforms only up to a renaming of ids,
// which the `after` cases express as `anyNumber`, so the same `expectStateMatches`
// compares both halves.
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
      const bySpecId = new Map(testCase.before.sprites.map((sprite, i) => [sprite.id, entities[i]]));
      const resolve: ResolveEntity = (specId) => bySpecId.get(specId) ?? Entity.none;
      config.apply(store, testCase.args, resolve);
      expectStateMatches(toState(store), testCase.after);
    });
  }
};
