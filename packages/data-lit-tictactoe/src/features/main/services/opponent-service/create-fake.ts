// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { OpponentService } from "./opponent-service.js";

/**
 * Published move schedule for the deterministic double. `selectMove` resolves
 * with these indices **in this exact order**, wrapping back to the start once
 * exhausted. Consumers' tests rely on this sequence to compute their expected
 * `after` — it is part of the double's contract, not a hidden detail.
 */
export const fakeMoves = [4, 0, 8, 2, 6] as const;

/**
 * Deterministic test double for {@link OpponentService}. Unlike the real
 * selector it uses no randomness and no timers: `selectMove` returns the
 * `moves` in order (defaulting to {@link fakeMoves}), cycling, each resolved on
 * the microtask queue. This is the implementation tests inject so their
 * assertions are predictable — see `features/services/index.md`.
 */
export const createFake = (
  moves: readonly number[] = fakeMoves,
): OpponentService => {
  let index = 0;
  return {
    serviceName: "opponent",
    selectMove: () => {
      const move = moves[index % moves.length];
      index += 1;
      return Promise.resolve(move);
    },
  };
};
