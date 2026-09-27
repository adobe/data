// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformed functions of this feature — every pure transform the spec verifies,
// and nothing else (`create`/`samples` are deliberately absent). Its keys ARE the
// conformance surface: `Conformance.feature`'s coverage guard requires exactly one
// `*.cases.ts` module per key here, so adding a transform without cases — or cases
// without a transform — fails to compile.
export { startHostSignaling } from "./start-host-signaling.js";
export { startJoinSignaling } from "./start-join-signaling.js";
export { setOfferCode } from "./set-offer-code.js";
export { setAnswerCode } from "./set-answer-code.js";
export { setBanner } from "./set-banner.js";
export { setConnection } from "./set-connection.js";
export { setHostAnswerInput } from "./set-host-answer-input.js";
export { setJoinerOfferInput } from "./set-joiner-offer-input.js";
export { enterGame } from "./enter-game.js";
