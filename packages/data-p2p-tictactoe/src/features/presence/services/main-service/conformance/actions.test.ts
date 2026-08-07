// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { Database, createRebaseReplayConcurrency } from "@adobe/data/ecs";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { splitAndRecordServices, expectEffects } from "../../../data/state/record-effects.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import { MainService } from "../main-service.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";
import { movePresence } from "../action-database/actions/move-presence.js";
import { cases as movePresenceCases } from "../../../data/state/move-presence.js";

// Each transition's cases run against its same-named ecs **action**, asserting the
// resulting state and any declared side effects. `movePresence`'s peer identity is
// the transaction `userId`, so the db is created with a rebase-replay concurrency
// stamped with the case's `mark` — exactly how the live game database assigns each
// peer its id — then the action commits the plain `{ x, y }` payload.
const makeDb = (userId: string) =>
  Database.toSystemDatabase(Database.create(MainService.plugin, { concurrency: createRebaseReplayConcurrency(userId) }));
type Db = ReturnType<typeof makeDb>;

const covered = new Set<string>();
const conformsAction = <Args extends { mark: string }>(
  action: string,
  config: {
    readonly cases: readonly ConformanceCase<Args>[];
    readonly run: (db: Db, input: Partial<Args>) => Promise<void> | void;
  },
): void => {
  covered.add(action);
  describe(`${action} action conforms`, () => {
    for (const testCase of config.cases) {
      it(testCase.name, async () => {
        const { input, calls } = splitAndRecordServices(testCase.args);
        const db = makeDb(testCase.args.mark);
        fromState(db.store, testCase.before);
        await config.run(db, input as Partial<Args>);
        expectStateMatches(toState(db.store), testCase.after);
        expectEffects(calls, testCase.effects);
      });
    }
  });
};

conformsAction("movePresence", {
  cases: movePresenceCases,
  run: (db, input) => movePresence(db, { x: input.x ?? 0, y: input.y ?? 0 }),
});

// None-missed guard: every data/state **transition** (a file whose `cases` are
// `{ before, args, after }`) must have a same-named action wired above. Iterating
// transitions — not action files — is deliberate: the UI-facing streaming
// `trackPresence` action has no pure-transition analogue and is not conformed here.
const kebabToCamel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
const stateModules = import.meta.glob<Record<string, unknown>>(
  ["../../../data/state/*.ts", "!../../../data/state/*.test.ts"],
  { eager: true },
);
describe("action conformance coverage", () => {
  for (const [path, module] of Object.entries(stateModules)) {
    const cases = module["cases"];
    const isTransition =
      Array.isArray(cases) &&
      cases.length > 0 &&
      typeof cases[0] === "object" &&
      cases[0] !== null &&
      "after" in cases[0];
    if (!isTransition) continue;
    const name = kebabToCamel(path.replace(/.*\//, "").replace(/\.ts$/, ""));
    it(`${name} has an action conformance case`, () => expect(covered.has(name)).toBe(true));
  }
});
