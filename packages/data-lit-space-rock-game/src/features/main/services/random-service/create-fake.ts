// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { RandomService } from "./random-service.js";

/**
 * Published response schedule for the deterministic double. `next` returns these
 * values **in this exact order**, wrapping back to the start once exhausted.
 * Consumers' tests rely on this sequence to compute their expected `after` — it
 * is part of the double's contract, not a hidden detail. Four entries so a wave
 * of `asteroidsFor(1) = 4` rocks draws exactly one full cycle (see
 * `spawn-random-wave.cases.ts`).
 */
export const fakeRandoms = [0, 0.5, 0.25, 0.75] as const;

/**
 * Deterministic test double for {@link RandomService}. Unlike the real source it
 * uses no `Math.random`: `next` returns the `sequence` in order (defaulting to
 * {@link fakeRandoms}), cycling once exhausted. This is the implementation tests
 * inject so their assertions are predictable — see `features/services/index.md`.
 */
export const createFake = (
  sequence: readonly number[] = fakeRandoms,
): RandomService => {
  let index = 0;
  return {
    serviceName: "random",
    next: () => {
      const value = sequence[index % sequence.length];
      index += 1;
      return value;
    },
  };
};
