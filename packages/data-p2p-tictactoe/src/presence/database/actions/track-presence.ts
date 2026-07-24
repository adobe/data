// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../transaction-database.js";

/**
 * Pump a stream of normalised cursor positions into the synced presence
 * transient. The UI passes a positions generator factory (sourced from local
 * pointer events) and the action owns the fire-and-forget streaming
 * transaction, so the container never touches the full transactional surface.
 */
export const trackPresence = (
  db: TransactionDatabase,
  positions: () => AsyncGenerator<{ x: number; y: number }>,
) => {
  db.transactions.movePresence(positions).catch(() => undefined);
};
