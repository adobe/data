// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";

import { cases as startHostSignaling } from "./start-host-signaling.cases.js";
import { cases as startJoinSignaling } from "./start-join-signaling.cases.js";
import { cases as setOfferCode } from "./set-offer-code.cases.js";
import { cases as setAnswerCode } from "./set-answer-code.cases.js";
import { cases as setBanner } from "./set-banner.cases.js";
import { cases as setConnection } from "./set-connection.cases.js";
import { cases as setHostAnswerInput } from "./set-host-answer-input.cases.js";
import { cases as setJoinerOfferInput } from "./set-joiner-offer-input.cases.js";
import { cases as enterGame } from "./enter-game.cases.js";

// The negotiation spec: every transition, one inert cases module each. No injected
// services (signaling is driven by the `connection` service, outside the spec), no
// derivations, no entity references. `ecs/conformance/` pairs it with the ECS build.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  cases: {
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
});
