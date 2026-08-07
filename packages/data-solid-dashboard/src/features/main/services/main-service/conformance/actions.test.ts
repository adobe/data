// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { splitAndRecordServices, expectEffects } from "../../../data/state/record-effects.js";
import { MainService } from "../main-service.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import { increment } from "../action-database/actions/increment.js";
import { decrement } from "../action-database/actions/decrement.js";
import { reset } from "../action-database/actions/reset.js";
import { setUserName } from "../action-database/actions/set-user-name.js";
import { clearLog } from "../action-database/actions/clear-log.js";
import { cases as incrementCases } from "../../../data/state/increment.js";
import { cases as decrementCases } from "../../../data/state/decrement.js";
import { cases as resetCases } from "../../../data/state/reset.js";
import { cases as setUserNameCases } from "../../../data/state/set-user-name.js";
import { cases as clearLogCases } from "../../../data/state/clear-log.js";

// Each transition's cases run against its same-named ecs **action** (the async
// app-facing realization). The case's service args become the db's service
// overrides (wrapped so their calls are recorded), the plain args drive the
// action, and we assert both the resulting state and the declared side effects.
// This feature injects no services, so every case's `effects` is empty and the
// split yields no overrides — but the runner keeps the general shape.
// `toSystemDatabase` exposes the writable `.store` the projection needs while
// keeping transactions/actions.
const makeDb = (services: Record<string, object>) =>
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
        const db = makeDb(services);
        fromState(db.store, testCase.before);
        await config.run(db, input as Partial<Args>);
        expectStateMatches(toState(db.store), testCase.after);
        expectEffects(calls, testCase.effects);
      });
    }
  });
};

conformsAction("increment", { cases: incrementCases, run: (db) => increment(db) });
conformsAction("decrement", { cases: decrementCases, run: (db) => decrement(db) });
conformsAction("reset", { cases: resetCases, run: (db) => reset(db) });
conformsAction("setUserName", {
  cases: setUserNameCases,
  run: (db, input) => setUserName(db, { name: input.name ?? "" }),
});
conformsAction("clearLog", { cases: clearLogCases, run: (db) => clearLog(db) });

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
