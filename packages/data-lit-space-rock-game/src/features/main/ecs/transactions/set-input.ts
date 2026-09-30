// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Input } from "../../data/values/input/input.js";
import type { CoreDatabase } from "../core/core-database.js";

// Record the player's intent for upcoming ticks; the systems read it each frame.
export const setInput = (t: CoreDatabase.Store, input: Input): void => {
  t.resources.input = input;
};
