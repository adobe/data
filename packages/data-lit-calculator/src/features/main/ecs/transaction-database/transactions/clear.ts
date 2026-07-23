// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Reset the calculator by replacing the `calculator` resource with the pure
// `State.clear` initial value.
export const clear = (t: CoreDatabase.Store) => {
  t.resources.calculator = State.clear();
};
