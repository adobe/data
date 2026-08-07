// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data/testing";
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
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// The single conformance test for every ecs transaction. `runTransactions` owns
// the harness (fresh store, `fromState` seed, `toState` compare, coverage guard
// keyed off the registered barrel); the pure half is asserted centrally by
// `data/state/spec.test.ts`. Negotiation resources are addressed by name, not
// entity id, so the `apply` adapters need no `resolve`. `setGameDb` is a
// differently-named transaction whose visible effect equals `State.enterGame`, so
// it wires the `enterGame` cases explicitly (passing `gameDb: null` isolates the
// serializable effect the spec observes).
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  registered: registeredTransactions,
  define: (conforms) => {
    conforms("startHostSignaling", {
      cases: startHostSignalingCases,
      apply: (t) => startHostSignaling(t),
    });
    conforms("startJoinSignaling", {
      cases: startJoinSignalingCases,
      apply: (t) => startJoinSignaling(t),
    });
    conforms("setOfferCode", { cases: setOfferCodeCases, apply: setOfferCode });
    conforms("setAnswerCode", {
      cases: setAnswerCodeCases,
      apply: setAnswerCode,
    });
    conforms("setBanner", { cases: setBannerCases, apply: setBanner });
    conforms("setConnection", {
      cases: setConnectionCases,
      apply: setConnection,
    });
    conforms("setHostAnswerInput", {
      cases: setHostAnswerInputCases,
      apply: setHostAnswerInput,
    });
    conforms("setJoinerOfferInput", {
      cases: setJoinerOfferInputCases,
      apply: setJoinerOfferInput,
    });
    conforms("setGameDb", {
      cases: enterGameCases,
      apply: (t) => setGameDb(t, { gameDb: null }),
    });
  },
});
