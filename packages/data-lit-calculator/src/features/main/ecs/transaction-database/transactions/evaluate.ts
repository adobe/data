// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Apply the pending operation by running the pure `State.evaluate` transform
// over the `calculator` resource and writing the result back.
export const evaluate = (t: CoreDatabase.Store) => {
  t.resources.calculator = State.evaluate(t.resources.calculator);
};
