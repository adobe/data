// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformed transitions of this feature; its keys are the manifest's coverage
// surface (one `*.cases.ts` module per key). `createInitial`, `fireBullet` and
// `spawnRandomWave` pair with same-named actions; `step` is one frame of the systems.
// The sub-steps `step` and `createInitial` compose are in `helpers.ts`.
export { createInitial } from "./create-initial.js";
export { fireBullet } from "./fire-bullet.js";
export { spawnRandomWave } from "./spawn-random-wave.js";
export { step } from "./step.js";
