// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { OpponentService } from "./opponent-service.js";

/**
 * Deterministic test double for {@link OpponentService}. Unlike the real
 * selector it uses no randomness and no timers: `selectMove` returns the
 * `moves` in order, cycling once exhausted, each resolved on the microtask
 * queue. A case that needs a specific schedule passes its own `moves`; the
 * default is a harmless placeholder. This is the implementation tests inject so
 * their assertions are predictable — see `features/services/index.md`.
 */
export const createFake = (moves: readonly number[] = [4]): OpponentService => {
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
