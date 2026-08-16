// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Todo } from "../todo/todo.js";

// The full persistent application state as one immutable object — the
// specification the ECS implementation is verified against. `entities` holds every
// todo keyed by a numeric id (identity is the key, never a value field); each
// value carries its own `order` for display sorting. `displayCompleted` is a
// singleton toggle.
export type State = {
  readonly displayCompleted: boolean;
  readonly entities: ReadonlyMap<number, Todo>;
};
export * as State from "./public.js";
