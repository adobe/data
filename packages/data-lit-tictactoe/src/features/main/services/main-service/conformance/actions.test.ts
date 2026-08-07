// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { splitAndRecordServices, expectEffects } from "../../../data/state/record-effects.js";
import type { OpponentService } from "../../opponent-service/opponent-service.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import { MainService } from "../main-service.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";
import { playMove } from "../action-database/actions/play-move.js";
import { playOpponentMove } from "../action-database/actions/play-opponent-move.js";
import { restartGame } from "../action-database/actions/restart-game.js";
import { cases as playMoveCases } from "../../../data/state/play-move.js";
import { cases as playOpponentMoveCases } from "../../../data/state/play-opponent-move.js";
import { cases as restartGameCases } from "../../../data/state/restart-game.js";

// Each transition's cases run against its same-named ecs **action** (the async
// realization), asserting both the resulting state and the declared side effects.
// The case's service args become the db's service overrides — wrapped so their
// calls are recorded — and the plain args drive the action.
// `toSystemDatabase` exposes the writable `.store` the projection needs while
// keeping services/transactions/actions. Runtime invariant: the recording
// wrappers preserve each service's shape, so they are valid factory overrides.
const makeDb = (services: { opponent?: OpponentService }) =>
  Database.toSystemDatabase(Database.create(MainService.plugin, { services }));
type Db = ReturnType<typeof makeDb>;
type Run<Args> = (db: Db, input: Args) => Promise<void> | void;

const covered = new Set<string>();
const conformsAction = <Args>(
  action: string,
  config: { readonly cases: readonly ConformanceCase<Args>[]; readonly run: Run<Partial<Args>> },
): void => {
  covered.add(action);
  describe(`${action} action conforms`, () => {
    for (const testCase of config.cases) {
      it(testCase.name, async () => {
        const { services, input, calls } = splitAndRecordServices(testCase.args);
        const db = makeDb(services as { opponent?: OpponentService });
        fromState(db.store, testCase.before);
        await config.run(db, input as Partial<Args>);
        expectStateMatches(toState(db.store), testCase.after);
        expectEffects(calls, testCase.effects);
      });
    }
  });
};

conformsAction("playMove", {
  cases: playMoveCases,
  run: (db, input) => playMove(db, { index: input.index ?? -1 }),
});
conformsAction("playOpponentMove", {
  cases: playOpponentMoveCases,
  run: (db) => playOpponentMove(db),
});
conformsAction("restartGame", { cases: restartGameCases, run: (db) => restartGame(db) });

// None-missed guard: every action file must be wired above.
const kebabToCamel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
describe("action conformance coverage", () => {
  const files = import.meta.glob([
    "../action-database/actions/*.ts",
    "!../action-database/actions/index.ts",
  ]);
  for (const path of Object.keys(files)) {
    const action = kebabToCamel(path.replace(/.*\//, "").replace(/\.ts$/, ""));
    it(`${action} has a conformance case`, () => expect(covered.has(action)).toBe(true));
  }
});
