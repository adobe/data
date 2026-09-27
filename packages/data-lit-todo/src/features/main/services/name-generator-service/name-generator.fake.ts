// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { NameGeneratorService } from "./name-generator-service.js";

/**
 * Shape-only recording template for {@link NameGeneratorService} — a TEST-TIER
 * double, NOT re-exported through `public.ts`. Conformance calls it once to
 * enumerate the service's methods; `generateName`'s returns come from each case's
 * `responses` schedule, not from any behavior here (the old double cycled a default
 * list, silently masking over-calls). Imported directly by the conformance manifest.
 */
export const createFake = (): NameGeneratorService => ({
  serviceName: "nameGenerator",
  generateName: () => Promise.resolve(""),
});
