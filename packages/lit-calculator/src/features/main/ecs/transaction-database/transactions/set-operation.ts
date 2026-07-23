// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Operation } from "../../../data/operation/operation.js";
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Arm an operation by applying the pure `State.setOperation` transform to the
// `calculator` resource and writing the result back.
export const setOperation = (t: CoreDatabase.Store, operation: Operation) => {
  t.resources.calculator = State.setOperation(t.resources.calculator, operation);
};
