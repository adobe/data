// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { RandomService } from "./random-service.js";

/** The production random source: `next` delegates to `Math.random`. */
export const create = (): RandomService => ({
  serviceName: "random",
  next: () => Math.random(),
});
