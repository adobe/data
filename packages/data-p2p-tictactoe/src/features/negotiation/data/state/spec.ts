// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { projection } from "../../services/main-service/conformance/projection.js";

import { cases as startHostSignaling } from "./start-host-signaling.cases.js";
import { cases as startJoinSignaling } from "./start-join-signaling.cases.js";
import { cases as setOfferCode } from "./set-offer-code.cases.js";
import { cases as setAnswerCode } from "./set-answer-code.cases.js";
import { cases as setBanner } from "./set-banner.cases.js";
import { cases as setConnection } from "./set-connection.cases.js";
import { cases as setHostAnswerInput } from "./set-host-answer-input.cases.js";
import { cases as setJoinerOfferInput } from "./set-joiner-offer-input.cases.js";
import { cases as enterGame } from "./enter-game.cases.js";

// The negotiation conformance manifest — the single object `spec.test.ts` (pure) and
// `conformance.test.ts` (ecs) both import. No services (none of the pure transitions
// inject one — the signaling capability is driven imperatively from the connection
// service, not from a conformed transition), and no derivations (no `computedPlugin`/
// `hydrate`). Negotiation's per-transition actions are deliberately kept OUT of the
// plugin's `actions` facet (registering them would grow the composed database's type
// past tsc's instantiation budget), so they are supplied to `checkFeature` via the
// `ops.actions` directory glob rather than discovered off `plugin.actions`.
//
// A test-tier module (excluded from the runtime build) — the one place the feature
// touches `@adobe/data-testing`.
export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  projection,
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
  ops: {
    actions: import.meta.glob(
      ["../../services/main-service/action-database/actions/*.ts", "!**/index.ts"],
      { eager: true },
    ),
  },
});
