// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Service } from "@adobe/data/service";
import { AsyncDataService } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";

/**
 * Async port that produces a human-friendly task name. Async so it can stand
 * in for a network- or model-backed generator — the latency across this
 * boundary is real and is what the analytics timings measure.
 */
export interface NameGeneratorService extends Service {
  generateName: () => Promise<string>;
}

// Contract conforms to the async-data-service pattern (async-only members).
type _Valid = Assert<AsyncDataService.IsValid<NameGeneratorService>>;

export * as NameGeneratorService from "./public.js";
