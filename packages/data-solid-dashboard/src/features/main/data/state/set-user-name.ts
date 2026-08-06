// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Change the active user's name and record the change in the activity log.
export const setUserName = <T extends Pick<State, "userName" | "log">>(
  state: T,
  { name }: { name: string },
): T => ({
  ...state,
  userName: name,
  log: [...state.log, `Name changed to ${name}`],
});
