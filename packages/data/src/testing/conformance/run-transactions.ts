// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Entity } from "../../ecs/entity/entity.js";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { resolver, type Resolve } from "./resolve.js";
import type { Case } from "./types.js";

// Wire one transaction to a transform's shared cases. `apply` receives the seeded
// writable store, the case args, and a `resolve` mapping a spec id to the seeded
// entity — then calls the raw transaction directly.
export type TransactionConforms<Store, State, Id> = <Args>(
  transaction: string,
  config: {
    readonly cases: readonly Case<State, Args>[];
    readonly apply: (store: Store, args: Args, resolve: Resolve<Id>) => void;
  },
) => void;

export interface TransactionRunConfig<Store, State, Id> {
  readonly createStore: () => Store;
  // Seed a fresh store to `before`, returning the `spec id → seeded entity` map.
  readonly fromState: (store: Store, before: State) => ReadonlyMap<Id, Entity>;
  readonly toState: (store: Store) => State;
  // The registered-transactions barrel — the coverage guard requires every key
  // here to be wired, so none can be missed.
  readonly registered: Record<string, unknown>;
  readonly match?: MatchOptions;
  readonly define: (conforms: TransactionConforms<Store, State, Id>) => void;
}

// The single conformance test for every ecs transaction, proving
// `toState(apply(fromState(before), args)) ≡ after` for each shared case (half 1,
// `spec(before,args) ≡ after`, is asserted by `runSpec`). Bespoke `apply`
// adapters stay per-feature (an id-addressed transaction resolves its entity); the
// seed, projection, matching, and coverage guard are all shared here.
export const runTransactions = <Store, State, Id>(config: TransactionRunConfig<Store, State, Id>): void => {
  const covered = new Set<string>();
  const conforms = <Args>(
    transaction: string,
    tconfig: {
      readonly cases: readonly Case<State, Args>[];
      readonly apply: (store: Store, args: Args, resolve: Resolve<Id>) => void;
    },
  ): void => {
    covered.add(transaction);
    describe(`${transaction} transaction conforms`, () => {
      for (const testCase of tconfig.cases) {
        it(testCase.name, () => {
          const store = config.createStore();
          const resolve = resolver(config.fromState(store, testCase.before));
          // A void-arg case omits `args` (see `Case`); reading yields the correct `undefined`.
          const args = (testCase as { readonly args?: Args }).args as Args;
          tconfig.apply(store, args, resolve);
          assert(config.toState(store), testCase.after, config.match);
        });
      }
    });
  };
  config.define(conforms);
  describe("transaction conformance coverage", () => {
    for (const transaction of Object.keys(config.registered)) {
      it(`${transaction} has a conformance case`, () => {
        if (!covered.has(transaction)) throw new Error(`${transaction} has no conformance case`);
      });
    }
  });
};
