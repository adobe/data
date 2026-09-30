// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Todo } from "../data/entities/todo.js";
// The todos the user should see, in display order (ascending `order`): all of them
// when `displayCompleted`, otherwise only the incomplete ones. Yields id-less
// values — identity is the `entities` key, so the visible list compares by content.
export const visibleTodos = (
  state: Pick<State, "entities" | "displayCompleted">,
): readonly Todo[] =>
  [...state.entities.values()]
    .filter((todo) => state.displayCompleted || !todo.complete)
    .sort((a, b) => a.order - b.order);
