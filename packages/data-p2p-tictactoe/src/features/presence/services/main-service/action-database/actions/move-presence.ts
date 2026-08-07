// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// App-facing realization of `State.movePresence`: commit one cursor move for the
// calling peer through a single (non-streaming) transaction dispatch. The peer
// identity (`mark`) is read by the transaction from the store's `userId`, so this
// takes only the plain `{ x, y }` payload. The live UI drives cursor updates as a
// stream via the `trackPresence` action; this discrete action is the same-named
// transition realization the conformance runner exercises.
export const movePresence = (db: TransactionDatabase, { x, y }: { x: number; y: number }) => {
  db.transactions.movePresence({ x, y });
};
