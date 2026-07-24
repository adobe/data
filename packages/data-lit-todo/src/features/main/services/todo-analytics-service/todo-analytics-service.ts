// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Service } from "@adobe/data/service";
import { AsyncDataService } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";

/**
 * Opaque handle returned by `randomTodoRequested` and handed straight back to
 * `randomTodoAdded`. The action treats it as a black box — it never inspects or
 * constructs one — so timing lives entirely in the service without the service
 * holding any state between the two calls.
 */
type Timing = { readonly startedAt: number };

/**
 * Feature-specific analytics port. One named method per user interaction, each
 * taking only the minimal strongly-typed data that event carries, passed as a
 * named-field object (never positional). The event vocabulary and log
 * formatting live in the implementation — callers just invoke the named method,
 * so no event-name strings or payload shaping leak into the actions.
 * Fire-and-forget (`void`) so the UI never awaits telemetry.
 */
export interface TodoAnalyticsService extends Service {
  todoCreated: (args: { readonly name: string }) => void;
  bulkTodosCreated: (args: { readonly count: number }) => void;
  todoToggled: () => void;
  todoDeleted: () => void;
  allTodosCleared: () => void;
  displayCompletedToggled: () => void;
  randomTodoRequested: () => Promise<Timing>;
  randomTodoAdded: (args: { readonly timing: Timing; readonly name: string }) => void;
}

// Contract conforms to the async-data-service pattern (void / async members only).
type _Valid = Assert<AsyncDataService.IsValid<TodoAnalyticsService>>;

export * as TodoAnalyticsService from "./public.js";
