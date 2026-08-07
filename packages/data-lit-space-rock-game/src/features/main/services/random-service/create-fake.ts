// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { RandomService } from "./random-service.js";

/**
 * Deterministic test double for {@link RandomService}. Unlike the real source it
 * uses no `Math.random`: `next` returns the `sequence` in order, cycling once
 * exhausted. A case that needs specific draws passes its own `sequence`; the
 * default is a harmless placeholder. This is the implementation tests inject so
 * their assertions are predictable — see `features/services/index.md`.
 */
export const createFake = (
  sequence: readonly number[] = [0],
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
