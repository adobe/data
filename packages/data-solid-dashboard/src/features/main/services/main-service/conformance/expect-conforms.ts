// © 2026 Adobe. MIT License. See /LICENSE for details.
import { it } from "vitest";
import type { State } from "../../../data/state/state.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// The conformance runner, bound to this feature's projection (`fromState` /
// `toState`). For each case it proves the one conformance property
//
//   toState(apply(fromState(before), args)) ≡ spec(before, args)
//
// in two asserted halves:
//   1. `spec(before, args) ≡ after` — keeps the shared case honest, independent
//      of the ecs path.
//   2. seed `fromState(before)` → run the caller's `apply` → `toState ≡ after`
//      — the ecs transaction reproduces the pure transform.
//
// `apply` receives the seeded writable store and the case args, then calls the
// raw transaction function directly (a transaction is `(store, …) => void`, so
// no `Database` is involved). This feature holds only scalar resources, so the
// projection is id-free and the comparison is strict on both halves.
export const expectConforms = <Args>(config: {
  readonly cases: readonly ConformanceCase<Args>[];
  readonly spec: (before: State, args: Args) => State;
  readonly apply: (store: CoreDatabase.Store, args: Args) => void;
}): void => {
  for (const testCase of config.cases) {
    it(testCase.name, () => {
      expectStateMatches(config.spec(testCase.before, testCase.args), testCase.after);

      const store = createStore();
      fromState(store, testCase.before);
      config.apply(store, testCase.args);
      expectStateMatches(toState(store), testCase.after);
    });
  }
};
