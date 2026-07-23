// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Input } from "../../../data/input/input.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Record the player's intent for upcoming ticks. The UI dispatches this on
// keydown/keyup; the step system reads the `input` resource each frame.
export const setInput = (t: CoreDatabase.Store, input: Input): void => {
  t.resources.input = input;
};
