// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { RandomService } from "./random-service.js";

/**
 * The production random source: `next` delegates to `Math.random`. The ECS
 * `waves` system constructs this once and injects it into the `spawnRandomWave`
 * transaction, so live waves vary run to run. Tests inject
 * {@link RandomService.createFake} instead.
 */
export const create = (): RandomService => ({
  serviceName: "random",
  next: () => Math.random(),
});
