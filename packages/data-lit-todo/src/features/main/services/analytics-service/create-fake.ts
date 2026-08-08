// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AnalyticsService } from "./analytics-service.js";

/**
 * Deterministic test double for {@link AnalyticsService}. The `void`
 * fire-and-forget methods do nothing; `randomTodoRequested` resolves a fixed
 * timing of `{ startedAt: 0 }` on the microtask queue instead of reading the
 * clock. A case that asserts on the timing references that literal directly.
 * This is the implementation tests inject so their
 * assertions are predictable — see `features/services/index.md`.
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
