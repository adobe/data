// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Todo } from "../todo/todo.js";

// The full persistent application state as one immutable object — the
// specification the ECS implementation is verified against. `todos` is in
// display order.
export type State = {
  readonly todos: readonly Todo[];
  readonly displayCompleted: boolean;
};
export * as State from "./public.js";
