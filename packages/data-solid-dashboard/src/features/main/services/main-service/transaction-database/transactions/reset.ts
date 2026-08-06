// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const reset = (t: CoreDatabase.Store) => {
  const next = State.reset({ count: t.resources.count, log: t.resources.log });
  t.resources.count = next.count;
  t.resources.log = next.log;
};
