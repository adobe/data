// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformed functions of this feature — every pure transform the spec verifies,
// and nothing else (helpers like `create`, `samples`, `createInitial`'s siblings,
// and `isGameOver` are not conformance transforms and keep their own `*.test.ts`).
// Its keys ARE the conformance surface: the manifest's coverage guard
// (`Conformance.feature`) requires exactly one `*.cases.ts` module per key here, so
// adding a transform without cases — or cases without a transform — fails to compile.
//
// The discrete transitions (`createInitial`, `fireBullet`, `spawnRandomWave`) pair
// with same-named ecs transactions/actions and are conformed by both `checkSpec` and
// `checkFeature`. The per-frame transitions (`spawnWave`, `stepShip`, `stepBullets`,
// `stepAsteroids`, `resolveBulletHits`, `resolveShipHits`, `step`) have no same-named
// ecs op — the system tick loop realizes them (conformed in
// `system-database/tick-loop.test.ts`) — so `checkFeature` skips them while
// `checkSpec` still verifies each against its pure function here.
export { createInitial } from "./create-initial.js";
export { fireBullet } from "./fire-bullet.js";
export { spawnWave } from "./spawn-wave.js";
export { spawnRandomWave } from "./spawn-random-wave.js";
export { stepShip } from "./step-ship.js";
export { stepBullets } from "./step-bullets.js";
export { stepAsteroids } from "./step-asteroids.js";
export { resolveBulletHits } from "./resolve-bullet-hits.js";
export { resolveShipHits } from "./resolve-ship-hits.js";
export { step } from "./step.js";
