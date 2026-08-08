// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const clearLog = (t: CoreDatabase.Store) => {
  const next = State.clearLog({ log: t.resources.log });
  t.resources.log = next.log;
};
