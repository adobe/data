// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// No users and no todos.
export const create = (): State => ({ users: new Map(), todos: new Map() });
