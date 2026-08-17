// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Entity } from "@adobe/data/ecs";
import type { MatchOptions } from "../match/match.js";
import { discoverTransitions, discoverOps } from "./discover.js";
import { expectAfter } from "./expect-after.js";
import type { SchemaSource } from "./refify.js";
import { resolveArgs } from "./resolve-args.js";
import { resolver } from "./resolve.js";

// Discover transitions (the `data/state` glob) and the ecs transactions (a facet
// barrel or a directory glob), pair them by name, and conform each — no per-item
// wiring. A transaction with no same-named transition is infrastructure (e.g.
// `setInput`) or system-dispatched and is skipped; a transition realized by an
// action is conformed there. Entity-addressed args are resolved via the case list's
// `args` schema (its `Entity.schema` fields); a transaction ignores any injected-service arg (its
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
  // The feature's default `State`; each case's `before` is merged over it, so a
  // case names only what differs from the default.
  readonly initial?: State;
  // Optional ambient, non-spec context a user-scoped feature needs before the raw
  // transaction runs (e.g. seed the acting peer's `userId`) — the one seam not
  // derivable from cases. Runs after `fromState`, before the transaction.
  readonly seedContext?: (store: Store, before: State, args: unknown) => void;
  readonly match?: MatchOptions;
}

// The single conformance test for every ecs transaction, proving
// `toState(apply(fromState(before), args)) ≡ after` for each shared case.
export function runTransactions<Store extends SchemaSource, State>(config: TransactionRunConfig<Store, State>): void {
  const transitions = discoverTransitions(config.transitions);
  for (const [name, transaction] of discoverOps(config.transactions)) {
    const paired = transitions.get(name);
    if (!paired) continue; // infrastructure / system-dispatched — no transition to conform to
    describe(`${name} transaction conforms`, () => {
      for (const testCase of paired.cases) {
        it(testCase.name as string, () => {
          // Case `before` is a delta over the feature default.
          const before = { ...(config.initial ?? {}), ...(testCase.before as object) } as State;
          const store = config.createStore();
          const resolve = resolver(config.fromState(store, before));
          config.seedContext?.(store, before, testCase.args);
          // Resolve entity-reference args (the fields the case's `args` schema marks)
          // to the seeded entities; a transition with no such schema passes through.
          const args = resolveArgs(testCase.args, paired.argsSchema, resolve);
          (transaction as (s: Store, a?: unknown) => void)(store, args);
          // `after` is a writes patch, compared up to an id-bijection (the ecs mints
          // its own ids).
          expectAfter(config.toState(store), before as object, testCase.after as object, store, config.match);
        });
      }
    });
  }
}
