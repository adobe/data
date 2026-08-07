// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Entity } from "../../ecs/entity/entity.js";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { adaptArgs } from "./entity-ref.js";
import { discoverTransitions, discoverOps } from "./discover.js";
import { resolver } from "./resolve.js";

// Discover transitions (the `data/state` glob) and the ecs transactions (a facet
// barrel or a directory glob), pair them by name, and conform each — no per-item
// wiring. A transaction with no same-named transition is infrastructure (e.g.
// `setInput`) or system-dispatched and is skipped; a transition realized by an
// action is conformed there. Entity-addressed args carry a `Conformance.entity`
// marker the runner resolves; a transaction ignores any injected-service arg (its
// effects are asserted through the action).
export interface TransactionRunConfig<Store, State> {
  readonly createStore: () => Store;
  readonly fromState: (store: Store, before: State) => ReadonlyMap<unknown, Entity> | void;
  readonly toState: (store: Store) => State;
  // `import.meta.glob("../../../data/state/*.ts", { eager: true })`.
  readonly transitions: Record<string, Record<string, unknown>>;
  // `import * as transactions from ".../transactions/index.js"`, OR a directory
  // glob when ops live beside a barrel they aren't registered in.
  readonly transactions: Record<string, unknown>;
  // Optional ambient, non-spec context a user-scoped feature needs before the raw
  // transaction runs (e.g. seed the acting peer's `userId`) — the one seam not
  // derivable from cases. Runs after `fromState`, before the transaction.
  readonly seedContext?: (store: Store, before: State, args: unknown) => void;
  readonly match?: MatchOptions;
}

// The single conformance test for every ecs transaction, proving
// `toState(apply(fromState(before), args)) ≡ after` for each shared case.
export function runTransactions<Store, State>(config: TransactionRunConfig<Store, State>): void {
  const transitions = discoverTransitions(config.transitions);
  for (const [name, transaction] of discoverOps(config.transactions)) {
    const paired = transitions.get(name);
    if (!paired) continue; // infrastructure / system-dispatched — no transition to conform to
    describe(`${name} transaction conforms`, () => {
      for (const testCase of paired.cases) {
        it(testCase.name as string, () => {
          const store = config.createStore();
          const resolve = resolver(config.fromState(store, testCase.before as State));
          config.seedContext?.(store, testCase.before as State, testCase.args);
          (transaction as (s: Store, a?: unknown) => void)(store, adaptArgs(testCase.args, resolve));
          assert(config.toState(store), testCase.after, config.match);
        });
      }
    });
  }
}
