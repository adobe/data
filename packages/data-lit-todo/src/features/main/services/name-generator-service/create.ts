// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { NameGeneratorService } from "./name-generator-service.js";

const adjectives = [
  "swift", "calm", "bright", "brave", "clever",
  "gentle", "bold", "quiet", "eager", "kind",
] as const;
const nouns = [
  "otter", "falcon", "willow", "cedar", "harbor",
  "meadow", "comet", "lantern", "river", "summit",
] as const;

const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];

/**
 * Fake generator that resolves after a randomized delay, simulating a
 * network-backed name service so the async boundary — and its latency — is
 * observable in analytics timings.
 */
export const create = (): NameGeneratorService => ({
  serviceName: "nameGenerator",
  generateName: () =>
    new Promise<string>((resolve) => {
      const delayMs = 100 + Math.floor(Math.random() * 300);
      setTimeout(() => resolve(`${pick(adjectives)} ${pick(nouns)}`), delayMs);
    }),
});
