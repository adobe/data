// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Timing, AnalyticsService } from "./analytics-service.js";

/**
 * Published response for the deterministic double. `randomTodoRequested`
 * always resolves this exact {@link Timing} — consumers' tests rely on this
 * fixed value to compute their expected `after`, it is part of the double's
 * contract, not a hidden detail.
 */
export const fakeTiming: Timing = { startedAt: 0 };

/**
 * Deterministic test double for {@link AnalyticsService}. The `void`
 * fire-and-forget methods do nothing; `randomTodoRequested` resolves
 * {@link fakeTiming} on the microtask queue instead of reading the clock. This
 * is the implementation tests inject so their assertions are predictable —
 * see `features/services/index.md`.
 */
export const createFake = (): AnalyticsService => ({
  serviceName: "analytics",
  todoCreated: () => {},
  bulkTodosCreated: () => {},
  todoToggled: () => {},
  todoDeleted: () => {},
  allTodosCleared: () => {},
  displayCompletedToggled: () => {},
  randomTodoRequested: () => Promise.resolve(fakeTiming),
  randomTodoAdded: () => {},
});
