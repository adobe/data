// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { splitAndRecordServices, expectEffects } from "../../../data/state/record-effects.js";
import type { RandomService } from "../../random-service/random-service.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import { MainService } from "../main-service.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";
import { fireBullet } from "../action-database/actions/fire-bullet.js";
import { spawnRandomWave } from "../action-database/actions/spawn-random-wave.js";
import { cases as fireBulletCases } from "../../../data/state/fire-bullet.js";
import { cases as spawnRandomWaveCases } from "../../../data/state/spawn-random-wave.js";

// Each transition's cases run against its same-named ecs **action** (the async
// realization), asserting both the resulting state and the declared side effects.
// The case's service args become the db's service overrides — wrapped so their
// calls are recorded — and the plain args drive the action.
// `toSystemDatabase` exposes the writable `.store` the projection needs while
// keeping services/transactions/actions. Runtime invariant: the recording
// wrappers preserve each service's shape, so they are valid factory overrides.
//
// Only the app-facing, single-transaction transitions get an action: `fireBullet`
// (no service) and `spawnRandomWave` (injects the `random` service — a
// value-returning read, so nothing is declared in `effects`). The per-frame step
// transitions (`stepShip`, `step`, …) are realized by the `systems` layer and
// conformed by the tick-loop test, not here.
const makeDb = (services: { random?: RandomService }) =>
  Database.toSystemDatabase(Database.create(MainService.plugin, { services }));
type Db = ReturnType<typeof makeDb>;
type Run = (db: Db) => Promise<void> | void;

const covered = new Set<string>();
const conformsAction = <Args>(
  action: string,
  config: { readonly cases: readonly ConformanceCase<Args>[]; readonly run: Run },
): void => {
  covered.add(action);
  describe(`${action} action conforms`, () => {
    for (const testCase of config.cases) {
      it(testCase.name, async () => {
        const { services, input, calls } = splitAndRecordServices(testCase.args);
        // No action here takes a plain-data arg; assert none crept in.
        expect(Object.keys(input)).toEqual([]);
        const db = makeDb(services as { random?: RandomService });
        fromState(db.store, testCase.before);
        await config.run(db);
        expectStateMatches(toState(db.store), testCase.after);
        expectEffects(calls, testCase.effects);
      });
    }
  });
};

conformsAction("fireBullet", { cases: fireBulletCases, run: (db) => fireBullet(db) });
conformsAction("spawnRandomWave", { cases: spawnRandomWaveCases, run: (db) => spawnRandomWave(db) });

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
