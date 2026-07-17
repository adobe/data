// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TodoAnalyticsService } from "./todo-analytics-service.js";

/** Development implementation: reports every interaction to the console. */
export const create = (): TodoAnalyticsService => ({
  serviceName: "todoAnalytics",
  record: (event, context) => {
    console.log(`[todo-analytics] ${event}`, context ?? {});
  },
});
