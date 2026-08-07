// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { splitAndRecordServices, expectEffects } from "../../../data/state/record-effects.js";
import type { ConnectionService } from "../service-database/services/create-connection-service.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import { MainService } from "../main-service.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";
import { startHostSignaling } from "../action-database/actions/start-host-signaling.js";
import { startJoinSignaling } from "../action-database/actions/start-join-signaling.js";
import { setOfferCode } from "../action-database/actions/set-offer-code.js";
import { setAnswerCode } from "../action-database/actions/set-answer-code.js";
import { setBanner } from "../action-database/actions/set-banner.js";
import { setConnection } from "../action-database/actions/set-connection.js";
import { setHostAnswerInput } from "../action-database/actions/set-host-answer-input.js";
import { setJoinerOfferInput } from "../action-database/actions/set-joiner-offer-input.js";
import { enterGame } from "../action-database/actions/enter-game.js";
import { cases as startHostSignalingCases } from "../../../data/state/start-host-signaling.js";
import { cases as startJoinSignalingCases } from "../../../data/state/start-join-signaling.js";
import { cases as setOfferCodeCases } from "../../../data/state/set-offer-code.js";
import { cases as setAnswerCodeCases } from "../../../data/state/set-answer-code.js";
import { cases as setBannerCases } from "../../../data/state/set-banner.js";
import { cases as setConnectionCases } from "../../../data/state/set-connection.js";
import { cases as setHostAnswerInputCases } from "../../../data/state/set-host-answer-input.js";
import { cases as setJoinerOfferInputCases } from "../../../data/state/set-joiner-offer-input.js";
import { cases as enterGameCases } from "../../../data/state/enter-game.js";

// Each transition's cases run against its same-named ecs **action**, asserting both
// the resulting state and the declared side effects. The case's service args become
// the db's service overrides (wrapped so their calls are recorded); the plain args
// drive the action. `toSystemDatabase` exposes the writable `.store` the projection
// needs while keeping services/transactions/actions. Runtime invariant: the empty
// override object is a valid partial `services` factory map.
const makeDb = (services: { connection?: ConnectionService }) =>
  Database.toSystemDatabase(Database.create(MainService.plugin, { services }));
type Db = ReturnType<typeof makeDb>;
type Run<Args> = (db: Db, input: Partial<Args>) => Promise<void> | void;

const covered = new Set<string>();
const conformsAction = <Args>(
  action: string,
  config: { readonly cases: readonly ConformanceCase<Args>[]; readonly run: Run<Args> },
): void => {
  covered.add(action);
  describe(`${action} action conforms`, () => {
    for (const testCase of config.cases) {
      it(testCase.name, async () => {
        const { services, input, calls } = splitAndRecordServices(testCase.args);
        // Runtime invariant: negotiation transitions inject no services, so the
        // recorded overrides are the empty connection-service partial.
        const db = makeDb(services as { connection?: ConnectionService });
        fromState(db.store, testCase.before);
        await config.run(db, input as Partial<Args>);
        expectStateMatches(toState(db.store), testCase.after);
        expectEffects(calls, testCase.effects);
      });
    }
  });
};

conformsAction("startHostSignaling", { cases: startHostSignalingCases, run: (db) => startHostSignaling(db) });
conformsAction("startJoinSignaling", { cases: startJoinSignalingCases, run: (db) => startJoinSignaling(db) });
conformsAction("setOfferCode", { cases: setOfferCodeCases, run: (db, input) => setOfferCode(db, { code: input.code ?? "" }) });
conformsAction("setAnswerCode", { cases: setAnswerCodeCases, run: (db, input) => setAnswerCode(db, { code: input.code ?? "" }) });
conformsAction("setBanner", { cases: setBannerCases, run: (db, input) => setBanner(db, { text: input.text ?? "", error: input.error }) });
conformsAction("setConnection", {
  cases: setConnectionCases,
  run: (db, input) => setConnection(db, { connection: input.connection ?? "idle", sessionId: input.sessionId }),
});
conformsAction("setHostAnswerInput", { cases: setHostAnswerInputCases, run: (db, input) => setHostAnswerInput(db, { value: input.value ?? "" }) });
conformsAction("setJoinerOfferInput", { cases: setJoinerOfferInputCases, run: (db, input) => setJoinerOfferInput(db, { value: input.value ?? "" }) });
conformsAction("enterGame", { cases: enterGameCases, run: (db) => enterGame(db) });

// None-missed guard: every data/state **transition** (a file whose `cases` are
// `{ before, args, after }`) must have a same-named action wired above. Iterating
// the transitions — not the action files — is deliberate: the capability
// orchestration actions (`startHost`, `submitAnswer`, …) drive the imperative
// `connection` service and have no pure-transition analogue, so they are not
// conformance-tested here.
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
