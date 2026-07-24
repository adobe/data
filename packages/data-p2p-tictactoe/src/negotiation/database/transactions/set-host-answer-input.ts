// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

export const setHostAnswerInput = (
  t: CoreDatabase.Store,
  { value }: { value: string },
) => {
  t.resources.hostAnswerInput = value;
};
