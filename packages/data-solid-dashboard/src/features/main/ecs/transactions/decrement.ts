// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

// Lower the counter by one and log the new value; a no-op at zero.
export const decrement = (t: CoreDatabase.Store) => {
  if (t.resources.count <= 0) return;
  const count = t.resources.count - 1;
  t.resources.count = count;
  t.resources.log = [...t.resources.log, `Decremented to ${count}`];
};
