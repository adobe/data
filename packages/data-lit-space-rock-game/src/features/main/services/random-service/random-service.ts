// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Service } from "@adobe/data/service";

/**
 * Capability port that supplies pseudo-randomness to pure transitions. `next`
 * returns a number in `[0, 1)`, exactly like `Math.random`.
 *
 * Unlike the async capability contracts (`services/index.md` — network, model,
 * persistence ports whose members are async so they can cross a process
 * boundary), randomness has no outside-world latency, so this port is
 * intentionally **synchronous**: a transition that injects it
 * (`State.spawnRandomWave`) stays synchronous, and the game loop never awaits a
 * random number. It is still the seam consumers swap out under test — inject
 * {@link RandomService.createFake} and the transition becomes deterministic.
 */
export interface RandomService extends Service {
  next: () => number;
}

export * as RandomService from "./public.js";
