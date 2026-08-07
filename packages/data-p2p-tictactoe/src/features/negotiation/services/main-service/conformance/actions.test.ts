// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import type { ConnectionService } from "../service-database/services/create-connection-service.js";
import { MainService } from "../main-service.js";
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
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Each transition's cases run against its same-named ecs action, asserting state
// and effects. `runActions` splits the case's injected services into recording
// overrides via `makeDb`; negotiation transitions inject none, so the override is
// empty. The registered set the coverage guard checks is the transition-backed
// actions below — NOT the `actions` barrel, whose members are capability
// orchestration verbs (`startHost`, `submitAnswer`, …) with no pure-transition
// analogue that are not conformed here.
Conformance.runActions({
  // `toSystemDatabase` exposes the writable `.store` the projection needs. Runtime
  // invariant: negotiation transitions inject no services, so the empty override
  // object is a valid partial `services` factory map.
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, {
        services: services as { connection?: ConnectionService },
      }),
    ),
  store: (db) => db.store,
  fromState,
  toState,
  registered: {
    startHostSignaling,
    startJoinSignaling,
    setOfferCode,
    setAnswerCode,
    setBanner,
    setConnection,
    setHostAnswerInput,
    setJoinerOfferInput,
    enterGame,
  },
  define: (conforms) => {
    conforms("startHostSignaling", {
      cases: startHostSignalingCases,
      run: (db) => startHostSignaling(db),
    });
    conforms("startJoinSignaling", {
      cases: startJoinSignalingCases,
      run: (db) => startJoinSignaling(db),
    });
    conforms("setOfferCode", {
      cases: setOfferCodeCases,
      run: (db, input) => setOfferCode(db, { code: input.code ?? "" }),
    });
    conforms("setAnswerCode", {
      cases: setAnswerCodeCases,
      run: (db, input) => setAnswerCode(db, { code: input.code ?? "" }),
    });
    conforms("setBanner", {
      cases: setBannerCases,
      run: (db, input) =>
        setBanner(db, { text: input.text ?? "", error: input.error }),
    });
    conforms("setConnection", {
      cases: setConnectionCases,
      run: (db, input) =>
        setConnection(db, {
          connection: input.connection ?? "idle",
          sessionId: input.sessionId,
        }),
    });
    conforms("setHostAnswerInput", {
      cases: setHostAnswerInputCases,
      run: (db, input) => setHostAnswerInput(db, { value: input.value ?? "" }),
    });
    conforms("setJoinerOfferInput", {
      cases: setJoinerOfferInputCases,
      run: (db, input) => setJoinerOfferInput(db, { value: input.value ?? "" }),
    });
    conforms("enterGame", {
      cases: enterGameCases,
      run: (db) => enterGame(db),
    });
  },
});
