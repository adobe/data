// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Digit } from "../../../data/digit/digit.js";
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Type a digit into the calculator entry by applying the pure `State.inputDigit`
// transform to the `calculator` resource and writing the result back.
export const inputDigit = (t: CoreDatabase.Store, digit: Digit) => {
  t.resources.calculator = State.inputDigit(t.resources.calculator, digit);
};
