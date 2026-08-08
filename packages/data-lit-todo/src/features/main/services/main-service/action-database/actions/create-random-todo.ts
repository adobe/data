// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

/**
 * Efficient ecs counterpart to the pure `State.createRandomTodo` spec (which
 * injects the same `nameGenerator` port): here the port is reached through the
 * `services` facet and the append is an O(1) `createTodo` transaction rather
 * than a whole-`State` rebuild. This action additionally brackets the slow
 * name-generation call with analytics start/end events so the telemetry
 * captures how long the outbound call took. The UI never awaits this — state
 * flows back via observables.
 */
export const createRandomTodo = async (db: ServiceDatabase) => {
  // The service owns timing: it mints an opaque token here and computes the
  // elapsed time when we hand it back — this action never sees the clock.
  const timing = await db.services.analytics.randomTodoRequested();
  const name = await db.services.nameGenerator.generateName();
  db.transactions.createTodo({ name });
  db.services.analytics.randomTodoAdded({ timing, name });
};
