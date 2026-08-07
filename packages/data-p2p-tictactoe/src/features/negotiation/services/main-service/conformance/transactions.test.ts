// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectConforms } from "./expect-conforms.js";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { startHostSignaling } from "../transaction-database/transactions/start-host-signaling.js";
import { startJoinSignaling } from "../transaction-database/transactions/start-join-signaling.js";
import { setOfferCode } from "../transaction-database/transactions/set-offer-code.js";
import { setAnswerCode } from "../transaction-database/transactions/set-answer-code.js";
import { setBanner } from "../transaction-database/transactions/set-banner.js";
import { setConnection } from "../transaction-database/transactions/set-connection.js";
import { setHostAnswerInput } from "../transaction-database/transactions/set-host-answer-input.js";
import { setJoinerOfferInput } from "../transaction-database/transactions/set-joiner-offer-input.js";
import { setGameDb } from "../transaction-database/transactions/set-game-db.js";
import { cases as startHostSignalingCases } from "../../../data/state/start-host-signaling.js";
import { cases as startJoinSignalingCases } from "../../../data/state/start-join-signaling.js";
import { cases as setOfferCodeCases } from "../../../data/state/set-offer-code.js";
import { cases as setAnswerCodeCases } from "../../../data/state/set-answer-code.js";
import { cases as setBannerCases } from "../../../data/state/set-banner.js";
import { cases as setConnectionCases } from "../../../data/state/set-connection.js";
import { cases as setHostAnswerInputCases } from "../../../data/state/set-host-answer-input.js";
import { cases as setJoinerOfferInputCases } from "../../../data/state/set-joiner-offer-input.js";
import { cases as enterGameCases } from "../../../data/state/enter-game.js";

// The single conformance test for every ecs transaction. Each transaction's
// shared `data/state` cases run through its raw `apply` (`fromState(before)` →
// apply → `matches(toState, after)`); the pure half is asserted once, centrally,
// by `data/state/spec.test.ts`. The guard at the bottom asserts every REGISTERED
// transaction (the `transactions/index.ts` barrel, not a file glob) is wired
// below, so none can be missed.
const covered = new Set<string>();
const conforms = <Args>(
  transaction: string,
  config: {
    readonly cases: readonly ConformanceCase<Args>[];
    readonly spec?: (before: State, args: Args) => State;
    readonly apply: (t: CoreDatabase.Store, args: Args) => void;
  },
): void => {
  covered.add(transaction);
  describe(`${transaction} transaction conforms`, () => expectConforms(config));
};

conforms("startHostSignaling", { cases: startHostSignalingCases, apply: (t) => startHostSignaling(t) });
conforms("startJoinSignaling", { cases: startJoinSignalingCases, apply: (t) => startJoinSignaling(t) });
conforms("setOfferCode", { cases: setOfferCodeCases, apply: setOfferCode });
conforms("setAnswerCode", { cases: setAnswerCodeCases, apply: setAnswerCode });
conforms("setBanner", { cases: setBannerCases, apply: setBanner });
conforms("setConnection", { cases: setConnectionCases, apply: setConnection });
conforms("setHostAnswerInput", { cases: setHostAnswerInputCases, apply: setHostAnswerInput });
conforms("setJoinerOfferInput", { cases: setJoinerOfferInputCases, apply: setJoinerOfferInput });
// `setGameDb` also stores a non-serializable game-database handle the spec's
// serializable `State` never observes; passing `gameDb: null` isolates its visible
// effect, which equals the differently-named `State.enterGame` transition. Its
// pure half is checked here in place (the shared spec test runs `enterGame`).
conforms("setGameDb", {
  cases: enterGameCases,
  spec: (before) => State.enterGame(before),
  apply: (t) => setGameDb(t, { gameDb: null }),
});

// None-missed guard: every **registered** transaction must be wired above.
describe("transaction conformance coverage", () => {
  for (const transaction of Object.keys(registeredTransactions)) {
    it(`${transaction} has a conformance case`, () => expect(covered.has(transaction)).toBe(true));
  }
});
