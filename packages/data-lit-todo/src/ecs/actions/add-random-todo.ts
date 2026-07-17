// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../service-database.js";

/**
 * Showcase of an async service inside an action: bracket the slow
 * name-generation call with analytics start/end events so the telemetry
 * captures how long the outbound call took, then commit the result through a
 * single transaction. The UI never awaits this — state flows back via
 * observables.
 */
export const addRandomTodo = async (db: ServiceDatabase) => {
  const start = performance.now();
  db.services.todoAnalytics.record("addRandomTodo.start");
  const name = await db.services.nameGenerator.generateName();
  db.transactions.createTodo({ name });
  db.services.todoAnalytics.record("addRandomTodo.end", {
    name,
    durationMs: Math.round(performance.now() - start),
  });
};
