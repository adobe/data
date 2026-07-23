// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Add a decimal point to the calculator entry by applying the pure
// `State.inputDecimal` transform to the `calculator` resource.
export const inputDecimal = (t: CoreDatabase.Store) => {
  t.resources.calculator = State.inputDecimal(t.resources.calculator);
};
