// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { RandomService } from "./random-service.js";

/**
 * Shape-only recording template for {@link RandomService} — a TEST-TIER double, NOT
 * re-exported through `public.ts`, so it can never be reached as
 * `RandomService.createFake` from runtime code. Conformance calls it once purely to
 * enumerate the service's methods; the RETURNS come from each case's `responses` (the
 * per-asteroid draws a `spawnRandomWave` case owns), so this file hardcodes no value
 * a case then has to guess at. `next` is a value method, so its placeholder is
 * inert. Imported directly by the conformance manifest (`data/state/spec.ts`) and the
 * system tick-loop test (as an inert `random` for a `State.step` that never draws).
 */
export const createFake = (): RandomService => ({
  serviceName: "random",
  next: () => 0,
});
