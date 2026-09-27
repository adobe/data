// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Empty the activity log. The counter and user name are left untouched — the
// runner keeps them, since this writes only `log`.
export const clearLog = (
  _state: Pick<State, "log">,
): Pick<State, "log"> => ({ log: [] });
