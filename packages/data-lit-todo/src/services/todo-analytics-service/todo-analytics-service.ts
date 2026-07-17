// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Service } from "@adobe/data/service";
import { AsyncDataService } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";
import type { Data } from "@adobe/data";

/**
 * Feature-specific analytics port. Every discrete user interaction is reported
 * through `record`; an action typically brackets a slow operation with a
 * start/end pair so timing can be derived. Fire-and-forget (`void`) so the UI
 * flow never awaits telemetry.
 */
export interface TodoAnalyticsService extends Service {
  record: (event: string, context?: Data) => void;
}

// Contract conforms to the async-data-service pattern (void / async members only).
type _Valid = Assert<AsyncDataService.IsValid<TodoAnalyticsService>>;

export * as TodoAnalyticsService from "./public.js";
