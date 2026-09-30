// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

// Raise the counter by one and log the new value.
export const increment = (t: CoreDatabase.Store) => {
  const count = t.resources.count + 1;
  t.resources.count = count;
  t.resources.log = [...t.resources.log, `Incremented to ${count}`];
};
