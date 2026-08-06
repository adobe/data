// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Applies `State.increment` to the resource slice it touches — the decision is
// the pure transform's, this only writes the diff back to the store.
export const increment = (t: CoreDatabase.Store) => {
  const next = State.increment({ count: t.resources.count, log: t.resources.log });
  t.resources.count = next.count;
  t.resources.log = next.log;
};
