// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Entity } from "../../ecs/entity/entity.js";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { splitAndRecordServices, expectEffects } from "./record-effects.js";
import { resolver, type Resolve } from "./resolve.js";
import type { Case } from "./types.js";

// Wire one action to a transition's shared cases. The case's service args become
// the db's recording service overrides (via `makeDb`), the plain args drive the
// action through `run`, and both the resulting state AND the declared effects are
// asserted.
export type ActionConforms<Db, State, Id> = <Args>(
  action: string,
  config: {
    readonly cases: readonly Case<State, Args>[];
    readonly run: (db: Db, input: Partial<Args>, resolve: Resolve<Id>) => Promise<void> | void;
  },
) => void;

export interface ActionRunConfig<Db, Store, State, Id> {
  // Build a db with the given (recording) service overrides — typically
  // `Database.toSystemDatabase(Database.create(MainService.plugin, { services }))`.
  readonly makeDb: (services: Record<string, object>) => Db;
  // The writable store exposed by that db (usually `(db) => db.store`).
  readonly store: (db: Db) => Store;
  readonly fromState: (store: Store, before: State) => ReadonlyMap<Id, Entity> | void;
  readonly toState: (store: Store) => State;
  // The registered-actions barrel — coverage requires every key wired.
  readonly registered: Record<string, unknown>;
  readonly match?: MatchOptions;
  readonly define: (conforms: ActionConforms<Db, State, Id>) => void;
}

// The single conformance test for every ecs action: each transition's cases run
// against its same-named async action, asserting state and effects. Transitions
// realized only by a transaction (not an action) are covered by `runTransactions`.
export const runActions = <Db, Store, State, Id>(config: ActionRunConfig<Db, Store, State, Id>): void => {
  const covered = new Set<string>();
  const conforms = <Args>(
    action: string,
    aconfig: {
      readonly cases: readonly Case<State, Args>[];
      readonly run: (db: Db, input: Partial<Args>, resolve: Resolve<Id>) => Promise<void> | void;
    },
  ): void => {
    covered.add(action);
    describe(`${action} action conforms`, () => {
      for (const testCase of aconfig.cases) {
        it(testCase.name, async () => {
          // A void-arg case omits `args` (see `Case`); split yields empty maps.
          const args = (testCase as { readonly args?: Args }).args as Args;
          const { services, input, calls } = splitAndRecordServices(args);
          const db = config.makeDb(services);
          const resolve = resolver(config.fromState(config.store(db), testCase.before));
          await aconfig.run(db, input as Partial<Args>, resolve);
          assert(config.toState(config.store(db)), testCase.after, config.match);
          expectEffects(calls, (testCase as { readonly effects?: never }).effects);
        });
      }
    });
  };
  config.define(conforms);
  describe("action conformance coverage", () => {
    for (const action of Object.keys(config.registered)) {
      it(`${action} has a conformance case`, () => {
        if (!covered.has(action)) throw new Error(`${action} has no conformance case`);
      });
    }
  });
};
