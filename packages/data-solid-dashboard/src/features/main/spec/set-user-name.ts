// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Change the active user's name and record the change in the activity log.
export const setUserName = (
  state: Pick<State, "userName" | "log">,
  { name }: { name: string },
): Pick<State, "userName" | "log"> => ({
  userName: name,
  log: [...state.log, `Name changed to ${name}`],
});
