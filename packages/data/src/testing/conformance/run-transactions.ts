// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Entity } from "../../ecs/entity/entity.js";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { adaptArgs } from "./entity-ref.js";
import { discoverTransitions } from "./discover.js";
import { resolver, type Resolve } from "./resolve.js";
import type { Case } from "./types.js";

// Auto-pairing config: discover transitions (from the `data/state` glob) and the
// registered transactions (the facet barrel), pair by name, and conform each —
// no per-item wiring. A transaction with no same-named transition is
// infrastructure (e.g. `setInput`) and is skipped; a transition realized by an
// action or a system is conformed there. Entity-addressed args carry a
// `Conformance.entity(specId)` marker the runner resolves; a transaction ignores
// any injected-service arg (its effects are asserted through the action).
export interface TransactionRunConfig<Store, State> {
  readonly createStore: () => Store;
  readonly fromState: (store: Store, before: State) => ReadonlyMap<unknown, Entity> | void;
  readonly toState: (store: Store) => State;
  // `import.meta.glob("../../../data/state/*.ts", { eager: true })`.
  readonly transitions: Record<string, Record<string, unknown>>;
  // `import * as transactions from "../transaction-database/transactions/index.js"`.
  readonly transactions: Record<string, unknown>;
  readonly match?: MatchOptions;
}

// Legacy explicit-wiring config (being retired as samples move to auto-pairing).
export type TransactionConforms<Store, State, Id> = <Args>(
  transaction: string,
  config: {
    readonly cases: readonly Case<State, Args>[];
    readonly apply: (store: Store, args: Args, resolve: Resolve<Id>) => void;
  },
) => void;
export interface TransactionDefineConfig<Store, State, Id> {
  readonly createStore: () => Store;
  readonly fromState: (store: Store, before: State) => ReadonlyMap<Id, Entity> | void;
  readonly toState: (store: Store) => State;
  readonly registered: Record<string, unknown>;
  readonly covers?: readonly string[];
  readonly match?: MatchOptions;
  readonly define: (conforms: TransactionConforms<Store, State, Id>) => void;
}

// The single conformance test for every ecs transaction, proving
// `toState(apply(fromState(before), args)) ≡ after` for each shared case.
export function runTransactions<Store, State>(config: TransactionRunConfig<Store, State>): void;
export function runTransactions<Store, State, Id>(config: TransactionDefineConfig<Store, State, Id>): void;
export function runTransactions<Store, State, Id>(
  config: TransactionRunConfig<Store, State> | TransactionDefineConfig<Store, State, Id>,
): void {
  if ("transitions" in config) {
    const transitions = discoverTransitions(config.transitions);
    for (const [name, transaction] of Object.entries(config.transactions)) {
      if (typeof transaction !== "function") continue;
      const paired = transitions.get(name);
      if (!paired) continue; // infrastructure transaction — no transition to conform to
      describe(`${name} transaction conforms`, () => {
        for (const testCase of paired.cases) {
          it(testCase.name as string, () => {
            const store = config.createStore();
            const resolve = resolver(config.fromState(store, testCase.before as State));
            (transaction as (s: Store, a?: unknown) => void)(store, adaptArgs(testCase.args, resolve));
            assert(config.toState(store), testCase.after, config.match);
          });
        }
      });
    }
    return;
  }

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
          const args = (testCase as { readonly args?: Args }).args as Args;
          tconfig.apply(store, args, resolve);
          assert(config.toState(store), testCase.after, config.match);
        });
      }
    });
  };
  config.define(conforms);
  for (const transaction of config.covers ?? []) covered.add(transaction);
  describe("transaction conformance coverage", () => {
    for (const transaction of Object.keys(config.registered)) {
      it(`${transaction} has a conformance case`, () => {
        if (!covered.has(transaction)) throw new Error(`${transaction} has no conformance case`);
      });
    }
  });
}
