// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TodoAnalyticsService } from "./todo-analytics-service.js";

const log = (message: string): void => console.log(`[todo-analytics] ${message}`);

/** Development implementation: owns the timing and formats each named event. */
export const create = (): TodoAnalyticsService => ({
  serviceName: "todoAnalytics",
  todoCreated: ({ name }) => log(`created todo "${name}"`),
  bulkTodosCreated: ({ count }) => log(`created ${count} todos`),
  todoToggled: () => log("toggled a todo's completion"),
  todoDeleted: () => log("deleted a todo"),
  allTodosCleared: () => log("cleared all todos"),
  displayCompletedToggled: () => log("toggled show-completed"),
  randomTodoRequested: async () => ({ startedAt: performance.now() }),
  randomTodoAdded: ({ timing, name }) =>
    log(`added random todo "${name}" in ${Math.round(performance.now() - timing.startedAt)}ms`),
});
