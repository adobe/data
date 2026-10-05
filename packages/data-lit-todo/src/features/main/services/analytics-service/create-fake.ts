// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AnalyticsService } from "./analytics-service.js";

/**
 * Fake {@link AnalyticsService}, exported as `AnalyticsService.createFake` (tree-shaken when unused).
 * Conformance calls it only to enumerate the service's methods; each case's
 * `responses` supply the returns.
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
