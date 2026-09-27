// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformed functions of this feature — every pure transform the spec verifies,
// and nothing else (helpers like `create`, `samples`, `startPosition`, `laneAt`, and
// `frogOutcome` are deliberately absent; each keeps its own `*.test.ts`). Its keys
// ARE the conformance surface: the manifest's coverage guard (`Conformance.feature`)
// requires exactly one `*.cases.ts` module per key here, so adding a transform
// without cases — or cases without a transform — fails to compile. `step` has no ecs
// transaction (the per-frame system loop conforms it in
// `system-database/tick-loop.test.ts`), so `checkFeature` simply skips it; the pure
// `checkSpec` still verifies it here.
export { hop } from "./hop.js";
export { step } from "./step.js";
export { winGoal } from "./win-goal.js";
export { loseLife } from "./lose-life.js";
export { newGame } from "./new-game.js";
