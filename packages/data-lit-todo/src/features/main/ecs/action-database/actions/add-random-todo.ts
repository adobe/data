// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

/**
 * Showcase of an async service inside an action: bracket the slow
 * name-generation call with analytics start/end events so the telemetry
 * captures how long the outbound call took, then commit the result through a
 * single transaction. The UI never awaits this — state flows back via
 * observables.
 */
export const addRandomTodo = async (db: ServiceDatabase) => {
  // The service owns timing: it mints an opaque token here and computes the
  // elapsed time when we hand it back — this action never sees the clock.
  const timing = await db.services.todoAnalytics.randomTodoRequested();
  const name = await db.services.nameGenerator.generateName();
  db.transactions.createTodo({ name });
  db.services.todoAnalytics.randomTodoAdded({ timing, name });
};
