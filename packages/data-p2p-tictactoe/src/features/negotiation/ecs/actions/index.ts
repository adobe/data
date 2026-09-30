// © 2026 Adobe. MIT License. See /LICENSE for details.
// Orchestration verbs: delegate to the imperative `connection` service.
export * from "./start-host.js";
export * from "./start-join.js";
export * from "./submit-answer.js";
export * from "./generate-answer.js";
export * from "./reconnect.js";
export * from "./dispose.js";
// One action per spec transition, each committing its same-named transaction
// (`enterGame` commits `setGameDb`).
export * from "./start-host-signaling.js";
export * from "./start-join-signaling.js";
export * from "./set-offer-code.js";
export * from "./set-answer-code.js";
export * from "./set-banner.js";
export * from "./set-connection.js";
export * from "./set-host-answer-input.js";
export * from "./set-joiner-offer-input.js";
export * from "./enter-game.js";
