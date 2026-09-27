// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AnalyticsService } from "./analytics-service.js";

/**
 * Shape-only recording template for {@link AnalyticsService} — a TEST-TIER double,
 * NOT re-exported through `public.ts`, so it can never be reached as
 * `AnalyticsService.createFake` from runtime code. Conformance calls it once purely
 * to enumerate the service's methods; the RETURNS come from each case's `responses`
 * (e.g. the `randomTodoRequested` timing the case owns), so this file no longer
 * hardcodes any value a case then has to guess at. Imported directly by the
 * conformance manifest (`data/state/spec.ts`) and nowhere else.
 */
export const createFake = (): AnalyticsService => ({
  serviceName: "analytics",
  todoCreated: () => {},
  bulkTodosCreated: () => {},
  todoToggled: () => {},
  todoDeleted: () => {},
  allTodosCleared: () => {},
  displayCompletedToggled: () => {},
  randomTodoRequested: () => Promise.resolve({ startedAt: 0 }),
  randomTodoAdded: () => {},
});
