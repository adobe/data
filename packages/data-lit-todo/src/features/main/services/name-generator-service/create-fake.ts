// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { NameGeneratorService } from "./name-generator-service.js";

/**
 * Deterministic test double for {@link NameGeneratorService}. Unlike the real
 * generator it uses no randomness and no timers: `generateName` returns the
 * `responses` in order, cycling once exhausted, each resolved on the microtask
 * queue. A case that needs specific names passes its own `responses`; the
 * default is a harmless placeholder. This is the implementation tests inject so
 * their assertions are predictable — see `features/services/index.md`.
 */
export const createFake = (
  responses: readonly string[] = ["a task"],
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
