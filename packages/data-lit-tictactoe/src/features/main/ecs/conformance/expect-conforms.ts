// © 2026 Adobe. MIT License. See /LICENSE for details.
import { it } from "vitest";
import type { State } from "../../data/state/state.js";
import type { ConformanceCase } from "../../data/state/conformance-case.js";
import { expectStateMatches } from "../../data/state/expect-state-matches.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

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
// `apply` receives the seeded writable store and calls the raw transaction
// function directly (a transaction is `(store, args) => void`, so no `Database`
// is involved). tictactoe's transactions take plain data args (a board index,
// or nothing), so no entity resolution is needed in `apply`. Entity collections
// compare as multisets; scalars and resources exactly (see `expectStateMatches`).
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
