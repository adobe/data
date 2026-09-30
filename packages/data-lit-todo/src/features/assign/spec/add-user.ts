// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Add a user by (trimmed) name. A blank or already-taken name is a no-op, so user
// names stay unique. Mints the next id across both entity maps.
export const addUser = (
  state: Pick<State, "users" | "todos">,
  { name }: { readonly name: string },
): Pick<State, "users"> => {
  const trimmed = name.trim();
  const taken = [...state.users.values()].some((user) => user.name === trimmed);
  if (trimmed === "" || taken) return { users: state.users };
  const id = Math.max(0, ...state.users.keys(), ...state.todos.keys()) + 1;
  return { users: new Map(state.users).set(id, { user: true, name: trimmed }) };
};
