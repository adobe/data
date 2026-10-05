// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { NameGeneratorService } from "./name-generator-service.js";

/**
 * Fake {@link NameGeneratorService}, exported as `NameGeneratorService.createFake` (tree-shaken when unused).
 * Conformance calls it only to enumerate the service's methods; each case's
 * `responses` supply the returns.
 */
export const createFake = (): NameGeneratorService => ({
  serviceName: "nameGenerator",
  generateName: () => Promise.resolve(""),
});
