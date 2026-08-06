// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";
import type { Derivation } from "./conformance-case.js";
import { anyNumber } from "./matchers.js";

// The todos the user should see, in display order: all of them when
// `displayCompleted`, otherwise only the incomplete ones.
export const visibleTodos = (
  state: Pick<State, "todos" | "displayCompleted">,
): readonly Todo[] =>
  state.displayCompleted
    ? state.todos
    : state.todos.filter((todo) => !todo.complete);

// Spec-owned cases, shared with the ecs `visibleTodos` computed. A derivation
// case is `{ input, value }`; `value` leaves ids open (`anyNumber`) and its order
// is significant (display order).
export const cases: Derivation<typeof visibleTodos> = [
  {
    name: "hides completed todos unless the completed view is on",
    input: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: true },
        { id: 3, name: "c", complete: false },
      ],
      displayCompleted: false,
    },
    value: [
      { id: anyNumber, name: "a", complete: false },
      { id: anyNumber, name: "c", complete: false },
    ],
  },
  {
    name: "shows every todo when the completed view is on",
    input: {
      todos: [
        { id: 1, name: "a", complete: false },
        { id: 2, name: "b", complete: true },
      ],
      displayCompleted: true,
    },
    value: [
      { id: anyNumber, name: "a", complete: false },
      { id: anyNumber, name: "b", complete: true },
    ],
  },
];
