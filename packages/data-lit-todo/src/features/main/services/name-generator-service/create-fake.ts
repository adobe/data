// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { NameGeneratorService } from "./name-generator-service.js";

/**
 * Published response schedule for the deterministic double. `generateName`
 * resolves with these names **in this exact order**, wrapping back to the start
 * once exhausted. Consumers' tests rely on this sequence to compute their
 * expected `after` — it is part of the double's contract, not a hidden detail.
 */
export const fakeNames = ["alpha task", "beta task", "gamma task"] as const;

/**
 * Deterministic test double for {@link NameGeneratorService}. Unlike the real
 * generator it uses no randomness and no timers: `generateName` returns the
 * `responses` in order (defaulting to {@link fakeNames}), cycling, each resolved
 * on the microtask queue. This is the implementation tests inject so their
 * assertions are predictable — see `features/services/index.md`.
 */
export const createFake = (
  responses: readonly string[] = fakeNames,
): NameGeneratorService => {
  let index = 0;
  return {
    serviceName: "nameGenerator",
    generateName: () => {
      const name = responses[index % responses.length];
      index += 1;
      return Promise.resolve(name);
    },
  };
};
