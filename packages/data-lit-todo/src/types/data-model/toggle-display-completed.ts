// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DataModel } from "./data-model.js";

export const toggleDisplayCompleted = <T extends Pick<DataModel, "displayCompleted">>(
  model: T,
): T => ({
  ...model,
  displayCompleted: !model.displayCompleted,
});
