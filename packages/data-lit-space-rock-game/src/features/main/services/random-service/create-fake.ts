// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { RandomService } from "./random-service.js";

/**
 * Fake {@link RandomService}, exported as `RandomService.createFake` (tree-shaken when
 * unused). Conformance calls it only to enumerate the service's methods; each case's
 * `responses` supply the draws. Standalone, `next` always returns 0.
 */
export const createFake = (): RandomService => ({
  serviceName: "random",
  next: () => 0,
});
