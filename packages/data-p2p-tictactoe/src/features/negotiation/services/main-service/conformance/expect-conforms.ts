// © 2026 Adobe. MIT License. See /LICENSE for details.
import { it } from "vitest";
import type { State } from "../../../data/state/state.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// The conformance runner, bound to the negotiation projection (`fromState` /
// `toState`). For each case it proves the one conformance property
//
//   toState(apply(fromState(before), args)) ≡ spec(before, args)
//
// The pure half (`spec(before, args) ≡ after`) is asserted once, centrally, by
// `data/state/spec.test.ts`, so this runner asserts only the ecs half; pass `spec`
// to re-check it in place for a differently-named transaction.
export const expectConforms = <Args>(config: {
  readonly cases: readonly ConformanceCase<Args>[];
  readonly spec?: (before: State, args: Args) => State;
  readonly apply: (store: CoreDatabase.Store, args: Args) => void;
}): void => {
  for (const testCase of config.cases) {
    it(testCase.name, () => {
      if (config.spec) {
        expectStateMatches(config.spec(testCase.before, testCase.args), testCase.after);
      }

      const store = createStore();
      fromState(store, testCase.before);
      config.apply(store, testCase.args);
      expectStateMatches(toState(store), testCase.after);
    });
  }
};
