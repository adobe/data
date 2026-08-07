// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Entity } from "../../ecs/entity/entity.js";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { adaptArgs } from "./entity-ref.js";
import { discoverTransitions, discoverOps } from "./discover.js";
import { splitAndRecordServices, expectEffects } from "./record-effects.js";
import { resolver } from "./resolve.js";

// Discover transitions and the ecs actions (a facet barrel or a directory glob),
// pair by name, and conform each — no per-item wiring. The action is the app-facing
// seam: its injected services come from `db.services` (the case's service args
// become recording overrides via `makeDb`), and its plain args are the case args
// with service fields removed and `entity(specId)` markers resolved. Both the
// resulting state and the declared `effects` are asserted. An action with no
// same-named transition (e.g. a streaming port) is skipped.
export interface ActionRunConfig<Db, Store, State> {
  readonly makeDb: (services: Record<string, object>) => Db;
  readonly store: (db: Db) => Store;
  readonly fromState: (store: Store, before: State) => ReadonlyMap<unknown, Entity> | void;
  readonly toState: (store: Store) => State;
  readonly transitions: Record<string, Record<string, unknown>>;
  readonly actions: Record<string, unknown>;
  // Optional ambient, non-spec context a user-scoped feature needs before dispatch
  // (e.g. the acting peer's `userId`) — the one seam not derivable from cases.
  readonly seedContext?: (db: Db, before: State, args: unknown) => void;
  readonly match?: MatchOptions;
}

// The single conformance test for every ecs action: each transition's cases run
// against its same-named action, asserting state and the declared effects.
export function runActions<Db, Store, State>(config: ActionRunConfig<Db, Store, State>): void {
  const transitions = discoverTransitions(config.transitions);
  for (const [name, action] of discoverOps(config.actions)) {
    const paired = transitions.get(name);
    if (!paired) continue; // action with no transition (e.g. a streaming port) — not conformed here
    describe(`${name} action conforms`, () => {
      for (const testCase of paired.cases) {
        it(testCase.name as string, async () => {
          const { services, input, calls } = splitAndRecordServices(testCase.args);
          const db = config.makeDb(services);
          const resolve = resolver(config.fromState(config.store(db), testCase.before as State));
          config.seedContext?.(db, testCase.before as State, testCase.args);
          await (action as (d: Db, a?: unknown) => Promise<void> | void)(db, adaptArgs(input, resolve));
          assert(config.toState(config.store(db)), testCase.after, config.match);
          expectEffects(calls, testCase.effects as never);
        });
      }
    });
  }
}
