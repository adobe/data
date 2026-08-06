// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database/core-database.js";

/**
 * Seed the transaction `userId` on a test store — impersonating the peer identity
 * a live rebase-replay concurrency stamps at runtime (it is otherwise read-only,
 * set only when the game database is created). Test-only.
 */
export const seedUserId = (store: CoreDatabase.Store, userId: string): void => {
  Object.assign(store, { userId });
};
